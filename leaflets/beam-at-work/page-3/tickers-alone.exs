# gc-alone.exs's six tickers with no builder: how late do they tick
# with nothing else running?
defmodule Ticker do
  # Returns every tick as {how late it was, when it was due}, in µs.
  def run(due, stop, ticks) do
    now = System.monotonic_time(:microsecond)
    if now >= stop do
      ticks
    else
      Process.sleep(max(0, div(due - now, 1000)))
      late = System.monotonic_time(:microsecond) - due
      run(due + 10_000, stop, [{late, due} | ticks])
    end
  end
end

me = self()
t0 = System.monotonic_time(:microsecond)
for _ <- 1..6, do: spawn(fn -> send(me, {:ticks, Ticker.run(t0 + 10_000, t0 + 4_000_000, [])}) end)
ticks = Enum.flat_map(1..6, fn _ -> receive do: ({:ticks, ticks} -> ticks) end)

lates = Enum.map(ticks, &elem(&1, 0))
IO.puts("ticks: #{length(ticks)}, worst #{div(Enum.max(lates), 1000)} ms late, " <>
        "#{Enum.count(lates, &(&1 >= 2000))} of them 2 ms late or more")
