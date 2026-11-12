# One process builds a list of 10 million pairs, all of it live, while
# six tickers each try to tick every 10 ms. Trace the builder's garbage
# collections, and measure how late the tickers' ticks were.
defmodule Builder do
  def loop(acc, 0), do: acc
  def loop(acc, n), do: loop([{n, n} | acc], n - 1)
end

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

builder = spawn(fn ->
  receive do: (:go -> :ok)
  list = Builder.loop([], 10_000_000)
  send(me, :built)
  receive do: (:stop -> length(list))
end)
:erlang.trace(builder, true, [:garbage_collection, :monotonic_timestamp])
Process.sleep(500)
send(builder, :go)

us = fn native -> System.convert_time_unit(native, :native, :microsecond) - t0 end
collect = fn collect, gcs, tickers ->
  if length(tickers) == 6 do
    {Enum.reverse(gcs), Enum.concat(tickers)}
  else
    receive do
      {:trace_ts, _, kind, _, ts} -> collect.(collect, [{kind, us.(ts)} | gcs], tickers)
      {:ticks, ticks} -> collect.(collect, gcs, [ticks | tickers])
      :built -> collect.(collect, gcs, tickers)
    end
  end
end
{events, ticks} = collect.(collect, [], [])
send(builder, :stop)

gcs = for [{kind, from}, {_, to}] <- Enum.chunk_every(events, 2), do: {kind, from, to}
ms = fn us -> div(us, 1000) end
{_, from, to} = Enum.max_by(gcs, fn {_, from, to} -> to - from end)
total = Enum.sum(for {_, from, to} <- gcs, do: to - from)
# A tick was held up by a collection if it was waiting while one ran.
during_gc? = fn {late, due} ->
  Enum.any?(gcs, fn {_, from, to} -> due - t0 < to and due - t0 + late > from end)
end
{during, other} = Enum.split_with(ticks, during_gc?)
worst = fn ticks -> ms.(Enum.max(Enum.map(ticks, &elem(&1, 0)), fn -> 0 end)) end

IO.puts("schedulers: #{System.schedulers_online()}, dirty CPU schedulers: #{:erlang.system_info(:dirty_cpu_schedulers_online)}")
IO.puts("builder's GCs: #{length(gcs)}, #{ms.(total)} ms in all, longest #{ms.(to - from)} ms")
IO.puts("ticks while the builder collected: #{length(during)}, worst #{worst.(during)} ms late")
IO.puts("ticks the rest of the time: #{length(other)}, worst #{worst.(other)} ms late")
