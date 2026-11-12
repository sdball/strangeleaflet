# Six tickers and, after 200 ms, one busy loop. Every tick notes which
# scheduler the ticker ran on, and the busy loop notes its scheduler after
# each chunk of work. Then: where did everything run, window by window?
defmodule Busy do
  def spin(me, until) do
    count_down(1_000_000)
    send(me, {:busy, System.monotonic_time(:millisecond), :erlang.system_info(:scheduler_id)})
    if System.monotonic_time(:millisecond) < until, do: spin(me, until), else: :ok
  end

  defp count_down(0), do: :ok
  defp count_down(n), do: count_down(n - 1)
end

defmodule Ticker do
  def loop(me, until) do
    receive do
      :tick ->
        now = System.monotonic_time(:millisecond)
        send(me, {:tick, now, :erlang.system_info(:scheduler_id)})
        if now < until, do: loop(me, until), else: :ok
    end
  end
end

me = self()
start = System.monotonic_time(:millisecond)
stop = start + 3000

for _ <- 1..6 do
  spawn(fn ->
    :timer.send_interval(10, :tick)
    Ticker.loop(me, stop)
  end)
end

Process.sleep(200)
spawn(fn -> Busy.spin(me, stop) end)
Process.sleep(3100)

notes = Stream.repeatedly(fn -> receive do: (note -> note), after: (0 -> nil) end) |> Enum.take_while(& &1)

where = fn kind, from, to ->
  notes
  |> Enum.filter(fn {k, at, _} -> k == kind and (at - start) in from..(to - 1) end)
  |> Enum.frequencies_by(fn {_, _, scheduler} -> scheduler end)
  |> Enum.sort()
  |> Enum.map_join("  ", fn {scheduler, n} -> "#{scheduler}: #{n}" end)
end

IO.puts("schedulers online: #{System.schedulers_online()}")
for {from, to} <- [{0, 200}, {200, 1000}, {1000, 2000}, {2000, 3000}] do
  IO.puts("\n#{from}–#{to} ms")
  IO.puts("  ticks on       #{where.(:tick, from, to)}")
  IO.puts("  busy loop on   #{where.(:busy, from, to)}")
end
