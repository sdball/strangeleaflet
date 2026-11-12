# Watch one process's garbage collections while it builds a list.
# Each step keeps one number (live) and makes a short list it never
# uses again (garbage).
defmodule Builder do
  def loop(acc, 0), do: acc
  def loop(acc, n) do
    _garbage = Enum.to_list(1..10)
    loop([n | acc], n - 1)
  end
end

n = String.to_integer(List.first(System.argv()) || "1000")
me = self()
pid = spawn(fn ->
  receive do: (:go -> :ok)
  list = Builder.loop([], n)
  send(me, :done)
  receive do: (:stop -> length(list))
end)
:erlang.trace(pid, true, [:garbage_collection])
send(pid, :go)

events = Stream.repeatedly(fn -> receive do: (m -> m) end)
         |> Enum.take_while(&(&1 != :done))
         |> Enum.map(fn {:trace, _, ev, info} -> {ev, Map.new(info)} end)

pad = fn x, n -> String.pad_leading("#{x}", n) end
IO.puts("sizes in words of 8 bytes      young heap         old heap")
for [{start, a}, {_, b}] <- Enum.chunk_every(events, 2) do
  kind = if start == :gc_major_start, do: "major", else: "minor"
  IO.puts("#{kind}   used #{pad.(a.heap_size, 4)} → #{pad.(b.heap_size, 4)} of #{pad.(b.heap_block_size, 4)}" <>
          "   used #{pad.(b.old_heap_size, 4)} of #{pad.(b.old_heap_block_size, 4)}")
end
send(pid, :stop)
