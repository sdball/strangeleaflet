# Page 5's restarter, replaced by a supervisor. The worker is the same
# function, untouched. The supervisor restarts it when it crashes, and gives
# up after more than 3 restarts in 5 seconds (its defaults).

Logger.configure(level: :none)

# A worker that counts, and fails one time in four
work = fn ->
  Enum.each(1..5, fn n ->
    Process.sleep(50)
    if :rand.uniform(4) == 1, do: raise("failed at #{n}")
    IO.puts("worker #{inspect(self())}: #{n}")
  end)
end

children = [
  Supervisor.child_spec({Task, work}, restart: :transient)
]

{:ok, supervisor} = Supervisor.start_link(children, strategy: :one_for_one)
Process.unlink(supervisor)
ref = Process.monitor(supervisor)

receive do
  {:DOWN, ^ref, :process, _, reason} -> IO.puts("supervisor exited: #{inspect(reason)}")
after
  2000 -> IO.puts("supervisor still running: #{inspect(Supervisor.which_children(supervisor))}")
end
