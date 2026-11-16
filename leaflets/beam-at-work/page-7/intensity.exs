# How many restarts are too many: by default, more than 3 in 5 seconds.
# One worker, crashed four times in quick succession, then six times two
# seconds apart.

Logger.configure(level: :none)

# Milliseconds since t0, for the timestamps
since = fn t0 -> String.pad_leading("#{System.monotonic_time(:millisecond) - t0} ms", 8) end

defmodule Worker do
  use GenServer

  def start_link(clock), do: GenServer.start_link(__MODULE__, clock, name: Worker)

  def init(clock) do
    IO.puts("  #{clock.()} worker started as #{inspect(self())}")
    {:ok, nil}
  end

  def handle_cast(:crash, _state), do: raise("crashed")
end

crash_every = fn gap, times ->
  t0 = System.monotonic_time(:millisecond)
  clock = fn -> since.(t0) end
  {:ok, supervisor} = Supervisor.start_link([{Worker, clock}], strategy: :one_for_one)
  Process.unlink(supervisor)
  ref = Process.monitor(supervisor)

  Enum.each(1..times, fn _ ->
    Process.sleep(gap)
    IO.puts("  #{clock.()} crashing the worker")
    GenServer.cast(Worker, :crash)
  end)

  receive do
    {:DOWN, ^ref, :process, _, reason} -> IO.puts("  #{clock.()} supervisor exited: #{inspect(reason)}")
  after
    100 -> IO.puts("  #{clock.()} supervisor still running")
  end
end

IO.puts("## Four crashes, 100 ms apart")
crash_every.(100, 4)

IO.puts("\n## Six crashes, two seconds apart")
crash_every.(2000, 6)
