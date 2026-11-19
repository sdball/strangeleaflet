# A producer sends 1,000 messages a second to a consumer that works on
# each one for 2 ms, so it can only handle 500 a second. Every second,
# report how many messages were sent, how many are waiting in the
# consumer's mailbox, and how big the consumer is. With "call", the
# producer waits for each reply before sending the next.
mode = List.first(System.argv(), "send")

defmodule Work do
  # Keep busy for `ms` milliseconds by the clock, the way real work would
  def busy(ms), do: spin(System.monotonic_time(:microsecond) + ms * 1000)
  defp spin(until), do: if(System.monotonic_time(:microsecond) < until, do: spin(until), else: :ok)
end

consumer = spawn(fn ->
  loop = fn loop ->
    receive do
      {:work, from, _payload} ->
        Work.busy(2)
        if from, do: send(from, :done)
        loop.(loop)
    end
  end
  loop.(loop)
end)

payload = Enum.to_list(1..100)
start = System.monotonic_time(:millisecond)
elapsed = fn -> System.monotonic_time(:millisecond) - start end

report = fn at, sent ->
  [message_queue_len: waiting, memory: bytes] = Process.info(consumer, [:message_queue_len, :memory])
  IO.puts(
    "#{String.pad_leading("#{at}", 4)} ms: sent #{String.pad_leading("#{sent}", 4)}," <>
      " handled #{String.pad_leading("#{sent - waiting}", 4)}," <>
      " waiting #{String.pad_leading("#{waiting}", 4)}, consumer #{div(bytes, 1024)} KB"
  )
end

# One message is due every millisecond since the start. Send whatever's
# due, then sleep until the next one.
produce = fn produce, sent, report_at ->
  cond do
    report_at > 6000 ->
      :ok

    elapsed.() >= report_at ->
      report.(report_at, sent)
      produce.(produce, sent, report_at + 1000)

    sent < elapsed.() ->
      case mode do
        "send" ->
          send(consumer, {:work, nil, payload})
        "call" ->
          send(consumer, {:work, self(), payload})
          receive do: (:done -> :ok)
      end
      produce.(produce, sent + 1, report_at)

    true ->
      Process.sleep(1)
      produce.(produce, sent, report_at)
  end
end

IO.puts("mode: #{mode}")
produce.(produce, 0, 1000)
