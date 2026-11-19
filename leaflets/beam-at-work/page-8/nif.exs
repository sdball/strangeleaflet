# Page 1's experiment again, with the busy loop in C: a ticker prints every
# 100 ms, and at 350 ms another process calls fib as a NIF. Run it as
#   elixir nif.exs fib          the ordinary NIF
#   elixir nif.exs dirty_fib    the same function, marked dirty
# This compiles fib_nif.c first, so it needs a C compiler (this is macOS's).

include = Path.join([:code.root_dir(), "usr", "include"])
{_, 0} = System.cmd("cc", ~w(-O2 -shared -undefined dynamic_lookup -I #{include} -o fib_nif.so fib_nif.c))

defmodule Fib do
  @on_load :load
  def load, do: :erlang.load_nif(~c"./fib_nif", 0)
  def fib(_n), do: :erlang.nif_error(:not_loaded)
  def dirty_fib(_n), do: :erlang.nif_error(:not_loaded)
end

defmodule Ticker do
  # n counts the ticks that ran. The clock says how many were due.
  def loop(log, elapsed, n) do
    receive do
      :tick ->
        at = elapsed.()
        log.("tick #{n} (#{div(at, 100)} due)", at)
        loop(log, elapsed, n + 1)
    end
  end
end

which = String.to_atom(List.first(System.argv()) || "fib")
n = 44

start = System.monotonic_time(:millisecond)
elapsed = fn -> System.monotonic_time(:millisecond) - start end
log = fn message, at -> IO.puts("#{String.pad_leading("#{at}", 4)} ms  #{message}") end

log.("schedulers online: #{System.schedulers_online()}, dirty CPU schedulers: #{:erlang.system_info(:dirty_cpu_schedulers_online)}", elapsed.())

spawn(fn ->
  :timer.send_interval(100, :tick)
  Ticker.loop(log, elapsed, 1)
end)

Process.sleep(350)
me = self()

spawn(fn ->
  log.("busy loop starts: #{which}(#{n}), in C", elapsed.())
  apply(Fib, which, [n])
  log.("busy loop ends", elapsed.())
  send(me, :done)
end)

receive do
  :done -> Process.sleep(350)
end
