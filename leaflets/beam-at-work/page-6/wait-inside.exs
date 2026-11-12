# Three buyers at once, two tickets, and the server has to wait 100 ms on a
# payment process in the middle of each sale.

defmodule Payments do
  def start, do: spawn(fn -> loop() end)

  def charge(payments) do
    ref = make_ref()
    send(payments, {:charge, self(), ref})
    receive do: ({^ref, reply} -> reply)
  end

  defp loop do
    receive do
      {:charge, from, ref} ->
        spawn(fn ->
          Process.sleep(100)
          send(from, {ref, :paid})
        end)

        loop()
    end
  end
end

defmodule Tickets do
  use GenServer

  def start(left, payments), do: GenServer.start(__MODULE__, {left, payments})
  def buy(server), do: GenServer.call(server, :buy)

  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_call(:buy, _from, {0, payments}), do: {:reply, :sold_out, {0, payments}}

  def handle_call(:buy, _from, {left, payments}) do
    :paid = Payments.charge(payments) # takes 100 ms
    {:reply, :ok, {left - 1, payments}}
  end
end

{:ok, server} = Tickets.start(2, Payments.start())
start = System.monotonic_time(:millisecond)
me = self()

for buyer <- 1..3 do
  spawn(fn ->
    reply = Tickets.buy(server)
    ms = System.monotonic_time(:millisecond) - start
    send(me, {:done, "#{ms} ms: buyer #{buyer}: #{inspect(reply)}"})
  end)
end

for _ <- 1..3, do: receive(do: ({:done, line} -> IO.puts(line)))
IO.puts("tickets left: #{elem(:sys.get_state(server), 0)}")
