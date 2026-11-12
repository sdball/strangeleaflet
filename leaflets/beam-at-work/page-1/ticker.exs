# A ticker prints every 100 ms. At 350 ms a busy loop starts in another
# process and runs for about a second. Does the ticker keep ticking?
#
#   elixir ticker.exs
#   elixir --erl "+S 1" ticker.exs    # the same, with one scheduler

defmodule Fib do
  # The slow way on purpose: about 330 million calls for fib(40)
  def fib(n) when n < 2, do: n
  def fib(n), do: fib(n - 1) + fib(n - 2)
end

defmodule Ticker do
  def loop(log, n) do
    receive do
      :tick ->
        log.("tick #{n}")
        loop(log, n + 1)
    end
  end
end

start = System.monotonic_time(:millisecond)

log = fn message ->
  elapsed = System.monotonic_time(:millisecond) - start
  IO.puts("#{String.pad_leading("#{elapsed}", 4)} ms  #{message}")
end

log.("schedulers online: #{System.schedulers_online()}")

spawn(fn ->
  :timer.send_interval(100, :tick)
  Ticker.loop(log, 1)
end)

Process.sleep(350)
me = self()

spawn(fn ->
  log.("busy loop starts")
  Fib.fib(40)
  log.("busy loop ends")
  send(me, :done)
end)

receive do
  :done -> Process.sleep(350)
end
