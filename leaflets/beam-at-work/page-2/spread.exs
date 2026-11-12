# Spawn 16 busy processes from one parent and watch where they go: the run
# queue lengths just before and just after spawning, which scheduler each
# process first ran on, and how many processes each scheduler has half a
# second later.
defmodule Busy do
  def spin(until) do
    if System.monotonic_time(:millisecond) < until, do: spin(until), else: :ok
  end
end

row = fn numbers -> Enum.map_join(numbers, " ", &String.pad_leading("#{&1}", 2)) end
per_scheduler = fn what -> Enum.take(:erlang.statistics(what), System.schedulers_online()) end

me = self()
IO.puts("parent is on scheduler #{:erlang.system_info(:scheduler_id)}")
before = per_scheduler.(:run_queue_lengths)

for i <- 1..16 do
  spawn(fn ->
    send(me, {i, :erlang.system_info(:scheduler_id)})
    Busy.spin(System.monotonic_time(:millisecond) + 1000)
  end)
end

just_after = per_scheduler.(:run_queue_lengths)
Process.sleep(500)
later = per_scheduler.(:active_tasks)
first = for _ <- 1..16, do: (receive do: ({i, s} -> {i, s}))

IO.puts("")
IO.puts("scheduler:              " <> row.(1..System.schedulers_online()))
IO.puts("waiting before:         " <> row.(before))
IO.puts("waiting after spawning: " <> row.(just_after))
IO.puts("half a second later:    " <> row.(later) <> "  (running or waiting)")
IO.puts("")
IO.puts("process:       " <> row.(Enum.map(Enum.sort(first), &elem(&1, 0))))
IO.puts("first ran on:  " <> row.(Enum.map(Enum.sort(first), &elem(&1, 1))))
