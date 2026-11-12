# Record a run for page 3's widget: gc-alone.exs's builder and tickers,
# but each tick also builds a short list and throws it away, like a
# small request. Writes every tick and every garbage collection, with
# heap sizes, as JSON.
defmodule Builder do
  def loop(acc, 0), do: acc
  def loop(acc, n), do: loop([{n, n} | acc], n - 1)
end

defmodule Ticker do
  def run(due, stop, ticks) do
    now = System.monotonic_time(:microsecond)
    if now >= stop do
      ticks
    else
      Process.sleep(max(0, div(due - now, 1000)))
      late = System.monotonic_time(:microsecond) - due
      _request = Enum.sum(Enum.to_list(1..40))
      run(due + 10_000, stop, [[due, late] | ticks])
    end
  end
end

tickers_n = 3
me = self()
t0 = System.monotonic_time(:microsecond)
stop = t0 + 3_000_000
tickers = for _ <- 1..tickers_n do
  spawn(fn ->
    receive do: (:go -> :ok)
    send(me, {:ticks, self(), Ticker.run(t0 + 10_000, stop, [])})
  end)
end
builder = spawn(fn ->
  receive do: (:go -> :ok)
  list = Builder.loop([], 10_000_000)
  send(me, {:built, System.monotonic_time(:microsecond)})
  receive do: (:stop -> length(list))
end)
for p <- [builder | tickers], do: :erlang.trace(p, true, [:garbage_collection, :monotonic_timestamp])
for p <- tickers, do: send(p, :go)
Process.sleep(500)
send(builder, :go)

us = fn native -> System.convert_time_unit(native, :native, :microsecond) - t0 end
collect = fn collect, acc ->
  if map_size(acc.ticks) == tickers_n do
    acc
  else
    receive do
      {:trace_ts, pid, kind, info, ts} -> collect.(collect, %{acc | events: [{pid, kind, Map.new(info), us.(ts)} | acc.events]})
      {:ticks, pid, ticks} -> collect.(collect, %{acc | ticks: Map.put(acc.ticks, pid, ticks)})
      {:built, at} -> collect.(collect, %{acc | built: at - t0})
    end
  end
end
acc = collect.(collect, %{events: [], ticks: %{}, built: nil})
send(builder, :stop)

sizes = fn i -> [i.heap_size, i.heap_block_size, i.old_heap_size, i.old_heap_block_size] end
gcs_of = fn pid ->
  for [{_, kind, a, from}, {_, _, b, to}] <- acc.events |> Enum.filter(&(elem(&1, 0) == pid)) |> Enum.reverse() |> Enum.chunk_every(2) do
    [if(kind == :gc_major_start, do: "major", else: "minor"), from, to, sizes.(a), sizes.(b)]
  end
end

data = %{
  versions: "Elixir #{System.version()}, Erlang/OTP #{System.otp_release()}",
  schedulers: System.schedulers_online(),
  builder: %{started: 500_000, built: acc.built, gcs: gcs_of.(builder)},
  tickers: for(p <- tickers, do: %{ticks: Enum.reverse(acc.ticks[p]) |> Enum.map(fn [d, l] -> [d - t0, l] end), gcs: gcs_of.(p)})
}
File.write!(List.first(System.argv()) || "beam-run.json", JSON.encode!(data))
b = data.builder.gcs
IO.puts("builder: #{length(b)} GCs, longest #{Enum.max(Enum.map(b, fn [_, f, t | _] -> t - f end)) |> div(1000)} ms; " <>
  "tickers: #{Enum.map_join(data.tickers, " ", &"#{length(&1.gcs)} GCs, worst #{&1.ticks |> Enum.map(fn [_, l] -> l end) |> Enum.max() |> div(1000)} ms late;")}")
