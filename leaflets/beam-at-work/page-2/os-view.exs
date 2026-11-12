# Start 100,000 BEAM processes and ask the operating system what changed.
os_pid = System.pid()

threads = fn ->
  {out, 0} = System.cmd("ps", ["-M", "-p", os_pid])
  length(String.split(out, "\n", trim: true)) - 1
end

children = fn ->
  {out, 0} = System.cmd("ps", ["-ax", "-o", "ppid=,pid=,comm="])
  for line <- String.split(out, "\n", trim: true),
      [ppid, pid, comm] = String.split(line, " ", trim: true, parts: 3),
      ppid == os_pid,
      comm != "ps",
      do: "#{pid} #{Path.basename(comm)}"
end

report = fn label ->
  IO.puts(label)
  IO.puts("  BEAM processes:      #{length(Process.list())}")
  IO.puts("  OS process id:       #{os_pid}")
  IO.puts("  its OS threads:      #{threads.()}")
  IO.puts("  its OS children:     #{Enum.join(children.(), ", ")}")
end

report.("before")
pids = for _ <- 1..100_000, do: spawn(fn -> receive do: (:stop -> :ok) end)
report.("after spawning 100,000")
Enum.each(pids, &send(&1, :stop))
