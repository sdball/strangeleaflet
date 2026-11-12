# Send lists of different sizes to a process that never receives, and
# measure how long each send took and how much the receiver grew. Then
# do the same with a big binary, which isn't copied.
receiver = spawn(fn -> Process.sleep(:infinity) end)
memory = fn -> elem(Process.info(receiver, :memory), 1) end
kb = fn bytes -> "#{div(bytes, 1024)} KB" end

IO.puts("sending to a process that never receives")
for n <- [1_000, 10_000, 100_000, 1_000_000] do
  list = Enum.to_list(1..n)
  before = memory.()
  {us, _} = :timer.tc(fn -> send(receiver, list) end)
  IO.puts(
    "list of #{String.pad_leading("#{n}", 9)}: #{String.pad_leading(kb.(:erts_debug.flat_size(list) * 8), 8)}," <>
      " send took #{String.pad_leading("#{us}", 5)} µs, receiver grew #{kb.(memory.() - before)}"
  )
end

binary = :binary.copy("x", 16_000_000)
before = memory.()
{us, _} = :timer.tc(fn -> send(receiver, binary) end)
IO.puts("binary of 16 MB: send took #{us} µs, receiver grew #{memory.() - before} bytes")
IO.puts("messages waiting: #{elem(Process.info(receiver, :message_queue_len), 1)}")
