# This process sends a message, sleeps 1 ms, and sends another, to a
# consumer that sleeps 2 ms over each one. Every second, report how many
# messages were sent, how many are waiting in the consumer's mailbox, and
# how big the consumer is. With "call", wait for each reply before sending
# the next.
mode = List.first(System.argv(), "send")

consumer = spawn(fn ->
  loop = fn loop ->
    receive do
      {:work, from, _payload} ->
        Process.sleep(2)
        if from, do: send(from, :done)
        loop.(loop)
    end
  end
  loop.(loop)
end)

payload = Enum.to_list(1..100)
start = System.monotonic_time(:millisecond)

produce = fn produce, sent, report_at ->
  case mode do
    "send" ->
      send(consumer, {:work, nil, payload})
    "call" ->
      send(consumer, {:work, self(), payload})
      receive do: (:done -> :ok)
  end
  Process.sleep(1)
  sent = sent + 1

  if System.monotonic_time(:millisecond) - start >= report_at do
    [message_queue_len: waiting, memory: bytes] = Process.info(consumer, [:message_queue_len, :memory])
    IO.puts(
      "#{String.pad_leading("#{report_at}", 4)} ms: sent #{String.pad_leading("#{sent}", 4)}," <>
        " handled #{String.pad_leading("#{sent - waiting}", 4)}," <>
        " waiting #{String.pad_leading("#{waiting}", 4)}, consumer #{div(bytes, 1024)} KB"
    )
  end

  cond do
    report_at > 6000 -> :ok
    System.monotonic_time(:millisecond) - start >= report_at -> produce.(produce, sent, report_at + 1000)
    true -> produce.(produce, sent, report_at)
  end
end

IO.puts("mode: #{mode}")
produce.(produce, 0, 1000)
