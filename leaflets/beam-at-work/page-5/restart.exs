# Who restarts a process that crashed? One that's linked to it and traps
# exits. This one starts a worker, and whenever the worker exits with any
# reason but :normal, starts a new one, up to three times.

Logger.configure(level: :none)

defmodule Restarter do
  def start(work, tries) do
    spawn(fn ->
      Process.flag(:trap_exit, true)
      loop(work, spawn_link(work), tries)
    end)
  end

  defp loop(work, worker, tries) do
    receive do
      {:EXIT, ^worker, :normal} ->
        IO.puts("restarter: the worker finished")

      {:EXIT, ^worker, _reason} when tries == 0 ->
        IO.puts("restarter: the worker crashed again, giving up")
        exit(:too_many_restarts)

      {:EXIT, ^worker, {e, _stacktrace}} ->
        IO.puts("restarter: the worker crashed (#{Exception.message(e)}), starting a new one")
        loop(work, spawn_link(work), tries - 1)
    end
  end
end

# A worker that counts, and fails one time in four
work = fn ->
  Enum.each(1..5, fn n ->
    Process.sleep(50)
    if :rand.uniform(4) == 1, do: raise("failed at #{n}")
    IO.puts("worker #{inspect(self())}: #{n}")
  end)
end

restarter = Restarter.start(work, 3)
ref = Process.monitor(restarter)

receive do
  {:DOWN, ^ref, :process, _, reason} -> IO.puts("restarter exited: #{inspect(reason)}")
end
