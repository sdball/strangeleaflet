# Three tickers tick every 100 ms, a third of a beat apart. At 350 ms a busy
# loop starts in another process and runs for about a second. Do the tickers
# keep ticking?
#
#   elixir ticker.exs
#   elixir --erl "+S 1" ticker.exs    # the same, with one scheduler

defmodule Fib do
  # The slow way on purpose: about 330 million calls for fib(40)
  def fib(n) when n < 2, do: n
  def fib(n), do: fib(n - 1) + fib(n - 2)
end

defmodule Ticker do
  # Writes down when each :tick message was handled, and hands the list
  # over when asked.
  def loop(elapsed, ticks) do
    receive do
      :tick -> loop(elapsed, [elapsed.() | ticks])
      {:report, to} -> send(to, {:ticks, self(), Enum.reverse(ticks)})
    end
  end
end

start = System.monotonic_time(:millisecond)
elapsed = fn -> System.monotonic_time(:millisecond) - start end

IO.puts("schedulers online: #{System.schedulers_online()}")

# Each ticker is a process that starts `offset` ms in, then gets a :tick
# message every 100 ms.
tickers =
  for {name, offset} <- [{"A", 0}, {"B", 33}, {"C", 67}] do
    pid =
      spawn(fn ->
        Process.sleep(offset)
        :timer.send_interval(100, :tick)
        Ticker.loop(elapsed, [])
      end)

    {name, offset, pid}
  end

Process.sleep(350)
me = self()

spawn(fn ->
  from = elapsed.()
  Fib.fib(40)
  send(me, {:done, from, elapsed.()})
end)

{from, to} =
  receive do
    {:done, from, to} -> {from, to}
  end

Process.sleep(350)
end_at = elapsed.()

# One column per ticker: when each tick ran, then how many were due by the end
columns =
  for {name, offset, pid} <- tickers do
    send(pid, {:report, me})
    receive do
      {:ticks, ^pid, ticks} -> {name, ticks, div(end_at - offset, 100)}
    end
  end

row = fn label, cells ->
  IO.puts(String.pad_leading("#{label}", 4) <> String.trim_trailing(Enum.map_join(cells, &String.pad_leading("#{&1}", 7))))
end

IO.puts("busy loop #{from}–#{to} ms, stopped at #{end_at} ms")
row.("tick", Enum.map(columns, &elem(&1, 0)))
rows = columns |> Enum.map(&length(elem(&1, 1))) |> Enum.max()
for i <- 0..(rows - 1), do: row.(i + 1, Enum.map(columns, &Enum.at(elem(&1, 1), i, "")))
row.("due", Enum.map(columns, &elem(&1, 2)))
