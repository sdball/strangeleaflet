# A process's mailbox keeps messages in the order they arrived, and
# receive takes the first one that matches, leaving the rest where they are.
send(self(), {:log, "first"})
send(self(), {:log, "second"})
send(self(), {:reply, 42})
send(self(), {:log, "third"})

show = fn label ->
  {:messages, messages} = Process.info(self(), :messages)
  IO.puts("#{label}: #{Enum.map_join(messages, " ", &inspect/1)}")
end
show.("mailbox")

receive do
  {:reply, answer} -> IO.puts("received the reply: #{answer}")
end
show.("mailbox")

receive do
  message -> IO.puts("received the oldest: #{inspect(message)}")
end
show.("mailbox")
