# What a caller sees when the server dies during its call, and when it calls
# a server that's already gone.

defmodule Fragile do
  use GenServer

  @impl true
  def init(:ok), do: {:ok, nil}

  @impl true
  def handle_call(:crash, _from, _state) do
    Process.sleep(100)
    raise "oops"
  end
end

Logger.configure(level: :none)
{:ok, server} = GenServer.start(Fragile, :ok)

call = fn ->
  try do
    GenServer.call(server, :crash)
  catch
    :exit, {{%RuntimeError{} = e, _stacktrace}, _where} ->
      IO.puts("caller exited: the server raised #{inspect(e)}")

    :exit, {reason, _where} ->
      IO.puts("caller exited: #{inspect(reason)}")
  end
end

call.()
IO.puts("server alive? #{Process.alive?(server)}")
call.()

{:messages, messages} = Process.info(self(), :messages)
IO.puts("caller's mailbox: #{inspect(messages)}")

IO.puts("by hand, with no monitor:")
ref = make_ref()
send(server, {:"$gen_call", {self(), ref}, :crash})

receive do
  {^ref, reply} -> IO.puts("reply: #{inspect(reply)}")
after
  5_000 -> IO.puts("still waiting after 5 seconds")
end
