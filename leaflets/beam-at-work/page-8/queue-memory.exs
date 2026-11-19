# Send N of the slow consumer's messages to a process that never receives,
# and measure how much it grew per message waiting.
payload = Enum.to_list(1..100)
consumer = spawn(fn -> Process.sleep(:infinity) end)
{:memory, before} = Process.info(consumer, :memory)
for n <- [1_000, 3_000, 10_000, 30_000] do
  {:message_queue_len, have} = Process.info(consumer, :message_queue_len)
  for _ <- 1..(n - have)//1, do: send(consumer, {:work, nil, payload})
  {:memory, now} = Process.info(consumer, :memory)
  IO.puts("#{String.pad_leading("#{n}", 6)} waiting: consumer grew #{div(now - before, 1024)} KB, #{div(now - before, n)} bytes each")
end
