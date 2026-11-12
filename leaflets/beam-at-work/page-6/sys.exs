# What :sys can do to any GenServer, with no code in the server for it.

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

IO.puts("get_state: #{:sys.get_state(server)}")

:sys.trace(server, true)
:sys.statistics(server, true)
Tickets.buy(server)
Tickets.buy(server)
Tickets.buy(server)
:sys.trace(server, false)
{:ok, stats} = :sys.statistics(server, :get)
IO.puts("statistics: #{inspect(Keyword.take(stats, [:messages_in, :messages_out]))}")

:sys.replace_state(server, fn _ -> 1 end)
IO.puts("replace_state, then get_state: #{:sys.get_state(server)}")

:sys.suspend(server)
buyer = Task.async(fn -> Tickets.buy(server) end)
Process.sleep(1_000)
{:message_queue_len, waiting} = Process.info(server, :message_queue_len)
IO.puts("suspended for 1 s: #{waiting} request waiting")
:sys.resume(server)
IO.puts("resumed: the buyer got #{inspect(Task.await(buyer))}")
