# Spawn 100,000 short-lived processes that each build a list, sum it, and
# exit. Count the garbage collections the whole system did meanwhile.
size = String.to_integer(List.first(System.argv()) || "50")
me = self()

{gcs_before, _, _} = :erlang.statistics(:garbage_collection)
for _ <- 1..100_000 do
  spawn(fn -> send(me, Enum.sum(Enum.to_list(1..size))) end)
end
for _ <- 1..100_000, do: (receive do: (_ -> :ok))
{gcs_after, _, _} = :erlang.statistics(:garbage_collection)

IO.puts("100000 processes, each summing a list of #{size}: #{gcs_after - gcs_before} garbage collections")
