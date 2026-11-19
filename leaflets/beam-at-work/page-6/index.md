---
tags: elixir, beam, nodejs
publish: false
meta_description: A BEAM can connect to other BEAMs, and a send to a process on another machine looks just like a local one. What changes is what can go wrong, and what a monitor can and can't tell you when it does.
---

Everything on the pages so far happened inside one BEAM, and one BEAM is one operating system process on one machine. Page 5 ended there: if that process goes down, everything in it goes with it, and something outside has to start it again. Joe Armstrong's thesis on Erlang puts it plainly: "When we make a fault-tolerant system we need at least two physically separated computers. Using a single computer will not work, if it crashes, all is lost."

So a BEAM can connect to other BEAMs, on the same machine or on others, and processes on one can send messages to processes on another. Erlang's docs: "Message passing between processes at different nodes, as well as links and monitors, are transparent when pids are used." The `send`, `receive`, links, and monitors from pages 4 and 5 work across machines the way they work inside one.

## Nodes

A BEAM that can connect to others is a *node*: a running BEAM that has been given a name, like `a@MacBookAir`, a name and the machine it's on. `elixir --sname a script.exs` runs a script on a node named `a`.

Two things on each machine make the connection work. A small program called epmd, the Erlang Port Mapper Daemon, which every node starts if it isn't already running, keeps track of which port each node on that machine is listening on, so `b@MacBookAir` can be found by name. And each node has a *cookie*, a shared secret. Two nodes connect only if their cookies match. Unless you set one, a node reads its cookie from a file in your home directory, and makes the file if it isn't there, so nodes started by the same user on the same machine can always connect.

This script runs as node `a`, and starts two more nodes, `b` and `c`, with `:peer`, a module in Erlang's standard library for starting nodes and controlling them. Each node is a separate operating system process. It starts a counter on `a` and one on `b`, and talks to both the same way ([nodes.exs](nodes.exs)):

```elixir
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
```

Nodes send each other data, not code. `Counter` is defined in this script, so only node `a` has it, and a process started on `b` to run `Counter.loop` would fail there. `defmodule` returns the compiled module, and `start_node` loads it on each new node with `:erpc.call`, which runs a function on another node and returns its result. In Elixir's guide each node is started from the same project, so they all have the code already.

```text
$ elixir --sname a nodes.exs
this is a@MacBookAir, connected to []
started b@MacBookAir, now connected to [:b@MacBookAir]

#PID<0.118.0> is on a@MacBookAir and has counted to 7
#PID<19950.101.0> is on b@MacBookAir and has counted to 7

sent to {:counter, :b@MacBookAir}, and #PID<19950.101.0> has counted to 17
hello from a process on b@MacBookAir

started c@MacBookAir, now connected to [:b@MacBookAir, :c@MacBookAir]
c@MacBookAir is connected to [:a@MacBookAir, :b@MacBookAir]

there and back to a@MacBookAir: 2.1 µs on average
there and back to b@MacBookAir: 26.9 µs on average
```

## A pid that's somewhere else

`Node.spawn(b, Counter, :loop, [0])` is `spawn` with a node in front, and it returns a pid like any other. The only sign that it's somewhere else is the first number: `0` for a process on this node, something else for a process on another. Everything after that is the same code. The `for` loop sends to both counters and gets the same answers back, without knowing or caring which one is on `b`.

Registered names are the exception. The script registers the counter on `b` as `:counter`, so it can be sent to by that name instead of its pid, but a name is only known on the node it was registered on, so to send to a name on another node you send to the name and the node together, as `{:counter, b}`.

The `hello` line was printed by a process running on `b`, but it came out here, in `a`'s terminal. A process sends its output to its *group leader*, and "When a new process is spawned, it gets the same group leader as the spawning process." A process spawned from `a` onto `b` keeps `a`'s, so its output comes home.

When `c` started, it connected to `a`, and then to `b` by itself. Erlang's docs: "Connections are by default transitive. If a node A connects to node B, and node B has a connection to node C, then node A also tries to connect to node C." Every node ends up connected to every other one.

The last two lines are where the transparency stops. A message to a process on the same node is copied from one process's memory to the other's, as page 4 showed. A message to a process on another node is encoded into bytes, sent over a TCP connection, and decoded on the other side, and the reply goes back the same way. There and back took 2 µs on one node, and 27 µs between two nodes on the same machine. Between two machines the network adds its own time on top.

## When a node goes away

Inside one BEAM, page 5's monitors only ever tell you one thing: the process has stopped, and here's why. Across nodes there's another reason a `:DOWN` message can carry. The docs list it with the others: "`noconnection` (no connection to the node where the monitored process resides)." Links get it too. A link to a process on another node sends an exit signal with the reason `:noconnection` if "the connection between linked processes on different nodes is lost or cannot be established".

The connection can go in different ways, and this script tries three of them on a counter on node `b`. It watches the counter with a monitor, and watches node `b` itself with `:net_kernel.monitor_nodes(true)`, which sends a `{:nodedown, node}` message whenever a connection to a node is lost and a `{:nodeup, node}` message whenever one is made. `listen.(ms)` prints every message that arrives in the next `ms` milliseconds ([down.exs](down.exs)):

```elixir
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
```

`start_node` is the one from nodes.exs with one change: `:peer` controls `b` over a connection of its own, so `b` keeps running when `a` disconnects from it. `kill -STOP` pauses an operating system process where it is, without telling it, and `kill -CONT` lets it carry on. To a node on another machine, a paused process looks just like a machine that has hung, or a network cable that's been pulled: no messages, no errors, nothing. The script runs with the *net tick time* at 4 seconds instead of the default 60, for reasons the output will make clear:

```text
$ elixir --sname a --erl "-kernel net_ticktime 4" down.exs
  153 ms  counter #PID<19882.97.0> on b@MacBookAir, at 5

The connection closes
  156 ms  {:DOWN, #Reference<0.82351080.523239425.139972>, :process, #PID<19882.97.0>, :noconnection}
  156 ms  {:nodedown, :b@MacBookAir}
 1155 ms  waited 1 s
 1161 ms  {:nodeup, :b@MacBookAir}
 1163 ms  {:count, 5}
 2156 ms  waited 1 s

b stops answering
 2170 ms  stopped b's operating system process
 2170 ms  sent {:add, 1} twice
 6850 ms  {:DOWN, #Reference<0.82351080.523239425.140052>, :process, #PID<19882.97.0>, :noconnection}

21:20:17.376 [error] ** Node :b@MacBookAir not responding **
** Removing (timedout) connection **

 6850 ms  {:nodedown, :b@MacBookAir}
 8171 ms  waited 6 s
 8179 ms  let b's operating system process continue
 8194 ms  {:nodeup, :b@MacBookAir}
 8195 ms  {:count, 7}
 9180 ms  waited 1 s

b halts
 9181 ms  {:DOWN, #Reference<0.82351080.523239425.140192>, :process, #PID<19882.97.0>, :noconnection}
 9181 ms  {:nodedown, :b@MacBookAir}
10181 ms  waited 1 s
13182 ms  waited 3 s
```

**The connection closes.** The monitor said `:noconnection`, but nothing had happened to the counter. When the script sent it `{:get, self()}`, `a` connected to `b` again by itself (nodes connect "when a message is to be sent to that node"), and the counter answered: still running, still at 5. The monitor was gone, though: a monitor "is triggered only once, after that it is removed".

**`b` stops answering.** For 4.7 seconds, nothing. A paused process doesn't close its connections, so as far as `a` could see, `b` was just quiet. What ended it was the net tick time. Nodes send each other a small *tick* on any connection that has been quiet for a while, and a node that hasn't been heard from, with ticks or anything else, for about the net tick time is taken to be down: "the actual time `T` a node have been unresponsive when detected may vary" between three quarters and five quarters of it. 4 seconds here gave 4.7. The default of 60 seconds gives between 45 and 75. Then the monitor said `:noconnection` and `a` logged an error.

But `b` wasn't down. Once it carried on, the counter answered with 7: both `{:add, 1}` messages, sent while `b` was paused, had arrived, after `a` had given up on it. They could just as easily have been lost. The docs: "When communicating over the distribution, signals can be lost if the distribution channel goes down." All `a` can know is that it doesn't know.

**`b` halts.** This time the `:DOWN` message came at once. When a node's operating system process ends, the operating system closes its connections, and the other end sees that right away: "Normally, a terminating node is detected immediately by the transport protocol (like TCP/IP)." And the last `{:get, self()}` went nowhere, without an error. As page 4 said, sending to a pid never fails, even if there's nothing there to receive it.

So across nodes, `:noconnection` doesn't mean the process has stopped. It means this node can't reach it. The docs for monitors: "If the connection to it is lost, we do not know if it still exists." The process may have stopped, or may be carrying on without us, and the messages sent around that time may or may not have got there. A process watching one on another node has to decide for itself what to do when it can't tell.

## And in Node?

Node doesn't have nodes, or a way to send to an object in another Node process, so here's the counter as a separate Node process with a TCP server, talking in lines of JSON. Here's the counter's side ([remote.mjs](remote.mjs)):

```js
let count = 0;
const server = createServer((socket) => {
  let text = "";
  socket.on("data", (data) => {
    text += data;
    let end;
    while ((end = text.indexOf("\n")) >= 0) {
      const message = JSON.parse(text.slice(0, end));
      text = text.slice(end + 1);
      if (message.add) count += message.add;
      if (message.get) socket.write(JSON.stringify({ count }) + "\n");
      if (message.exit) process.exit();
    }
  });
  socket.on("error", () => {});
});
server.listen(0, () => console.log(server.address().port));
```

And here's how the first process connects to it, logging everything that happens to the connection:

```js
const open = async () => {
  const socket = connect(port);
  let text = "";
  socket.on("data", (data) => {
    text += data;
    let end;
    while ((end = text.indexOf("\n")) >= 0) {
      log(`reply ${text.slice(0, end)}`);
      text = text.slice(end + 1);
    }
  });
  socket.on("error", (error) => log(`error ${error.code}`));
  socket.on("close", () => log("close"));
  await new Promise((resolve) => socket.once("connect", resolve));
  return socket;
};
const send = (socket, message) => socket.write(JSON.stringify(message) + "\n");
```

The rest is down.exs again: close the connection and open another, pause the counter's process with `SIGSTOP` and send it `{ add: 1 }` twice, let it continue, and then tell it to exit:

```text
$ node remote.mjs
   44 ms  counter in process 31350, at 5

The connection closes
   44 ms  close
 1046 ms  waited 1 s
 1048 ms  reply {"count":5}
 2048 ms  waited 1 s

The counter's process stops answering
 2049 ms  stopped the counter's process
 2049 ms  sent { add: 1 } twice
 8051 ms  waited 6 s
 8052 ms  let the counter's process continue
 8052 ms  reply {"count":7}
 9053 ms  waited 1 s

The counter's process exits
 9061 ms  close
10055 ms  waited 1 s
13057 ms  waited 3 s
```

When the connection closed, and when the other process exited, Node said so at once, with a `close` event, just as the BEAM did. When the other process stopped answering, Node said nothing at all, for all 6 seconds, and would have gone on saying nothing. Node's docs: "By default `net.Socket` do not have a timeout." `socket.setTimeout()` adds one, and then the socket gets a `'timeout'` event after a quiet spell "but the connection will not be severed". Deciding how long is too long, and what to do then, is the program's job. Here that's a request timeout or a heartbeat of your own, the job the BEAM's ticks do for every connection.

Everything else is the program's job too. The counter's address is a port, not a pid, and anything that wants to talk to it needs a connection, a way of splitting the stream into messages (lines, here), and a way of encoding them (JSON, which has no pids, no tuples, and no atoms). A request with a reply needs a way to match them up, as page 4's request did with a reference. A library can take care of that, but it's one the program has to choose and wire in. The BEAM has it built in, for every process.

What neither can do is the hard part. A Node process whose socket goes quiet is in the same spot as a BEAM node that gets `:noconnection`: it can't tell a stopped process from a slow one, or know which of its last messages arrived.

## Watch it happen

Here's down.exs as a simulation. Node `a` has a monitor on a counter on node `b`, and the two nodes send each other ticks whenever they have nothing else to send. You can send to the counter, close the connection, pause `b`, or halt it, and see what `a`'s mailbox gets. Under that it shows something `a` can't see: how many messages were lost on the way.

It waits at the start until you press Play. Then try these:

1. Watch the ticks cross, one each way every second, a quarter of the net tick time. Send `{:add, 1}` a few times, then `{:get, self()}`. A node that has just sent something doesn't need to send a tick as well.
2. Close the connection. `a` gets `:nodedown` and `:DOWN`, and `b`, still running, takes `a` to be down too. Send `{:get, self()}`: `a` connects again by itself, and the counter answers with the count it had.
3. Press `Process.monitor` to watch the counter again, then pause `b` and send `{:add, 1}` twice. Each second `a` checks the connection and finds nothing new from `b`, and at the fourth check in a row it gives up on `b`. Then let `b` carry on: it reads both messages, and `{:get, self()}` shows them counted.
4. Pause `b` again, wait for `a` to give up, and send `{:add, 1}`. `a` tries to connect, and gives up on that after 7 seconds. If `b` carries on before then, the message arrives. If not, it's lost, and nothing tells `a`.
5. Halt `b`. `a` hears about it at once. Send `{:get, self()}`, and nothing comes back.
6. Reset, set the net tick time to 60 s and the speed to 15×, and pause `b`. With the default net tick time, `a` takes about a minute to give up on it.

<beam-nodes>

![The simulation 6.9 seconds in. Node b is paused, with two messages unread, and its counter is at 3. Node a takes b to be down: a's mailbox shows the counter's reply of 3, then an error that b isn't responding, a nodedown message, and a DOWN message with the reason noconnection. The connection is down, and nothing has been lost on the way yet](beam-nodes.webp)

*The live version of this needs JavaScript. In it, you can send messages from node a to a counter on node b, close the connection between them, pause b, or halt it, and watch what a's mailbox gets.*

</beam-nodes>

<script type="module" src="beam-nodes.js"></script>

## Where it gives ground

Distribution isn't secure out of the box. The cookie keeps nodes from connecting by mistake, not attackers out. Erlang's docs: "'Security' here does *not* mean cryptographically secure", and "the communication between nodes is per default in clear text." A node can call any function on the nodes it's connected to, which is what `:erpc.call` does, so the docs warn that a node started without TLS is exposed "to attacks that may give the attacker complete access to the node and in extension the cluster." Distribution can run over TLS, and otherwise belongs on a network nobody else can reach.

Every node connects to every other node, so the number of connections grows with the square of the number of nodes: 10 nodes have 45 connections between them, and 100 have 4,950. Hidden nodes and the `-connect_all false` flag turn that off, at the cost of connecting nodes by hand.

A send to another node can wait. Inside one node `send` never waits, but each connection has a buffer for messages on their way out, and "When the size of the output buffer for the channel reach the *distribution buffer busy limit*, processes sending on the channel will be suspended until the size of the buffer shrinks below the limit." That limit is 1 MB by default, and a lot of large messages to one node can reach it.

And the BEAM's part ends where the hard part of a distributed system begins. It tells you a node can't be reached, and leaves you to decide what that means. Elixir's guide: "every distributed system, be it a library or a full-blown database, is designed with a series of trade-offs in mind", and two nodes that can't reach each other can each carry on, each sure the other has gone. Whether that's fine depends on the work. It's why the guide adds that "it is still very common to use a database (or any storage system) when writing production applications in Elixir".

## Sources

- The scripts and their runs: [nodes.exs](nodes.exs), [down.exs](down.exs), and [remote.mjs](remote.mjs), run 2026-11-17 on an Apple M1 (8 cores) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1) and Node v25.9.0.
- "When we make a fault-tolerant system we need at least two physically separated computers": Joe Armstrong, [*Making reliable distributed systems in the presence of software errors*](https://erlang.org/download/armstrong_thesis_2003.pdf) (2003), pages 40–41 (section 3.1).
- Nodes, node names, links and monitors being "transparent when pids are used", registered names being local, connections made "the first time the name of another node is used" and "by default transitive", `-connect_all false`, epmd, hidden nodes, cookies (the `.erlang.cookie` file, "does *not* mean cryptographically secure", clear text), and the warning about starting a node without TLS: the Erlang reference manual, [Distributed Erlang](https://www.erlang.org/doc/system/distributed.html). epmd's port, 4369, and messages between nodes sent "using the external term format": [Distribution Protocol](https://www.erlang.org/doc/apps/erts/erl_dist_protocol.html). TLS for distribution: [Using TLS for Erlang Distribution](https://www.erlang.org/doc/apps/ssl/ssl_distribution.html).
- Signals that "can be lost if the distribution channel goes down", the one ordering guarantee, and senders suspended at the distribution buffer busy limit: the reference manual, [Processes: Delivery of Signals](https://www.erlang.org/doc/system/ref_man_processes.html#delivery-of-signals) and [Blocking Signaling Over Distribution](https://www.erlang.org/doc/system/ref_man_processes.html#blocking-signaling-over-distribution). The limit's default of 1024 kilobytes: [`erl +zdbbl`](https://www.erlang.org/doc/apps/erts/erl_cmd.html#+zdbbl).
- `noconnection` in a `'DOWN'` message, a monitor being "triggered only once", and "If the connection to it is lost, we do not know if it still exists": [`erlang:monitor/2`](https://www.erlang.org/doc/apps/erts/erlang.html#monitor/2). Exit signals with reason `noconnection` from links: [`erlang:link/1`](https://www.erlang.org/doc/apps/erts/erlang.html#link/1). A new process getting "the same group leader as the spawning process": [`erlang:group_leader/0`](https://www.erlang.org/doc/apps/erts/erlang.html#group_leader/0).
- The net tick time, ticks, its default of 60 seconds, detection between 45 and 75 seconds, and a terminating node "detected immediately by the transport protocol"; and nodes connecting automatically "when a message is to be sent to that node": Kernel's [`net_ticktime`](https://www.erlang.org/doc/apps/kernel/kernel_app.html#net_ticktime) and [`dist_auto_connect`](https://www.erlang.org/doc/apps/kernel/kernel_app.html#dist_auto_connect). The 7 seconds allowed for each step of setting up a connection: [`net_setuptime`](https://www.erlang.org/doc/apps/kernel/kernel_app.html#net_setuptime). [`net_kernel:monitor_nodes/1`](https://www.erlang.org/doc/apps/kernel/net_kernel.html#monitor_nodes/1).
- [`peer`](https://www.erlang.org/doc/apps/stdlib/peer.html), [`erpc`](https://www.erlang.org/doc/apps/kernel/erpc.html), and [`code:load_binary/3`](https://www.erlang.org/doc/apps/kernel/code.html#load_binary/3). `defmodule` returning the module's binary: [`Kernel.defmodule/2`](https://hexdocs.pm/elixir/1.19.5/Kernel.html#defmodule/2). [`Node`](https://hexdocs.pm/elixir/1.19.5/Node.html).
- Location transparency, a module defined on one node not being available on another, and the trade-offs of distributed systems and databases: Elixir's guide, [Configuration and distribution](https://hexdocs.pm/elixir/1.19.5/config-and-distribution.html).
- "By default `net.Socket` do not have a timeout" and the `'timeout'` event that doesn't sever the connection: Node's [`socket.setTimeout()`](https://nodejs.org/api/net.html#socketsettimeouttimeout-callback).
