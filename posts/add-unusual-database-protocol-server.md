---
title: Add UnusualDatabaseProtocolServer - sdball/protohackers
slug: add-unusual-database-protocol-server
published_date: 2023-01-11T12:03:00+00:00
tags: elixir, git blog, protohackers
publish: true
discoverable: true
is_page: false
---

Hey UDP! Fast, connection-less, order-less, state-less, error-prone
packets!

Ok maybe error-prone is too harsh, but I ran into errors with the
checks for this problem in which the Protohackers checks would
stop communicating with my server without any reason. I could still
query my server from other sources but the Protohackers checks just
didn't see any data.

The problem there could lie with my server, my fly.io server
configuration, fly.io's networking, the networking layers between
fly.io and Protohackers, Protohackers networking config, or the
Protohackers client. Or even a bunch of other places whee.

At any rate this was a very straightforward problem from the
application side. A little message splitting, a bit of data work,
no problem.

I took the opportunity to try out a server setup where I have an
`active: true` configuration. That means that instead of explicitly
receiving messages by calling `:gen_udp.recv` (or `:gen_tcp.recv`)
my server process will get the incoming network messages as Elixir
process messages.

I also leaned more into messages for handling the request/response
lifecycle for my GenServer instead of handling all of the interaction
at once.

How's that work? Let's walk through a couple requests.

The general flow

1. An incoming insert packet is handled by the `handle_info` function

(`handle_info` is the callback function that receives all Elixir
messages sent to the process)

2. That `handle_info` function recognizes a UDP packet and pulls apart
   the relevant networking details. Then it determines if the message
   is an insert or retrieve and sends itself a message with the relevant
   details necessary to complete that work.

Actually that's not quite true, instead of a low level Elixir message
I use `GenServer.cast` to asynchronously send the message at a
slightly higher level of abstraction. The effect is pretty much the
same.

3. The specific `handle_cast` function to apply is patterned matched.
   The `handle_cast` function does its specific work and updates the
   GenServer state.

All GenServer callbacks return the new GenServer state as part of
their contract. That state may be changed or unchanged depending on
the specific work of the function. For an insert's case the state is
changed with new database data structure after the insert has been
applied. For a retrieve's case the state is unchanged.

INSERT

1. An incoming insert packet is handled by the `handle_info` function

2. That `handle_info` function recognizes a UDP packet and pulls apart
   the relevant networking details. Then it determines the message is
   an insert and calls `GenServer.cast` to send an insert message with
   the details.

3. The specific `handle_cast` implementation for an insert is pattern
   matched. That function is only concerned with updating the database in
   the state.

RETRIEVE

1. An incoming retrieve packet is handled by the `handle_info`
   function

2. That `handle_info` function recognizes a UDP packet and pulls apart
   the relevant networking details. Then it determines the message is
   a retrieve and calls `GenServer.cast` to send an insert message with
   the details.

3. The specific `handle_cast` implementation for a retrieve is pattern
   matched. That function is only concerned with querying the database
   and sending a UDP packet back to the original message source.

VERSION

Nothing fancy here. "version" requests are specially recognized per
the spec and not even given a chance to incorrectly alter the database
because they get nowhere near the data handling.

This blog post was generated from commit [b5d001b228a3b4848b6bdc9eafec2535f7c58e1b on sdball/protohackers](https://github.com/sdball/protohackers/commit/b5d001b228a3b4848b6bdc9eafec2535f7c58e1b)

## added files

### lib/protohackers/unusual_database_protocol_server.ex

```elixir
defmodule Protohackers.UnusualDatabaseProtocolServer do
  @moduledoc """
  UDP-based key/value store implementation

  Since UDP does not provide retransmission of dropped packets clients have
  to be careful not to send requests too fast, and have to accept that some
  requests or responses may be dropped.

  Each request, and each response, is a single UDP packet.

  There are only two types of request: **insert** and **retrieve**. Insert
  allows a client to insert a value for a key, and retrieve allows a client to
  retrieve the value for a key.

  ## Insert

  A request is an insert if it contains an equals sign ("=", or ASCII 61).

  The first equals sign separates the key from the value. This means keys can
  not contain the equals sign. Other than the equals sign, keys can be made up
  of any arbitrary characters. The empty string is a valid key.

  Subsequent equals signs (if any) are included in the value. The value can be
  any arbitrary data, including the empty string.

  For example:

  * `foo=bar` will insert a key `foo` with value `bar`.
  * `foo=bar=baz` will insert a key `foo` with value `bar=baz`.
  * `foo=` will insert a key `foo` with an empty string value.
  * `foo===` will insert a key `foo` with value `==`.
  * `=foo` will insert a key of the empty string with value `foo`.

  If the server receives an insert request for a key that already exists, the
  stored value will be updated to the new value.

  An insert request does not yield a response.

  ## Retrieve

  A request that does not contain an equals sign is a retrieve request.

  In response to a retrieve request, the server will send back the key and its
  corresponding value, separated by an equals sign. Responses will be sent to
  the IP address and port number that the request originated from.

  If a requests is for a key that has been inserted multiple times, the server
  must return the most recent value.

  If a request attempts to retrieve a key for which no value exists, the server
  will not respond.

  ### Example request:

      message

  ### Example response:

      message=Hello,world!
  """

  use GenServer

  require Logger

  def start_link(port \\ 11239) do
    GenServer.start_link(__MODULE__, port)
  end

  defstruct [:open_socket, :supervisor, database: Map.new()]

  @impl true
  def init(port) do
    {:ok, supervisor} = Task.Supervisor.start_link(max_children: 100)

    bind_ip =
      if Mix.env() == :prod do
        {:ok, fly_global_services_ip} = :inet.getaddr('fly-global-services', :inet)
        fly_global_services_ip
      else
        {127, 0, 0, 1}
      end

    open_options = [
      mode: :binary,
      ip: bind_ip
    ]

    with {:ok, open_socket} <- :gen_udp.open(port, open_options) do
      Logger.info("Opened port #{port} for UnusualDatabaseProtocol Server on #{inspect(bind_ip)}")
      state = %__MODULE__{open_socket: open_socket, supervisor: supervisor}
      {:ok, state}
    else
      {:error, reason} ->
        {:stop, reason}
    end
  end

  @impl true
  def handle_info({:udp, socket, remote_ip, remote_port, message}, state) do
    cond do
      message == "version" ->
        GenServer.cast(self(), {:version, {socket, remote_ip, remote_port}})

      String.contains?(message, "=") ->
        GenServer.cast(self(), {:insert, message})

      true ->
        GenServer.cast(self(), {:retrieve, {socket, remote_ip, remote_port, message}})
    end

    {:noreply, state}
  end

  def handle_info(msg, state) do
    Logger.info("[UDP] Elixir message: #{inspect(msg)}")
    {:noreply, state}
  end

  @impl true
  def handle_cast({:insert, message}, state) do
    [key | value] = String.split(message, "=")
    value = Enum.join(value, "=")
    new_database = insert(state.database, key, value)
    Logger.info("[UDP] wrote #{key} / #{value} into the database")
    {:noreply, %{state | database: new_database}}
  end

  def handle_cast({:retrieve, {socket, ip, port, key}}, state) do
    with {:ok, value} <- retrieve(state.database, key) do
      response = key <> "=" <> value
      Logger.info("[UDP] sending #{response} for #{key} to #{inspect(ip)}:#{port}")
      :gen_udp.send(socket, ip, port, response)
    end

    {:noreply, state}
  end

  def handle_cast({:version, {socket, ip, port}}, state) do
    Logger.info("[UDP] sending version response to #{inspect(ip)}:#{port}")
    :gen_udp.send(socket, ip, port, "version=sdball unusual database protocol server v1")
    {:noreply, state}
  end

  def insert(database, key, value) do
    Map.put(database, key, value)
  end

  def retrieve(database, key) do
    case Map.get(database, key) do
      nil -> {:error, :missing}
      value -> {:ok, value}
    end
  end
end
```

### test/protohackers/unusual_database_protocol_server_test.exs

```elixir
defmodule Protohackers.UnusualDatabaseProtocolServerTest do
  use ExUnit.Case

  test "a client can write and retrieve a key/value" do
    key = "magic word"
    value = "xyzzy"

    {:ok, socket} = :gen_udp.open(11240, mode: :binary, active: false)

    # write the key/value
    :gen_udp.send(socket, ~c(localhost), 11239, Enum.join([key, value], "="))

    # wait for networking
    Process.sleep(50)

    # read the value
    :gen_udp.send(socket, ~c(localhost), 11239, key)
    {:ok, {_ip, _port, response}} = :gen_udp.recv(socket, 0)
    assert response == "magic word=xyzzy"
  end

  test "extra delimiters are treated as part of the value" do
    key = "hello"
    message = "hello=old=friend"

    {:ok, socket} = :gen_udp.open(11240, mode: :binary, active: false)

    # write the key/value
    :gen_udp.send(socket, ~c(localhost), 11239, message)

    # wait for networking
    Process.sleep(50)

    # read the value
    :gen_udp.send(socket, ~c(localhost), 11239, key)
    {:ok, {_ip, _port, response}} = :gen_udp.recv(socket, 0)
    assert response == message
  end

  test "an unset key returns nothing" do
    key = "plugh"

    {:ok, socket} = :gen_udp.open(11240, mode: :binary, active: false)

    # read the value
    :gen_udp.send(socket, ~c(localhost), 11239, key)
    {:error, :timeout} = :gen_udp.recv(socket, 0, 100)
  end
end
```

## modified files

### fly.toml

```diff
diff --git a/fly.toml b/fly.toml
index 0463b7f..2336f47 100644
--- a/fly.toml
+++ b/fly.toml
@@ -14,56 +14,100 @@ allowed_public_ports = []
 auto_rollback = true

 [[services]]
-http_checks = []
-internal_port = 11235
-processes = ["app"]
-protocol = "tcp"
-script_checks = []
+  http_checks = []
+  internal_port = 11235
+  processes = ["app"]
+  protocol = "tcp"
+  script_checks = []

-[[services.ports]]
-handlers = []
-port = "11235"
+  [[services.ports]]
+  handlers = []
+  port = "11235"
+
+  [services.concurrency]
+  hard_limit = 25
+  soft_limit = 20
+  type = "connections"
+
+  [[services.tcp_checks]]
+  grace_period = "15s"
+  interval = "30s"
+  restart_limit = 0
+  timeout = "2s"
+
+[[services]]
+  http_checks = []
+  internal_port = 11236
+  processes = ["app"]
+  protocol = "tcp"
+  script_checks = []
+
+  [[services.ports]]
+  handlers = []
+  port = "11236"
+
+  [services.concurrency]
+  hard_limit = 25
+  soft_limit = 20
+  type = "connections"
+
+  [[services.tcp_checks]]
+  grace_period = "15s"
+  interval = "30s"
+  restart_limit = 0
+  timeout = "2s"

 [[services]]
-http_checks = []
-internal_port = 11236
-processes = ["app"]
-protocol = "tcp"
-script_checks = []
+  http_checks = []
+  internal_port = 11237
+  processes = ["app"]
+  protocol = "tcp"
+  script_checks = []
+
+  [[services.ports]]
+  handlers = []
+  port = "11237"
+
+  [services.concurrency]
+  hard_limit = 25
+  soft_limit = 20
+  type = "connections"

-[[services.ports]]
-handlers = []
-port = "11236"
+  [[services.tcp_checks]]
+  grace_period = "15s"
+  interval = "30s"
+  restart_limit = 0
+  timeout = "2s"

 [[services]]
-http_checks = []
-internal_port = 11237
-processes = ["app"]
-protocol = "tcp"
-script_checks = []
+  http_checks = []
+  internal_port = 11238
+  processes = ["app"]
+  protocol = "tcp"
+  script_checks = []

-[[services.ports]]
-handlers = []
-port = "11237"
+  [[services.ports]]
+  handlers = []
+  port = "11238"
+
+  [services.concurrency]
+  hard_limit = 25
+  soft_limit = 20
+  type = "connections"
+
+  [[services.tcp_checks]]
+  grace_period = "15s"
+  interval = "30s"
+  restart_limit = 0
+  timeout = "2s"

 [[services]]
-http_checks = []
-internal_port = 11238
-processes = ["app"]
-protocol = "tcp"
-script_checks = []
-
-[[services.ports]]
-handlers = []
-port = "11238"
-
-[services.concurrency]
-hard_limit = 25
-soft_limit = 20
-type = "connections"
-
-[[services.tcp_checks]]
-grace_period = "15s"
-interval = "30s"
-restart_limit = 0
-timeout = "2s"
+  http_checks = []
+  internal_port = 11239
+  processes = ["app"]
+  protocol = "udp"
+  script_checks = []
+
+  [[services.ports]]
+  handlers = []
+  port = "11239"
```

### lib/protohackers/application.ex

```diff
diff --git a/lib/protohackers/application.ex b/lib/protohackers/application.ex
index ca1ba1b..bbe0391 100644
--- a/lib/protohackers/application.ex
+++ b/lib/protohackers/application.ex
@@ -9,7 +9,8 @@ defmodule Protohackers.Application do
       {Protohackers.EchoServer, 11235},
       {Protohackers.IsPrimeServer, 11236},
       {Protohackers.AssetPriceServer, 11237},
-      {Protohackers.ChatRoomServer, 11238}
+      {Protohackers.ChatRoomServer, 11238},
+      {Protohackers.UnusualDatabaseProtocolServer, 11239}
     ]

     opts = [strategy: :one_for_one, name: Protohackers.Supervisor]
```
