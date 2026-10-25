---
title: Solving Protohackers Problem 6 - sdball/protohackers
slug: solving-protohackers-problem-6
published_date: 2023-01-16T21:03:00+00:00
tags: elixir, git blog, protohackers
publish: true
discoverable: true
is_page: false
---

This commit solves
[Protohackers Problem 6](https://protohackers.com/problem/6)

The problem was a huge jump up in complexity from problems 1-5, but
that's great because I learned a lot!

This time around I opted to roll my own "database" instead of leaning
on Registry and wow I appreciate Registry even more now.

I went down a few false paths with this application architecture.

One of my earlier attempts was to prematurely setup camera and
dispatcher as two separate kinds of client. That worked great in one
aspect: I was able to very clearly define the messages that each kind
of client would accept.

But a major sticking point was handling heartbeats. Both cameras and
dispatchers can request a heartbeat which is handled the same for each
client.

I didn't want to spin off special heartbeat handling so that meant I
was duplicating the heartbeat code in both Camera and Dispatcher.

That approach fell down quickly in the protohacker tests. It turns out
that it's expected that any unspecified clients can request heartbeats:
they don't need to identify as a camera or dispatcher first. That means
I'd have to duplicate and specially handle heartbeats in three places
and handoff operational heartbeats that were started before a client
identified itself. Not great at all.

So I reworked into having a single client that stores the type of
client as part of its state. I was still able to express invalid
messages based on the type of client with guards but now it doesn't
read quite as clearly. But the benefit of having one flow for
heartbeats more than outweighs that drawback.

Other than figuring out all of the business logic edges a major issue I
ran into was fly.io default limits.

With the default connection limits I'd run into a "broken pipe" failure
for the test of a big world.

```
[5big.test] FAIL:Broken Pipe (server disconnected unexpectedly)
```

Thanks to Andrea's insight that was straightforward to fix by
increasing the concurrently limits in my fly config from 20/25 to
200/250.

The code I have in this commit works and passes the Protohacker tests,
but next I need to (re)learn how to setup proper supervision trees
below the application's supervisor because I'm starting too much from
one init function.

This blog post was generated from commit: [aa7b04d0a771d6d0e0a896c93e5496cf77eff81f on sdball/protohackers](https://github.com/sdball/protohackers/commit/aa7b04d0a771d6d0e0a896c93e5496cf77eff81f)

## added files

### lib/protohackers/speed_limit_server.ex

```elixir
defmodule Protohackers.SpeedLimitServer do
  alias Protohackers.SpeedLimitServer.Client
  use GenServer
  require Logger

  def start_link(port \\ 11241) do
    GenServer.start_link(__MODULE__, port)
  end

  defstruct [:listen_socket, :supervisor]

  @impl true
  def init(port) do
    {:ok, supervisor} = Task.Supervisor.start_link(max_children: 500)
    {:ok, _database_pid} = Protohackers.SpeedLimitServer.Database.start_link()

    listen_options = [
      # receive data as binaries (instead of lists)
      mode: :binary,
      # only receive data from the socket by explicitly calling gen_tcp.recv
      active: false,
      # allow reusing the address if the listener crashes
      reuseaddr: true,
      # keep the peer socket open after the client closes its writes
      exit_on_close: false
    ]

    case :gen_tcp.listen(port, listen_options) do
      {:ok, listen_socket} ->
        Logger.info("Starting SpeedLimitServer on port #{port}")
        state = %__MODULE__{listen_socket: listen_socket, supervisor: supervisor}
        {:ok, state, {:continue, :accept}}

      {:error, reason} ->
        {:stop, reason}
    end
  end

  @impl true
  def handle_continue(:accept, %__MODULE__{} = state) do
    with {:ok, socket} <- :gen_tcp.accept(state.listen_socket),
         {:ok, pid} <- start_client(socket) do
      dbg(socket)
      dbg(pid)
      Logger.info("SLS.client_started pid=#{inspect(pid)}")
      :gen_tcp.controlling_process(socket, pid) |> dbg()
      {:noreply, state, {:continue, :accept}}
    else
      {:error, reason} ->
        Logger.error("[SpeedLimitServer] Unable to accept connection #{inspect(reason)}")
        {:stop, reason, state}
    end
  end

  defp start_client(socket) do
    Client.start(socket)
  end
end
```

### lib/protohackers/speed_limit_server/camera.ex

```elixir
defmodule Protohackers.SpeedLimitServer.Camera do
  defstruct [:road, :mile, :limit]

  def new(road, mile, limit) do
    %__MODULE__{road: road, mile: mile, limit: limit}
  end
end
```

### lib/protohackers/speed_limit_server/client.ex

```elixir
defmodule Protohackers.SpeedLimitServer.Client do
  alias Protohackers.SpeedLimitServer.{Camera, Dispatcher, PlateReading, Database}
  use GenServer
  require Logger

  @error 0x10
  @plate 0x20
  @ticket 0x21
  @want_heartbeat 0x40
  @heartbeat 0x41
  @camera 0x80
  @dispatcher 0x81

  defstruct [:socket, :heartbeat_interval, :camera, :dispatcher, buffer: ""]

  def start(socket) do
    GenServer.start(__MODULE__, socket: socket)
  end

  def start_link(socket) do
    GenServer.start_link(__MODULE__, socket: socket)
  end

  def send_ticket(pid, ticket) do
    GenServer.call(pid, {:ticket, ticket})
  end

  @impl true
  def init(socket: socket) do
    Logger.debug("SLS.Client.init pid=#{inspect(self())} socket=#{inspect(socket)}")

    state = %__MODULE__{
      socket: socket
    }

    activate(state.socket)

    {:ok, state}
  end

  @impl true
  def handle_continue(:process, state = %__MODULE__{}) do
    Logger.debug("SLS.ClientMessage.buffer #{inspect(state.buffer)}")

    case client_message(state.buffer) do
      {:ok, camera: camera, rest: rest} ->
        if is_nil(state.dispatcher) and is_nil(state.camera) do
          {:noreply, %{state | camera: camera, buffer: rest}, {:continue, :process}}
        else
          handle_client_error(state)
        end

      {:ok, dispatcher: dispatcher, rest: rest} ->
        if is_nil(state.dispatcher) and is_nil(state.camera) do
          :ok = Database.connect_dispatcher(self(), dispatcher.roads)
          {:noreply, %{state | dispatcher: dispatcher, buffer: rest}, {:continue, :process}}
        else
          handle_client_error(state)
        end

      {:ok, {:plate, plate, timestamp}, remaining} ->
        if state.camera do
          plate_reading =
            PlateReading.build(
              plate,
              timestamp,
              state.camera.road,
              state.camera.mile,
              state.camera.limit
            )

          Logger.info("SLS.Camera.plate_reading plate_reading=#{inspect(plate_reading)}")
          :ok = Database.plate_reading(plate_reading)
          {:noreply, %{state | buffer: remaining}, {:continue, :process}}
        else
          handle_client_error(state)
        end

      {:heartbeat, 0, remaining} ->
        {:noreply, %{state | heartbeat_interval: nil, buffer: remaining}, {:continue, :process}}

      {:heartbeat, interval, remaining} ->
        Process.send_after(self(), :heartbeat, interval)

        {:noreply, %{state | heartbeat_interval: interval, buffer: remaining},
         {:continue, :process}}

      :partial ->
        activate(state.socket)
        {:noreply, state}

      {:error, :invalid} ->
        handle_client_error(state)

      _unknown ->
        Logger.error("SLS.Camera.unknown_processing_result")
        handle_server_error(state)
    end
  end

  @impl true
  def handle_call({:ticket, ticket}, _from, state) do
    result = handle_send_ticket(state.socket, ticket)
    {:reply, result, state}
  end

  @impl true
  def handle_info({:tcp, _socket, message}, state) do
    new_state = %{state | buffer: state.buffer <> message}
    {:noreply, new_state, {:continue, :process}}
  end

  def handle_info({:tcp_closed, _port}, state = %{dispatcher: dispatcher})
      when not is_nil(dispatcher) do
    :ok = Database.disconnect_dispatcher(self())
    {:stop, :normal, state}
  end

  def handle_info({:tcp_closed, _port}, state) do
    {:stop, :normal, state}
  end

  # time to send the client a heartbeat
  def handle_info(:heartbeat, state)
      when not is_nil(state.heartbeat_interval) and state.heartbeat_interval > 0 do
    Logger.info("SLS.Client.send_heartbeat interval=#{state.heartbeat_interval}ms")
    handle_send_heartbeat(state.socket)
    Process.send_after(self(), :heartbeat, state.heartbeat_interval)
    {:noreply, state}
  end

  # time send the client a heartbeat but the client has cancelled the request
  def handle_info(:heartbeat, state) do
    {:noreply, state}
  end

  def handle_info(msg, state) do
    Logger.error("SLS.Client.unexpected_message message=#{inspect(msg)}")
    {:noreply, state}
  end

  # client message parsing
  def client_message(<<@camera, road::16, mile::16, limit::16, rest::binary>>) do
    Logger.info(
      "SLS.ClientMessage.camera road=#{inspect(road)} mile=#{inspect(mile)} limit=#{inspect(limit)}"
    )

    {:ok, camera: Camera.new(road, mile, limit), rest: rest}
  end

  def client_message(<<@camera, _rest::binary>>), do: :partial

  def client_message(<<@dispatcher, roads_count::8, rest::binary>>) do
    case rest do
      <<roads::binary-size(roads_count * 2), rest::binary>> ->
        Logger.info("SLS.ClientMessage.dispatcher roads=#{inspect(roads)}")
        {:ok, dispatcher: Dispatcher.new(roads), rest: rest}

      _incomplete ->
        :partial
    end
  end

  def client_message(<<@dispatcher, _rest::binary>>), do: :partial

  def client_message(<<@plate, length, rest::binary>>) do
    case rest do
      <<plate::binary-size(length), timestamp::32, remaining::binary>> ->
        Logger.info(
          "SLS.ClientMessage.plate plate=#{inspect(plate)} timestamp=#{inspect(timestamp)}"
        )

        {:ok, {:plate, plate, timestamp}, remaining}

      _incomplete ->
        :partial
    end
  end

  def client_message(<<@plate, _rest::binary>>), do: :partial

  def client_message(<<@want_heartbeat, interval_deciseconds::32, rest::binary>>) do
    millis = interval_deciseconds * 100
    Logger.info("SLS.ClientMessage.want_heartbeat deciseconds=#{interval_deciseconds}")
    {:heartbeat, millis, rest}
  end

  def client_message(<<@want_heartbeat, _rest::binary>>) do
    :partial
  end

  def client_message(""), do: :partial

  def client_message(_invalid), do: {:error, :invalid}

  defp handle_client_error(state) do
    Logger.info("SLS.Client.client_error")
    error = <<@error>> <> protocol_string("invalid client message")
    :gen_tcp.send(state.socket, error)
    :gen_tcp.shutdown(state.socket, :write)
    {:stop, :normal, state}
  end

  defp handle_server_error(state) do
    Logger.info("SLS.Client.server_error")
    error = <<@error>> <> protocol_string("server error")
    :gen_tcp.send(state.socket, error)
    :gen_tcp.shutdown(state.socket, :write)
    {:stop, :error, state}
  end

  defp handle_send_heartbeat(socket) do
    :gen_tcp.send(socket, <<@heartbeat>>)
  end

  defp handle_send_ticket(socket, ticket) do
    Logger.info("SLS.Client.send_ticket ticket=#{inspect(ticket)}")

    packet =
      <<@ticket>> <>
        protocol_string(ticket.plate) <>
        <<
          ticket.road::16,
          ticket.mile1::16,
          ticket.timestamp1::32,
          ticket.mile2::16,
          ticket.timestamp2::32,
          ticket.speed::16
        >>

    :gen_tcp.send(socket, packet)
  end

  defp protocol_string(string) do
    length = byte_size(string)
    <<length>> <> string
  end

  defp activate(socket) do
    Logger.debug("SLS.Client.activate_socket socket=#{inspect(socket)} pid=#{inspect(self())}")
    :inet.setopts(socket, active: :once)
  end
end
```

### lib/protohackers/speed_limit_server/database.ex

```elixir
defmodule Protohackers.SpeedLimitServer.Database do
  use GenServer
  require Logger
  alias Protohackers.SpeedLimitServer.{PlateReading, Observation, Ticket, Client}

  def start_link() do
    GenServer.start_link(__MODULE__, :ok, name: SpeedLimitServer.Database)
  end

  def plate_reading(plate_reading) do
    GenServer.cast(SpeedLimitServer.Database, {:plate, plate_reading})
  end

  def connect_dispatcher(dispatcher, roads) do
    GenServer.cast(
      SpeedLimitServer.Database,
      {:dispatcher_connect, dispatcher, roads}
    )
  end

  def disconnect_dispatcher(dispatcher) do
    GenServer.cast(
      SpeedLimitServer.Database,
      {:dispatcher_disconnect, dispatcher}
    )
  end

  # plate_readings : road => readings
  # tickets : road => tickets
  # dispatchers : road => dispatchers
  # tickets_index : MapSet : {day, plate}
  defstruct plate_readings: Map.new(),
            tickets: Map.new(),
            dispatchers: Map.new(),
            tickets_index: MapSet.new()

  @impl true
  def init(:ok) do
    database = %__MODULE__{}
    {:ok, database}
  end

  @impl true
  def handle_cast({:plate, reading = 3a6133732d42a1eefeb548acf0317083ae6a501elateReading{}}, database) do
    new_database =
      database
      |> maybe_ticket(reading)
      |> add_plate_reading(reading)

    {:noreply, new_database}
  end

  @impl true
  def handle_cast({:dispatcher_connect, dispatcher, roads}, database) do
    new_database =
      database
      |> add_dispatcher(dispatcher, roads)

    {:noreply, new_database, {:continue, {:new_dispatcher, roads}}}
  end

  def handle_cast({:dispatcher_disconnect, dispatcher}, database) do
    new_database =
      database
      |> remove_dispatcher(dispatcher)

    {:noreply, new_database}
  end

  @impl true
  def handle_continue({:new_dispatcher, roads}, database) do
    tickets_update =
      for road <- roads, ticket <- tickets_for_road(database, road), reduce: %{} do
        acc ->
          ticket =
            if ticket.submitted do
              ticket
            else
              dispatcher = random_dispatcher(database, road)
              Client.send_ticket(dispatcher, ticket)
              %{ticket | submitted: true}
            end

          Map.update(acc, road, [ticket], fn tickets ->
            [ticket | tickets]
          end)
      end

    new_tickets = Map.merge(database.tickets, tickets_update)

    {:noreply, %{database | tickets: new_tickets}}
  end

  def remove_dispatcher(database, dispatcher) do
    new_dispatchers =
      for {road, dispatchers} <- database.dispatchers, reduce: %{} do
        acc ->
          Map.put(acc, road, dispatchers |> Enum.reject(&(&1 == dispatcher)))
      end

    %{database | dispatchers: new_dispatchers}
  end

  def tickets_for_road(database, road) do
    Map.get(database.tickets, road, [])
  end

  def random_dispatcher(database, road) do
    case Map.get(database.dispatchers, road) do
      nil ->
        nil

      [] ->
        nil

      dispatchers ->
        Enum.random(dispatchers)
    end
  end

  def add_dispatcher(database, dispatcher, roads) do
    Logger.info(
      "SLS.Database.add_dispatcher dispatcher=#{inspect(dispatcher)} roads=#{inspect(roads)}"
    )

    new_dispatchers =
      for road <- roads, reduce: database.dispatchers do
        acc ->
          Map.update(acc, road, [dispatcher], fn dispatchers ->
            [dispatcher | dispatchers]
          end)
      end

    %{database | dispatchers: new_dispatchers}
  end

  def add_plate_reading(database, reading) do
    %{
      database
      | plate_readings:
          Map.update(database.plate_readings, reading.road, [reading], fn readings ->
            [reading | readings]
          end)
    }
  end

  def maybe_ticket(database, reading) do
    if already_ticketed_for_the_day?(database, reading) do
      Logger.info(
        "SLS.Database.already_ticketed plate=#{inspect(reading.plate)} day=#{reading.day}"
      )

      database
    else
      find_surrounding_pairs(database, reading)
      |> build_observations()
      |> reject_within_limit()
      |> reject_already_ticketed_days(database)
      |> sort_by_number_of_days_covered(:asc)
      |> List.first()
      |> case do
        nil ->
          database

        violation ->
          create_ticket(database, violation)
      end
    end
  end

  def build_observations(pairs) do
    Observation.from_pairs(pairs)
  end

  def create_ticket(database, violation) do
    Logger.info("SLS.Database.create_ticket violation=#{inspect(violation)}")
    ticket = Ticket.from_violation(violation)

    dispatcher = random_dispatcher(database, violation.road)

    ticket =
      if dispatcher do
        Client.send_ticket(dispatcher, ticket)
        %{ticket | submitted: true}
      else
        ticket
      end

    new_tickets =
      Map.update(database.tickets, ticket.road, [ticket], fn road_tickets ->
        [ticket | road_tickets]
      end)

    new_tickets_index =
      for day <- violation.days, reduce: database.tickets_index do
        acc -> MapSet.put(acc, {day, violation.plate})
      end

    %{database | tickets: new_tickets, tickets_index: new_tickets_index}
  end

  def sort_by_number_of_days_covered(observations, order) do
    observations
    |> Enum.sort_by(
      fn %{days: days} ->
        Enum.count(days)
      end,
      order
    )
  end

  def reject_already_ticketed_days(observations, database) do
    Enum.reject(observations, fn %{days: days, plate: plate} ->
      days
      |> Enum.to_list()
      |> Enum.any?(fn day ->
        already_ticketed_for_the_day?(database, %{plate: plate, day: day})
      end)
    end)
  end

  def already_ticketed_for_the_day?(database, %{plate: plate, day: day}) do
    MapSet.member?(database.tickets_index, {day, plate})
  end

  def find_surrounding_pairs(database, reading) do
    sorted_readings =
      sorted_readings_for_road_and_plate(
        database.plate_readings,
        reading.road,
        reading.plate
      )

    previous = find_previous_reading(sorted_readings, reading.timestamp)
    following = find_following_reading(sorted_readings, reading.timestamp)

    case {previous, following} do
      {nil, nil} -> []
      {nil, following} -> [{reading, following}]
      {previous, nil} -> [{previous, reading}]
      {previous, following} -> [{previous, reading}, {reading, following}]
    end
  end

  def sorted_readings_for_road_and_plate(plate_readings, road, plate) do
    plate_readings
    |> for_road(road)
    |> filter_plate(plate)
    |> sort_by_timestamp()
  end

  def for_road(readings, road) when is_map(readings) do
    readings |> Map.get(road, [])
  end

  def filter_plate(readings, plate) when is_list(readings) do
    readings
    |> Enum.filter(&(&1.plate == plate))
  end

  def sort_by_timestamp(readings) do
    Enum.sort_by(readings, & &1.timestamp)
  end

  def find_previous_reading(readings, timestamp) do
    readings
    |> Enum.filter(&(&1.timestamp < timestamp))
    |> List.last()
  end

  def find_following_reading(readings, timestamp) do
    readings
    |> Enum.filter(&(&1.timestamp > timestamp))
    |> List.first()
  end

  def reject_within_limit(observations) do
    observations
    |> Enum.filter(fn observation ->
      observation.speed > observation.limit
    end)
  end
end
```

### lib/protohackers/speed_limit_server/dispatcher.ex

```elixir
defmodule Protohackers.SpeedLimitServer.Dispatcher do
  defstruct [:roads]

  def new(roads_bytes) do
    roads = parse_roads(roads_bytes)
    %__MODULE__{roads: roads}
  end

  def parse_roads(bytes) do
    bytes
    |> :binary.bin_to_list()
    |> Enum.chunk_every(2)
    |> Enum.map(fn chunk ->
      <<road::16>> = :binary.list_to_bin(chunk)
      road
    end)
  end
end
```

### lib/protohackers/speed_limit_server/observation.ex

```elixir
defmodule Protohackers.SpeedLimitServer.Observation do
  defstruct [:days, :speed, :limit, :road, :plate, :reading1, :reading2]

  def new() do
    %__MODULE__{}
  end

  def new(reading1, reading2) do
    new()
    |> add_readings(reading1, reading2)
  end

  def add_readings(observation, reading1, reading2) do
    {r1, r2} =
      if reading1.timestamp < reading2.timestamp do
        {reading1, reading2}
      else
        {reading2, reading1}
      end

    %{observation | reading1: r1, reading2: r2, limit: r1.limit, plate: r1.plate, road: r1.road}
    |> calculate_average_speed()
    |> calculate_days_covered()
  end

  def calculate_average_speed(observation = %{reading1: r1, reading2: r2}) do
    distance = (r1.mile - r2.mile) |> abs()
    time = r2.timestamp - r1.timestamp
    mph = calculate_mph(distance, time)
    %{observation | speed: mph}
  end

  def calculate_days_covered(observation = %{reading1: r1, reading2: r2}) do
    %{observation | days: r1.day..r2.day}
  end

  def from_pairs(pairs) do
    pairs
    |> Enum.map(fn {r1, r2} ->
      new(r1, r2)
    end)
  end

  def calculate_mph(distance, time), do: distance / time * 3600
end
```

### lib/protohackers/speed_limit_server/plate_reading.ex

```elixir
defmodule Protohackers.SpeedLimitServer.PlateReading do
  defstruct [:plate, :timestamp, :road, :mile, :limit, :day]

  def build(plate, timestamp, road, mile, limit) do
    %__MODULE__{
      plate: plate,
      timestamp: timestamp,
      road: road,
      mile: mile,
      limit: limit,
      day: day(timestamp)
    }
  end

  def day(timestamp), do: floor(timestamp / 86400)
end
```

### lib/protohackers/speed_limit_server/ticket.ex

```elixir
defmodule Protohackers.SpeedLimitServer.Ticket do
  defstruct [:plate, :road, :mile1, :timestamp1, :mile2, :timestamp2, :speed, submitted: false]

  def new() do
    %__MODULE__{}
  end

  def from_violation(violation) do
    %__MODULE__{
      plate: violation.plate,
      road: violation.road,
      mile1: violation.reading1.mile,
      timestamp1: violation.reading1.timestamp,
      mile2: violation.reading2.mile,
      timestamp2: violation.reading2.timestamp,
      speed: (violation.speed * 100) |> trunc()
    }
  end
end
```

### test/protohackers/speed_limit_server_test.exs

```elixir
defmodule Protohackers.SpeedLimitServerTest do
  use ExUnit.Case

  def camera(road: road, mile: mile, limit: limit) do
    <<0x80, road::16, mile::16, limit::16>>
  end

  def dispatcher(roads: roads) do
    roads_binary =
      for road <- roads, reduce: <<>> do
        acc -> acc <> <<road::16>>
      end

    <<0x81, Enum.count(roads)::8, roads_binary::binary>>
  end

  def plate_reading(plate, timestamp: timestamp) do
    <<0x20, byte_size(plate)::8, plate::binary, timestamp::32>>
  end

  def heartbeat(millis: ms) do
    deciseconds = (ms / 100) |> trunc
    <<0x40, deciseconds::32>>
  end

  describe "integration tests" do
    test "example from docs" do
      # camera at mile 8
      {:ok, client1} = :gen_tcp.connect('localhost', 11241, mode: :binary, active: false)
      :gen_tcp.send(client1, camera(road: 123, mile: 8, limit: 60))

      # plate observed at mile 8
      :gen_tcp.send(client1, plate_reading("UN1X", timestamp: 0))

      # camera at mile 9
      {:ok, client2} = :gen_tcp.connect('localhost', 11241, mode: :binary, active: false)
      :gen_tcp.send(client2, camera(road: 123, mile: 9, limit: 60))

      # plate observed at mile 9
      :gen_tcp.send(client2, plate_reading("UN1X", timestamp: 45))

      # dispatcher for road 123
      {:ok, dispatcher} = :gen_tcp.connect('localhost', 11241, mode: :binary, active: false)
      :gen_tcp.send(dispatcher, dispatcher(roads: [123]))

      {:ok, response} = :gen_tcp.recv(dispatcher, 0, 5000)

      # ticket with correct info sent to dispatcher
      # Ticket{plate: "UN1X", road: 123, mile1: 8, timestamp1: 0, mile2: 9, timestamp2: 45, speed: 8000}
      assert response ==
               <<0x21, 0x04, 0x55, 0x4E, 0x31, 0x58, 0x00, 0x7B, 0x00, 0x08, 0x00, 0x00, 0x00,
                 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x2D, 0x1F, 0x40>>
    end

    test "client heartbeat requests" do
      {:ok, client} = :gen_tcp.connect('localhost', 11241, mode: :binary, active: false)
      :gen_tcp.send(client, heartbeat(millis: 100))

      # got a heartbeat
      {:ok, response} = :gen_tcp.recv(client, 0, 500)
      assert response == <<0x41>>

      # got a heartbeat
      {:ok, response} = :gen_tcp.recv(client, 0, 500)
      assert response == <<0x41>>

      # cancel heartbeats
      :gen_tcp.send(client, heartbeat(millis: 0))
      assert {:error, :timeout} == :gen_tcp.recv(client, 0, 500)
    end

    test "a single car" do
      # road=7399 mile=6002 limit=100
      msg_camera1 =
        <<128, 28, 231, 23, 114, 0, 100, 32, 7, 86, 89, 52, 52, 82, 72, 66, 0, 4, 97, 231>>

      # plate="VY44RHB" timestamp=287207
      msg_plate1 = <<32, 7, 86, 89, 52, 52, 82, 72, 66, 0, 4, 97, 231>>

      # road=7399 mile=6012 limit=100
      msg_camera2 =
        <<128, 28, 231, 23, 124, 0, 100, 32, 7, 86, 89, 52, 52, 82, 72, 66, 0, 4, 99, 19>>

      # plate="VY44RHB" timestamp=287507
      msg_plate2 = <<32, 7, 86, 89, 52, 52, 82, 72, 66, 0, 4, 99, 19>>

      # dispatcher roads=[7399]
      msg_dispatcher = <<129, 1, 28, 231>>

      {:ok, camera1} = :gen_tcp.connect('localhost', 11241, mode: :binary, active: false)
      :gen_tcp.send(camera1, msg_camera1)
      :gen_tcp.send(camera1, msg_plate1)

      {:ok, camera2} = :gen_tcp.connect('localhost', 11241, mode: :binary, active: false)
      :gen_tcp.send(camera2, msg_camera2)
      :gen_tcp.send(camera2, msg_plate2)

      {:ok, dispatcher} = :gen_tcp.connect('localhost', 11241, mode: :binary, active: false)
      :gen_tcp.send(dispatcher, msg_dispatcher)

      {:ok, response} = :gen_tcp.recv(dispatcher, 0, 5000)

      # ticket= plate: "VY44RHB", road: 7399, mile1: 6002, timestamp1: 287207, mile2: 6012, timestamp2: 287507, speed: 12000
      assert response ==
               <<33, 7, 86, 89, 52, 52, 82, 72, 66, 28, 231, 23, 114, 0, 4, 97, 231, 23, 124, 0,
                 4, 99, 19, 46, 224>>
    end
  end
end
```

## modified files

### fly.toml

```diff
diff --git a/fly.toml b/fly.toml
index 60cce3a..2b1b7b1 100644
--- a/fly.toml
+++ b/fly.toml
@@ -123,9 +123,20 @@ auto_rollback = true
   handlers = []
   port = "11240"

+[[services]]
+  http_checks = []
+  internal_port = 11241
+  processes = ["app"]
+  protocol = "tcp"
+  script_checks = []
+
+  [[services.ports]]
+  handlers = []
+  port = "11241"
+
   [services.concurrency]
-  hard_limit = 25
-  soft_limit = 20
+  hard_limit = 250
+  soft_limit = 200
   type = "connections"

   [[services.tcp_checks]]
```

### lib/protohackers/application.ex

```diff
diff --git a/lib/protohackers/application.ex b/lib/protohackers/application.ex
index 8f6a667..efd1d08 100644
--- a/lib/protohackers/application.ex
+++ b/lib/protohackers/application.ex
@@ -11,7 +11,8 @@ defmodule Protohackers.Application do
       {Protohackers.AssetPriceServer, 11237},
       {Protohackers.ChatRoomServer, 11238},
       {Protohackers.UnusualDatabaseProtocolServer, 11239},
-      {Protohackers.MobInTheMiddleServer, 11240}
+      {Protohackers.MobInTheMiddleServer, 11240},
+      {Protohackers.SpeedLimitServer, 11241}
     ]

     opts = [strategy: :one_for_one, name: Protohackers.Supervisor]
```
