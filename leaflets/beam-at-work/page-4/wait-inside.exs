# Three buyers at once, two tickets, and the seller has to wait 100 ms on a
# payment in the middle of each sale. The seller is a plain process: a loop
# that receives a request, answers it, and calls itself with what's left.

defmodule Payments do
  def start, do: spawn(fn -> loop() end)

  # Send a charge with a fresh reference, and wait for the reply carrying it
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
  def start(left, payments), do: spawn(fn -> loop(left, payments) end)

  def buy(seller), do: ask(seller, :buy)
  def left(seller), do: ask(seller, :left)

  defp ask(seller, request) do
    ref = make_ref()
    send(seller, {request, self(), ref})
    receive do: ({^ref, reply} -> reply)
  end

  defp loop(left, payments) do
    receive do
      {:buy, from, ref} ->
        if left == 0 do
          send(from, {ref, :sold_out})
          loop(left, payments)
        else
          :paid = Payments.charge(payments) # takes 100 ms
          send(from, {ref, :ok})
          loop(left - 1, payments)
        end

      {:left, from, ref} ->
        send(from, {ref, left})
        loop(left, payments)
    end
  end
end

seller = Tickets.start(2, Payments.start())
start = System.monotonic_time(:millisecond)
me = self()

for buyer <- 1..3 do
  spawn(fn ->
    reply = Tickets.buy(seller)
    ms = System.monotonic_time(:millisecond) - start
    send(me, {:done, "#{ms} ms: buyer #{buyer}: #{inspect(reply)}"})
  end)
end

for _ <- 1..3, do: receive(do: ({:done, line} -> IO.puts(line)))
IO.puts("tickets left: #{Tickets.left(seller)}")
