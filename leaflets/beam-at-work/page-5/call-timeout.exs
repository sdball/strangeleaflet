# A call that gives up before the server replies, and what happens to the
# reply when it comes: first with GenServer.call, then with a call written
# by hand, a reference and a receive with a timeout.

defmodule Slow do
  use GenServer

  @impl true
  def init(:ok), do: {:ok, nil}

  @impl true
  def handle_call(:work, _from, state) do
    Process.sleep(300)
    {:reply, :done, state}
  end
end

show_mailbox = fn ->
  {:messages, messages} = Process.info(self(), :messages)
  IO.puts("  500 ms later, the caller's mailbox: #{inspect(messages)}")
end

{:ok, server} = GenServer.start(Slow, :ok)

IO.puts("GenServer.call, giving up after 100 ms")

try do
  GenServer.call(server, :work, 100)
catch
  :exit, {reason, _where} -> IO.puts("  caller exited: #{inspect(reason)}")
end

Process.sleep(500)
show_mailbox.()

IO.puts("by hand, giving up after 100 ms")
ref = make_ref()
send(server, {:"$gen_call", {self(), ref}, :work})

receive do
  {^ref, reply} -> IO.puts("  reply: #{inspect(reply)}")
after
  100 -> IO.puts("  gave up")
end

Process.sleep(500)
show_mailbox.()
