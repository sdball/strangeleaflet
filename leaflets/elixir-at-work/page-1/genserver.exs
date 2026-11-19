# The same server as a GenServer.

defmodule Tickets do
  use GenServer

  def start(left), do: GenServer.start(__MODULE__, left)
  def buy(server), do: GenServer.call(server, :buy)

  @impl true
  def init(left), do: {:ok, left}

  @impl true
  def handle_call(:buy, _from, 0), do: {:reply, :sold_out, 0}
  def handle_call(:buy, _from, left), do: {:reply, :ok, left - 1}
end

{:ok, server} = Tickets.start(2)

for buyer <- 1..3 do
  IO.puts("buyer #{buyer}: #{inspect(Tickets.buy(server))}")
end
