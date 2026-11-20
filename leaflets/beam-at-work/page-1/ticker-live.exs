# A ticker prints every 100 ms. Press Enter to start a busy loop, fib(40),
# in a process of its own: about a second of work each. Press Enter as often
# as you like. Press q to quit.
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
  # Reads a key at a time. Each Enter spawns a busy loop and goes straight
  # back to listening.
  def loop(log, n) do
    case IO.getn("", 1) do
      "q" ->
        System.halt(0)

      key when key in ["\r", "\n"] ->
        spawn(fn ->
          log.("busy loop #{n} starts")
          Fib.fib(40)
          log.("busy loop #{n} ends")
        end)

        loop(log, n + 1)

      key when is_binary(key) ->
        loop(log, n)

      _eof_or_error ->
        System.halt(0)
    end
  end
end

# Raw mode hands over each key as it's pressed, without waiting for Enter
# (OTP 26 and later, in a terminal). It also stops the terminal turning "\n"
# into a new line at the left edge, so each line ends in "\r\n" too.
newline =
  case :shell.start_interactive({:noshell, :raw}) do
    :ok -> "\r\n"
    {:error, _not_a_terminal} -> "\n"
  end

start = System.monotonic_time(:millisecond)

log = fn message ->
  elapsed = System.monotonic_time(:millisecond) - start
  IO.write("#{String.pad_leading("#{elapsed}", 5)} ms  #{message}#{newline}")
end

log.("schedulers online: #{System.schedulers_online()}. Enter: busy loop. q: quit.")

spawn(fn ->
  :timer.send_interval(100, :tick)
  Ticker.loop(log, 1)
end)

Keyboard.loop(log, 1)
