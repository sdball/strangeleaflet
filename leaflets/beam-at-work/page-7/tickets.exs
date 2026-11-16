# Page 6's ticket server, started by a supervisor. A bad request crashes it,
# and the supervisor starts a new one, back where init/1 left it.

Logger.configure(level: :none)

defmodule Tickets do
  use GenServer

  def start_link(left), do: GenServer.start_link(__MODULE__, left, name: Tickets)

  def init(left), do: {:ok, left}

  def handle_call({:buy, n}, _from, left) when n <= left, do: {:reply, :ok, left - n}
  def handle_call({:buy, _n}, _from, left), do: {:reply, :sold_out, left}
  def handle_call(:left, _from, left), do: {:reply, left, left}

  def handle_cast({:add, n}, left), do: {:noreply, left + n}
end

IO.puts("child spec: #{inspect(Tickets.child_spec(10), charlists: :as_lists)}")

{:ok, _supervisor} = Supervisor.start_link([{Tickets, 10}], strategy: :one_for_one)

show = fn label ->
  IO.puts("#{label}: Tickets is #{inspect(Process.whereis(Tickets))}, #{GenServer.call(Tickets, :left)} left")
end

show.("started")
GenServer.call(Tickets, {:buy, 3})
GenServer.cast(Tickets, {:add, 5})
show.("bought 3, added 5")

GenServer.cast(Tickets, {:add, "5"})
Process.sleep(10)
show.("added \"5\"")
