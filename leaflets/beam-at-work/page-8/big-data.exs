# Page 3's builder, two ways: keeping 10 million pairs in its own heap, and
# putting them in an ETS table instead. For each, how long the building took,
# and the garbage collections the builder did while building.
#   elixir big-data.exs heap
#   elixir big-data.exs ets

defmodule Build do
  def heap(acc, 0), do: acc
  def heap(acc, n), do: heap([{n, n} | acc], n - 1)

  def ets(table, 0), do: table
  def ets(table, n) do
    :ets.insert(table, {n, n})
    ets(table, n - 1)
  end
end

mode = List.first(System.argv()) || "heap"
me = self()

builder = spawn(fn ->
  receive do: (:go -> :ok)
  start = System.monotonic_time()
  data =
    case mode do
      "heap" -> Build.heap([], 10_000_000)
      "ets" -> Build.ets(:ets.new(:pairs, [:set]), 10_000_000)
    end
  done = System.monotonic_time()
  {:total_heap_size, words} = Process.info(self(), :total_heap_size)
  table = if mode == "ets", do: :ets.info(data, :memory), else: 0
  # Raw numbers only: making a report here could need room on a full heap,
  # and start one more collection after the building is over
  send(me, {:built, start, done, words, table})
  receive do: (:stop -> data)
end)
:erlang.trace(builder, true, [:garbage_collection, :monotonic_timestamp])
send(builder, :go)

collect = fn collect, events ->
  receive do
    {:trace_ts, _, kind, _, ts} -> collect.(collect, [{kind, ts} | events])
    {:built, start, done, words, table} -> {Enum.reverse(events), start, done, words, table}
  end
end
{events, start, done, words, table} = collect.(collect, [])
send(builder, :stop)

ms = fn native -> System.convert_time_unit(native, :native, :microsecond) / 1000 end
mb = fn words -> div(words * 8, 1_048_576) end
longest = fn ms -> if ms < 1, do: "under 1 ms", else: "#{round(ms)} ms" end
# The collections that started while it was building
durations = for [{_, from}, {_, to}] <- Enum.chunk_every(events, 2), from < done, do: ms.(to - from)

IO.puts("#{mode}: built in #{round(ms.(done - start))} ms; the builder's heaps #{mb.(words)} MB" <>
        if(mode == "ets", do: ", the table #{mb.(table)} MB", else: ""))
IO.puts("  its GCs while building: #{length(durations)}, #{round(Enum.sum(durations))} ms in all, longest #{longest.(Enum.max(durations, fn -> 0 end))}")
