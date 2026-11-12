# die-young.exs again, but tracing every new process's garbage collections,
# to count the children's own: how many of the system's collections were
# theirs?
#
#   elixir children-gcs.exs 50

size = String.to_integer(List.first(System.argv()))
me = self()
counter = spawn(fn ->
  loop = fn loop, n -> receive do
    {:trace, _, :gc_minor_end, _} -> loop.(loop, n + 1)
    {:trace, _, :gc_major_end, _} -> loop.(loop, n + 1)
    {:trace, _, _, _} -> loop.(loop, n)
    {:count, from} -> send(from, {:children, n})
  end end
  loop.(loop, 0)
end)
:erlang.trace(:new_processes, true, [:garbage_collection, {:tracer, counter}])
{before, _, _} = :erlang.statistics(:garbage_collection)
for _ <- 1..100_000, do: spawn(fn -> send(me, Enum.sum(Enum.to_list(1..size))) end)
for _ <- 1..100_000, do: (receive do: (n when is_integer(n) -> :ok))
{later, _, _} = :erlang.statistics(:garbage_collection)
:erlang.trace(:new_processes, false, [:garbage_collection])
Process.sleep(200)
send(counter, {:count, self()})
receive do: ({:children, n} -> IO.puts("size #{size}: system #{later - before}, children's #{n}"))
