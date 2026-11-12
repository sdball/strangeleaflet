# A ticker prints every 100 ms. Press Enter to start a busy loop, fib(40),
# in a process of its own: about a second of work each. Press Enter as often
# as you like. Type q and Enter to quit.
#
#   elixir ticker-live.exs
#   elixir --erl "+S 1" ticker-live.exs    # the same, with one scheduler

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

defmodule Keyboard do
  # Each Enter spawns a busy loop and goes straight back to listening
  def loop(log, n) do
    case IO.gets("") do
      line when is_binary(line) ->
        if String.trim(line) == "q", do: System.halt(0)

        spawn(fn ->
          log.("busy loop #{n} starts")
          Fib.fib(40)
          log.("busy loop #{n} ends")
        end)

        loop(log, n + 1)

      _eof_or_error ->
        System.halt(0)
    end
  end
end

start = System.monotonic_time(:millisecond)

log = fn message ->
  elapsed = System.monotonic_time(:millisecond) - start
  IO.puts("#{String.pad_leading("#{elapsed}", 5)} ms  #{message}")
end

log.("schedulers online: #{System.schedulers_online()}. Enter: busy loop. q, Enter: quit.")

spawn(fn ->
  :timer.send_interval(100, :tick)
  Ticker.loop(log, 1)
end)

Keyboard.loop(log, 1)
