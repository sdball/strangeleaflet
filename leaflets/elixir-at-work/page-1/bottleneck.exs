# One server doing about 1 ms of work for each call, and more and more
# callers. Then the same callers doing the work themselves.

defmodule Work do
  # A fixed amount of work: counting down from n. (Not busy-by-the-clock as on
  # page 4: with more processes than cores, a process waiting for its turn
  # would see the clock run out without having done the work.)
  def spin(0), do: :ok
  def spin(n), do: spin(n - 1)

  # How far to count for about 1 ms on this machine (the fastest of five).
  def calibrate do
    us = Enum.min(for _ <- 1..5, do: elem(:timer.tc(fn -> spin(10_000_000) end), 0))
    div(10_000_000 * 1000, us)
  end
end

defmodule Server do
  use GenServer

  @impl true
  def init(n), do: {:ok, n}

  @impl true
  def handle_call(:work, _from, n) do
    Work.spin(n)
    {:reply, :ok, n}
  end
end

defmodule Run do
  # Start n callers that each do job over and over for one second, and
  # count how many jobs they finish between them.
  def per_second(n, job) do
    me = self()
    until = System.monotonic_time(:millisecond) + 1000

    for _ <- 1..n do
      spawn(fn -> send(me, {:done, loop(job, until, 0)}) end)
    end

    Enum.sum(for _ <- 1..n, do: receive(do: ({:done, count} -> count)))
  end

  defp loop(job, until, count) do
    if System.monotonic_time(:millisecond) < until do
      job.()
      loop(job, until, count + 1)
    else
      count
    end
  end
end

n = Work.calibrate()
{:ok, server} = GenServer.start(Server, n)
IO.puts("#{System.schedulers_online()} schedulers, 1 ms of work is counting down from #{n}")

for callers <- [1, 2, 4, 8, 16] do
  through_server = Run.per_second(callers, fn -> GenServer.call(server, :work) end)
  by_themselves = Run.per_second(callers, fn -> Work.spin(n) end)

  IO.puts(
    "#{String.pad_leading(to_string(callers), 2)} #{if callers == 1, do: "caller: ", else: "callers:"} " <>
      "#{String.pad_leading(to_string(through_server), 5)} a second through one server, " <>
      "#{String.pad_leading(to_string(by_themselves), 5)} doing the work themselves"
  )
end
