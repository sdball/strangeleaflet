# The ticket server from the widget: calls that buy n tickets or ask how many
# are left, and a cast that adds some, traced with :sys so that each new state
# is printed.

defmodule Tickets do
  use GenServer

  @impl true
  def init(left) do
    {:ok, left}
  end

  @impl true
  def handle_call({:buy, n}, _from, left) when n <= left do
    {:reply, :ok, left - n}
  end

  def handle_call({:buy, _n}, _from, left) do
    {:reply, :sold_out, left}
  end

  def handle_call(:left, _from, left) do
    {:reply, left, left}
  end

  @impl true
  def handle_cast({:add, n}, left) do
    {:noreply, left + n}
  end
end

{:ok, server} = GenServer.start(Tickets, 3)
IO.puts("started, state #{:sys.get_state(server)}")
:sys.trace(server, true)

IO.puts("buy 2: #{inspect(GenServer.call(server, {:buy, 2}))}")
IO.puts("buy 2: #{inspect(GenServer.call(server, {:buy, 2}))}")
IO.puts("left: #{inspect(GenServer.call(server, :left))}")
IO.puts("add 3: #{inspect(GenServer.cast(server, {:add, 3}))}")
IO.puts("buy 2: #{inspect(GenServer.call(server, {:buy, 2}))}")
