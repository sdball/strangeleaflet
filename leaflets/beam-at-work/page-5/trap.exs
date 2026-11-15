# Trapping exits: a process that sets the trap_exit flag gets an exit signal
# as a message, {:EXIT, pid, reason}, and doesn't die. Except for :kill.

Logger.configure(level: :none)

idle = fn -> Process.sleep(:infinity) end

check = fn pids ->
  Process.sleep(200)
  Enum.map_join(pids, ", ", fn {name, pid} -> "#{name} alive? #{Process.alive?(pid)}" end)
  |> IO.puts()
end

# A message as text, with a crash's stack trace shortened to "stacktrace"
show = fn
  {:EXIT, pid, {e, stack}} when is_exception(e) and is_list(stack) ->
    "{:EXIT, #{inspect(pid)}, {#{inspect(e)}, stacktrace}}"

  message ->
    inspect(message)
end

# Prints every message in the calling process's mailbox
show_mailbox = fn ->
  {:messages, messages} = Process.info(self(), :messages)
  IO.puts("mailbox: #{Enum.map_join(messages, " ", show)}")
end

IO.puts("## Trapping exits")
Process.flag(:trap_exit, true)
IO.puts("me: #{inspect(self())}")

crashes = spawn_link(fn -> Process.sleep(100); raise "oops" end)
IO.puts("crashes: #{inspect(crashes)}")
finishes = spawn_link(fn -> Process.sleep(100) end)
IO.puts("finishes: #{inspect(finishes)}")
Process.sleep(200)
show_mailbox.()

# Take the messages out
for _ <- 1..2, do: receive(do: ({:EXIT, _, _} -> :ok))

IO.puts("\n## A chain: a is linked to b, b to c, b traps exits, and c crashes")
a = spawn(idle)

b =
  spawn(fn ->
    Process.flag(:trap_exit, true)
    Process.link(a)

    receive do
      message -> IO.puts("b received #{show.(message)}")
    end

    idle.()
  end)

c = spawn(fn -> Process.link(b); Process.sleep(100); raise "oops" end)
check.(a: a, b: b, c: c)

IO.puts("\n## :kill, sent to a process that traps exits")
stubborn = spawn_link(fn -> Process.flag(:trap_exit, true); idle.() end)
Process.sleep(10)
Process.exit(stubborn, :kill)
check.(stubborn: stubborn)
receive do
  message -> IO.puts("me: received #{show.(message)}")
end
