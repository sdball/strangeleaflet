# Run as a node named a, with a net tick time of 4 seconds instead of 60:
#   elixir --sname a --erl "-kernel net_ticktime 4" down.exs
#
# Starts node b with a counter on it, watches the counter with a monitor
# and node b with :net_kernel.monitor_nodes, then loses b three ways:
# the connection is closed, b stops answering, and b halts.

{:module, Counter, beam, _} =
  defmodule Counter do
    def loop(n) do
      receive do
        {:add, k} ->
          loop(n + k)

        {:get, from} ->
          send(from, {:count, n})
          loop(n)
      end
    end
  end

# As in nodes.exs, but with `connection: 0`: :peer controls b over a
# connection of its own, so b keeps running when a and b disconnect.
start_node = fn name ->
  paths = Enum.flat_map(:code.get_path(), &[~c"-pa", &1])
  args = paths ++ [~c"-kernel", ~c"net_ticktime", ~c"4"]
  {:ok, _peer, node} = :peer.start(%{name: name, connection: 0, args: args})
  true = Node.connect(node)
  {:module, Counter} = :erpc.call(node, :code, :load_binary, [Counter, ~c"down.exs", beam])
  node
end

start = System.monotonic_time(:millisecond)
log = fn text -> IO.puts("#{String.pad_leading("#{System.monotonic_time(:millisecond) - start}", 5)} ms  #{text}") end

# Print every message that arrives in the next `ms` milliseconds
listen = fn ms ->
  until = System.monotonic_time(:millisecond) + ms

  Stream.repeatedly(fn ->
    receive do
      message -> log.(inspect(message))
    after
      max(until - System.monotonic_time(:millisecond), 0) -> :done
    end
  end)
  |> Enum.find(&(&1 == :done))

  log.("waited #{div(ms, 1000)} s")
end

b = start_node.(:b)
counter = Node.spawn(b, Counter, :loop, [0])
send(counter, {:add, 5})
:net_kernel.monitor_nodes(true)
log.("counter #{inspect(counter)} on #{b}, at 5")

IO.puts("\nThe connection closes")
Process.monitor(counter)
Node.disconnect(b)
listen.(1_000)
send(counter, {:get, self()})
listen.(1_000)

IO.puts("\nb stops answering")
Process.monitor(counter)
os_pid = to_string(:erpc.call(b, :os, :getpid, []))
System.cmd("kill", ["-STOP", os_pid])
log.("stopped b's operating system process")
send(counter, {:add, 1})
send(counter, {:add, 1})
log.("sent {:add, 1} twice")
listen.(6_000)
System.cmd("kill", ["-CONT", os_pid])
log.("let b's operating system process continue")
send(counter, {:get, self()})
listen.(1_000)

IO.puts("\nb halts")
Process.monitor(counter)
:erpc.cast(b, :erlang, :halt, [])
listen.(1_000)
send(counter, {:get, self()})
listen.(3_000)
