# What a link does: when either process dies, the other gets an exit signal,
# and unless it's trapping exits (trap.exs), it dies too, with the same
# reason. Unless the reason is :normal.

Logger.configure(level: :none)

# A process that sleeps until it's killed
idle = fn -> Process.sleep(:infinity) end

# Each scene starts its processes from here, and checks on them after
# they've had 200 ms to die.
check = fn pids ->
  Process.sleep(200)
  Enum.map_join(pids, ", ", fn {name, pid} -> "#{name} alive? #{Process.alive?(pid)}" end)
  |> IO.puts()
end

IO.puts("## A linked process crashes")
parent =
  spawn(fn ->
    spawn_link(fn ->
      Process.sleep(100)
      raise "oops"
    end)

    idle.()
  end)

check.(parent: parent)

IO.puts("\n## The other way round")
me = self()

parent =
  spawn(fn ->
    send(me, {:child, spawn_link(idle)})
    Process.sleep(100)
    raise "oops"
  end)

child = receive do: ({:child, pid} -> pid)
check.(parent: parent, child: child)

IO.puts("\n## A linked process finishes normally")

parent =
  spawn(fn ->
    spawn_link(fn -> Process.sleep(100) end)
    idle.()
  end)

check.(parent: parent)

IO.puts("\n## A chain: a is linked to b, b to c, and c crashes")
a = spawn(idle)

b =
  spawn(fn ->
    Process.link(a)
    idle.()
  end)

c =
  spawn(fn ->
    Process.link(b)
    Process.sleep(100)
    raise "oops"
  end)

check.(a: a, b: b, c: c)
