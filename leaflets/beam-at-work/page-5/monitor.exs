# Monitors: a process that monitors another gets a :DOWN message when it
# exits, for any reason, and never dies of it. The monitored process isn't
# told anything.

Logger.configure(level: :none)

idle = fn -> Process.sleep(:infinity) end

# A message as text, with a crash's stack trace shortened to "stacktrace"
show = fn
  {:DOWN, ref, :process, pid, {e, stack}} when is_exception(e) and is_list(stack) ->
    "{:DOWN, #{inspect(ref)}, :process, #{inspect(pid)}, {#{inspect(e)}, stacktrace}}"

  message ->
    inspect(message)
end

# Waits for one message and prints it, or says there wasn't one
receive_one = fn ->
  receive do
    message -> IO.puts("received #{show.(message)}")
  after
    500 -> IO.puts("no message")
  end
end

IO.puts("## Monitoring a process that crashes")
crashes = spawn(fn -> Process.sleep(100); raise "oops" end)
ref = Process.monitor(crashes)
IO.puts("monitoring #{inspect(crashes)}, ref #{inspect(ref)}")
receive_one.()

IO.puts("\n## ...that finishes normally")
finishes = spawn(fn -> Process.sleep(100) end)
Process.monitor(finishes)
receive_one.()

IO.puts("\n## ...that's already gone")
Process.monitor(crashes)
receive_one.()

IO.puts("\n## ...twice")
twice = spawn(fn -> Process.sleep(100); exit(:done) end)
Process.monitor(twice)
Process.monitor(twice)
receive_one.()
receive_one.()

IO.puts("\n## The watcher crashes")
watched = spawn(idle)

watcher =
  spawn(fn ->
    Process.monitor(watched)
    Process.sleep(100)
    raise "oops"
  end)

Process.sleep(200)
IO.puts("watcher alive? #{Process.alive?(watcher)}, watched alive? #{Process.alive?(watched)}")

IO.puts("\n## spawn_monitor, and Process.exit")
{pid, _ref} = spawn_monitor(idle)
Process.exit(pid, :shutdown)
receive_one.()
