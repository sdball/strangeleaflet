# Page 4's slow consumer as a GenStage pipeline. Events arrive at the
# producer 1,000 a second; each consumer works on each one for 2 ms, so
# it can handle 500 a second. Every second, report how many events have
# arrived, how many are handled, how many are in flight (sent to a
# consumer, not handled yet), how many wait in the producer's buffer, and
# how many the producer has dropped. The argument is how many consumers.
Mix.install([{:gen_stage, "1.3.2"}])

consumers = String.to_integer(List.first(System.argv(), "1"))

defmodule Work do
  # Keep busy for `ms` milliseconds by the clock, the way real work would
  def busy(ms), do: spin(System.monotonic_time(:microsecond) + ms * 1000)
  defp spin(until), do: if(System.monotonic_time(:microsecond) < until, do: spin(until), else: :ok)
end

defmodule Producer do
  use GenStage

  def init(counts), do: {:producer, counts, buffer_size: 2_000}

  # An event arriving from outside: emit it. GenStage sends it to a
  # consumer that has asked for one, or keeps it in its buffer.
  def handle_info({:event, event}, counts), do: {:noreply, [event], counts}

  # Demand from a consumer: nothing to make here, events come from outside
  def handle_demand(_demand, counts), do: {:noreply, [], counts}

  # Called when the buffer is full and events are dropped
  def format_discarded(dropped, counts) do
    :counters.add(counts, 2, dropped)
    false
  end
end

defmodule Consumer do
  use GenStage

  def init({producer, counts}), do: {:consumer, counts, subscribe_to: [{producer, max_demand: 50}]}

  def handle_events(events, _from, counts) do
    Enum.each(events, fn _event ->
      Work.busy(2)
      :counters.add(counts, 1, 1)
    end)
    {:noreply, [], counts}
  end
end

# counts: 1 handled, 2 dropped
counts = :counters.new(2, [:write_concurrency])
{:ok, producer} = GenStage.start_link(Producer, counts)
for _ <- 1..consumers, do: GenStage.start_link(Consumer, {producer, counts})

start = System.monotonic_time(:millisecond)
elapsed = fn -> System.monotonic_time(:millisecond) - start end
pad = fn n -> String.pad_leading("#{n}", 4) end

report = fn at, sent ->
  handled = :counters.get(counts, 1)
  dropped = :counters.get(counts, 2)
  buffered = GenStage.estimate_buffered_count(producer)
  in_flight = sent - handled - buffered - dropped
  IO.puts(
    "#{pad.(at)} ms: arrived #{pad.(sent)}, handled #{pad.(handled)}, in flight #{pad.(in_flight)}," <>
      " buffered #{pad.(buffered)}, dropped #{pad.(dropped)}"
  )
end

# One event is due every millisecond since the start. Send whatever's
# due, then sleep until the next one.
produce = fn produce, sent, report_at ->
  cond do
    report_at > 8000 -> :ok
    elapsed.() >= report_at -> report.(report_at, sent); produce.(produce, sent, report_at + 1000)
    sent < elapsed.() -> send(producer, {:event, sent + 1}); produce.(produce, sent + 1, report_at)
    true -> Process.sleep(1); produce.(produce, sent, report_at)
  end
end

IO.puts("consumers: #{consumers}")
produce.(produce, 0, 1000)
