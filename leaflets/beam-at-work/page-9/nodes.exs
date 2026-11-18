# Run as a node named a: elixir --sname a nodes.exs
#
# Starts a second node, b, on the same machine, and talks to a counter
# process on each node the same way. Then a third node, c, to show the
# nodes connecting to each other, and the time a message takes there and
# back on one node and between two.

# defmodule returns the compiled module, so it can be loaded on the other
# nodes too. Distribution sends data, not code.
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

    def hello, do: IO.puts("hello from a process on #{node()}")
  end

# Start another node on this machine with :peer, give it the same code
# paths (for Elixir), and load Counter on it.
start_node = fn name ->
  paths = Enum.flat_map(:code.get_path(), &[~c"-pa", &1])
  {:ok, _peer, node} = :peer.start(%{name: name, args: paths})
  {:module, Counter} = :erpc.call(node, :code, :load_binary, [Counter, ~c"nodes.exs", beam])
  node
end

get = fn counter ->
  send(counter, {:get, self()})

  receive do
    {:count, n} -> n
  end
end

IO.puts("this is #{node()}, connected to #{inspect(Node.list())}")
b = start_node.(:b)
IO.puts("started #{b}, now connected to #{inspect(Node.list())}")
IO.puts("")

here = spawn(Counter, :loop, [0])
there = Node.spawn(b, Counter, :loop, [0])

for counter <- [here, there] do
  send(counter, {:add, 5})
  send(counter, {:add, 2})
  IO.puts("#{inspect(counter)} is on #{node(counter)} and has counted to #{get.(counter)}")
end

IO.puts("")
:erpc.call(b, Process, :register, [there, :counter])
send({:counter, b}, {:add, 10})
IO.puts("sent to {:counter, #{inspect(b)}}, and #{inspect(there)} has counted to #{get.(there)}")

Node.spawn(b, Counter, :hello, [])
Process.sleep(100)
IO.puts("")

c = start_node.(:c)
Process.sleep(500)
IO.puts("started #{c}, now connected to #{inspect(Node.list())}")
IO.puts("#{c} is connected to #{inspect(:erpc.call(c, Node, :list, []))}")
IO.puts("")

for counter <- [here, there] do
  {us, _} = :timer.tc(fn -> for _ <- 1..10_000, do: get.(counter) end)
  IO.puts("there and back to #{node(counter)}: #{Float.round(us / 10_000, 1)} µs on average")
end
