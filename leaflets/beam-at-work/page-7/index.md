---
tags: elixir, beam, nodejs
publish: false
meta_description: A supervisor is page 5's restarter written as a GenServer. It starts processes, restarts them when they crash, and gives up when restarting isn't working, and supervisors of supervisors make a tree.
---

Page 5 ended with a restarter: a process that traps exits, starts a worker linked to it, and starts a new worker whenever the old one crashes, giving up after three tries. Page 6 was GenServer. A supervisor is both of those at once. It's OTP's restarter, and it's written as a GenServer: Erlang's `supervisor` module declares `-behaviour(gen_server)`, and the first thing it does when it starts is turn on trapping exits.

"Let it crash" only works if something starts the crashed process again. This page is about the thing that does.

## Page 5's worker, supervised

Here's page 5's worker again, the one that counts to 5 and fails one time in four, untouched. This time a supervisor starts it instead of the hand-written restarter ([supervised.exs](supervised.exs)):

```elixir
# A worker that counts, and fails one time in four
work = fn ->
  Enum.each(1..5, fn n ->
    Process.sleep(50)
    if :rand.uniform(4) == 1, do: raise("failed at #{n}")
    IO.puts("worker #{inspect(self())}: #{n}")
  end)
end

children = [
  Supervisor.child_spec({Task, work}, restart: :transient)
]

{:ok, supervisor} = Supervisor.start_link(children, strategy: :one_for_one)

# Unlinked, so the supervisor giving up doesn't end this script too
Process.unlink(supervisor)
ref = Process.monitor(supervisor)

receive do
  {:DOWN, ^ref, :process, _, reason} -> IO.puts("supervisor exited: #{inspect(reason)}")
after
  2000 -> IO.puts("supervisor still running, children: #{inspect(Supervisor.which_children(supervisor))}")
end
```

`Task` is Elixir's module for a process that runs one function and finishes. The script also swaps the logger's full crash report for one line per crash. Three runs:

```text
$ elixir supervised.exs
worker #PID<0.111.0>: 1
worker #PID<0.111.0>: 2
worker #PID<0.111.0> crashed: failed at 3
worker #PID<0.112.0>: 1
worker #PID<0.112.0> crashed: failed at 2
worker #PID<0.113.0> crashed: failed at 1
worker #PID<0.114.0>: 1
worker #PID<0.114.0>: 2
worker #PID<0.114.0>: 3
worker #PID<0.114.0> crashed: failed at 4
supervisor exited: :shutdown
$ elixir supervised.exs
worker #PID<0.111.0> crashed: failed at 1
worker #PID<0.112.0>: 1
worker #PID<0.112.0>: 2
worker #PID<0.112.0>: 3
worker #PID<0.112.0> crashed: failed at 4
worker #PID<0.113.0>: 1
worker #PID<0.113.0>: 2
worker #PID<0.113.0> crashed: failed at 3
worker #PID<0.114.0>: 1
worker #PID<0.114.0>: 2
worker #PID<0.114.0>: 3
worker #PID<0.114.0>: 4
worker #PID<0.114.0>: 5
supervisor still running, children: [{Task, :undefined, :worker, [Task]}]
$ elixir supervised.exs
worker #PID<0.111.0>: 1
worker #PID<0.111.0>: 2
worker #PID<0.111.0>: 3
worker #PID<0.111.0>: 4
worker #PID<0.111.0>: 5
supervisor still running, children: [{Task, :undefined, :worker, [Task]}]
```

It behaves like page 5's restarter. Each crash gets a new worker, with a new pid, counting from 1 again. After the fourth crash the supervisor gives up and exits, with the reason `:shutdown`. By default a supervisor allows 3 restarts in 5 seconds, and a fourth inside that window is too many.

`restart: :transient` says to restart the worker only if it crashed, as page 5's restarter did. When the worker finishes normally, the supervisor leaves it finished. Unlike the restarter, though, the supervisor doesn't exit when that happens. It keeps running with its child listed and the pid `:undefined`, meaning not running, in case it's asked to start it again.

## What a supervisor needs to know

A supervisor starts its children from a *child specification*, a map that says how to start the child and what to do when it exits. Page 6 said `use GenServer` writes a `child_spec/1` function for you. Here's page 6's ticket server, given to a supervisor, along with the spec it wrote ([tickets.exs](tickets.exs)):

```elixir
defmodule Tickets do
  use GenServer

  def start_link(left), do: GenServer.start_link(__MODULE__, left, name: Tickets)

  def init(left), do: {:ok, left}

  def handle_call({:buy, n}, _from, left) when n <= left, do: {:reply, :ok, left - n}
  def handle_call({:buy, _n}, _from, left), do: {:reply, :sold_out, left}
  def handle_call(:left, _from, left), do: {:reply, left, left}

  def handle_cast({:add, n}, left), do: {:noreply, left + n}
end

IO.puts("child spec: #{inspect(Tickets.child_spec(10), charlists: :as_lists)}")

{:ok, _supervisor} = Supervisor.start_link([{Tickets, 10}], strategy: :one_for_one)

show = fn label ->
  IO.puts("#{label}: Tickets is #{inspect(Process.whereis(Tickets))}, #{GenServer.call(Tickets, :left)} left")
end

show.("started")
GenServer.call(Tickets, {:buy, 3})
GenServer.cast(Tickets, {:add, 5})
show.("bought 3, added 5")

GenServer.cast(Tickets, {:add, "5"})
Process.sleep(10)
show.("added \"5\"")
```

```text
$ elixir tickets.exs
child spec: %{id: Tickets, start: {Tickets, :start_link, [10]}}
started: Tickets is #PID<0.109.0>, 10 left
bought 3, added 5: Tickets is #PID<0.109.0>, 12 left
added "5": Tickets is #PID<0.110.0>, 10 left
```

`{Tickets, 10}` in the list of children means "ask `Tickets` for its child spec, passing 10". The spec has an `id` the supervisor knows the child by, and a `start`: a module, a function, and its arguments. To start the child, the supervisor calls `Tickets.start_link(10)`. It's `start_link` and not page 6's `start` because the server has to be linked to the supervisor, so the supervisor gets its `{:EXIT, ...}` message when it dies. Anything the spec leaves out has a default:

- `restart: :permanent`: always restart it. The other choices are `:transient`, restart it only if it crashed, and `:temporary`, never restart it.
- `shutdown: 5000`: when the supervisor stops it, how many milliseconds to give it before killing it.
- `type: :worker`: it's a worker, not another supervisor.

Then a bad request crashed the server. `left + "5"` raises an error, so `handle_cast` never returned, and the server died. The supervisor started a new one at once, and the next call worked. Nobody else had to know anything had happened. The new server has a new pid, but callers don't hold the pid; they use the name `Tickets`, which the new server registered as it started. A name is how a process that's restarted stays findable.

It has 10 tickets, not 12. As page 5 said, a restart can only bring a process back to how it started, and how it started is whatever `init/1` returns. The 3 sold and the 5 added were lost along with the request that crashed it. Losing the bad request is the point. Losing the good state with it is the price.

## When one child dies

A supervisor with more than one child has to decide what a crash means for the others. That's its *strategy*. Here are three children, `a`, `b`, and `c`, started in that order, under each strategy in turn, with `b` crashing ([strategies.exs](strategies.exs)):

```elixir
defmodule Child do
  use GenServer

  def start_link(name), do: GenServer.start_link(__MODULE__, name, name: name)

  def init(name) do
    # Trapping exits, so terminate/2 runs when the supervisor stops it
    Process.flag(:trap_exit, true)
    IO.puts("  #{name} started as #{inspect(self())}")
    {:ok, name}
  end

  def handle_cast(:crash, name), do: raise("#{name} crashed")

  def terminate(:shutdown, name), do: IO.puts("  #{name} stopped by the supervisor")
  def terminate(_reason, name), do: IO.puts("  #{name} crashed")
end

children = [
  Supervisor.child_spec({Child, :a}, id: :a),
  Supervisor.child_spec({Child, :b}, id: :b),
  Supervisor.child_spec({Child, :c}, id: :c)
]

for strategy <- [:one_for_one, :one_for_all, :rest_for_one] do
  IO.puts("## #{strategy}")
  {:ok, supervisor} = Supervisor.start_link(children, strategy: strategy)
  IO.puts("b crashes:")
  GenServer.cast(:b, :crash)
  Process.sleep(100)
  IO.puts("stopping the supervisor:")
  Supervisor.stop(supervisor)
  IO.puts("")
end
```

```text
$ elixir strategies.exs
## one_for_one
  a started as #PID<0.109.0>
  b started as #PID<0.110.0>
  c started as #PID<0.111.0>
b crashes:
  b crashed
  b started as #PID<0.112.0>
stopping the supervisor:
  c stopped by the supervisor
  b stopped by the supervisor
  a stopped by the supervisor

## one_for_all
  a started as #PID<0.114.0>
  b started as #PID<0.115.0>
  c started as #PID<0.116.0>
b crashes:
  b crashed
  c stopped by the supervisor
  a stopped by the supervisor
  a started as #PID<0.117.0>
  b started as #PID<0.118.0>
  c started as #PID<0.119.0>
stopping the supervisor:
  c stopped by the supervisor
  b stopped by the supervisor
  a stopped by the supervisor

## rest_for_one
  a started as #PID<0.121.0>
  b started as #PID<0.122.0>
  c started as #PID<0.123.0>
b crashes:
  b crashed
  c stopped by the supervisor
  b started as #PID<0.124.0>
  c started as #PID<0.125.0>
stopping the supervisor:
  c stopped by the supervisor
  b stopped by the supervisor
  a stopped by the supervisor
```

- `:one_for_one` restarted `b` and left `a` and `c` alone. It's for children that don't depend on each other, which is most of them.
- `:one_for_all` stopped `a` and `c` too, then started all three again. It's for children that can't work without each other, so that one dying leaves the rest in a state that no longer makes sense.
- `:rest_for_one` stopped `c`, the child started after `b`, and restarted `b` and `c`, leaving `a` alone. It's for when children started later depend on the ones started earlier. Since `c` depends on `b`, it can't carry on without the `b` it knew. Since `a` was started first, it doesn't depend on `b` at all.

Armstrong's thesis describes the first two as "OR" and "AND" supervisors: "AND supervision is used for dependent, or co-ordinated processes", and in an OR tree "the failure of one child has no consequence for the other children".

The run also shows the order. A supervisor starts its children in the order they're listed, each one's `init/1` finishing before the next starts, and stops them in reverse. Stopping a child is page 5's `Process.exit(pid, :shutdown)`. A child that isn't trapping exits dies of it at once. One that is trapping exits, like these, gets to run its `terminate/2` callback and clean up, and the supervisor waits for it, 5 seconds by default, before sending `:kill`.

## Too many restarts

A supervisor gives up when restarts come too fast. Elixir's default is more than 3 restarts in 5 seconds. Here's one worker crashed four times in quick succession, and then six times two seconds apart ([intensity.exs](intensity.exs)):

```elixir
defmodule Worker do
  use GenServer

  def start_link(clock), do: GenServer.start_link(__MODULE__, clock, name: Worker)

  def init(clock) do
    IO.puts("  #{clock.()} worker started as #{inspect(self())}")
    {:ok, nil}
  end

  def handle_cast(:crash, _state), do: raise("crashed")
end

crash_every = fn gap, times ->
  t0 = System.monotonic_time(:millisecond)
  clock = fn -> since.(t0) end
  {:ok, supervisor} = Supervisor.start_link([{Worker, clock}], strategy: :one_for_one)
  Process.unlink(supervisor)
  ref = Process.monitor(supervisor)

  Enum.each(1..times, fn _ ->
    Process.sleep(gap)
    IO.puts("  #{clock.()} crashing the worker")
    GenServer.cast(Worker, :crash)
  end)

  receive do
    {:DOWN, ^ref, :process, _, reason} -> IO.puts("  #{clock.()} supervisor exited: #{inspect(reason)}")
  after
    100 -> IO.puts("  #{clock.()} supervisor still running")
  end
end

IO.puts("## Four crashes, 100 ms apart")
crash_every.(100, 4)

IO.puts("\n## Six crashes, two seconds apart")
crash_every.(2000, 6)
```

`since` gives the milliseconds since `t0`:

```text
$ elixir intensity.exs
## Four crashes, 100 ms apart
      0 ms worker started as #PID<0.109.0>
    103 ms crashing the worker
    105 ms worker started as #PID<0.110.0>
    204 ms crashing the worker
    204 ms worker started as #PID<0.111.0>
    305 ms crashing the worker
    305 ms worker started as #PID<0.112.0>
    406 ms crashing the worker
    406 ms supervisor exited: :shutdown

## Six crashes, two seconds apart
      0 ms worker started as #PID<0.114.0>
   2001 ms crashing the worker
   2002 ms worker started as #PID<0.115.0>
   4002 ms crashing the worker
   4002 ms worker started as #PID<0.116.0>
   6003 ms crashing the worker
   6003 ms worker started as #PID<0.117.0>
   8004 ms crashing the worker
   8004 ms worker started as #PID<0.118.0>
  10005 ms crashing the worker
  10005 ms worker started as #PID<0.119.0>
  12006 ms crashing the worker
  12006 ms worker started as #PID<0.120.0>
  12107 ms supervisor still running
```

Four crashes in 300 ms were one too many, and the supervisor stopped trying. Six crashes spread over ten seconds were never more than 3 in any 5, so it restarted the worker every time and would go on doing so.

The limit is there for page 5's reason: a worker that fails because of something passing will probably work the next time, and one that fails because of a bug will fail every time. The OTP docs: "The intention of the restart mechanism is to prevent a situation where a process repeatedly dies for the same reason, only to be restarted again." A supervisor that gives up stops all its children, in reverse order, and then exits with the reason `:shutdown`.

And that exit goes somewhere, because a supervisor is a process like any other, linked to whatever started it.

## A tree of supervisors

A supervisor's children can be supervisors. Here the top supervisor starts a worker, `counter`, and a second supervisor, `Pair`, which starts two workers of its own, `x` and `y`. Then `x` crashes four times in quick succession ([tree.exs](tree.exs)):

```elixir
defmodule Pair do
  use Supervisor

  def start_link(_), do: Supervisor.start_link(__MODULE__, nil, name: Pair)

  def init(nil) do
    IO.puts("  Pair started as #{inspect(self())}")
    children = [
      Supervisor.child_spec({Child, :x}, id: :x),
      Supervisor.child_spec({Child, :y}, id: :y)
    ]
    Supervisor.init(children, strategy: :one_for_one)
  end
end

children = [
  Supervisor.child_spec({Child, :counter}, id: :counter),
  Pair
]

{:ok, _top} = Supervisor.start_link(children, strategy: :one_for_one)

for n <- 1..4 do
  Process.sleep(100)
  IO.puts("x crashes (#{n}):")
  GenServer.cast(:x, :crash)
end

Process.sleep(100)
IO.puts("after:")
for name <- [:counter, Pair, :x, :y] do
  IO.puts("  #{inspect(name)} is #{inspect(Process.whereis(name))}")
end
```

`Child` is the GenServer from strategies.exs, without the trapping exits or `terminate/2`:

```text
$ elixir tree.exs
  counter started as #PID<0.112.0>
  Pair started as #PID<0.113.0>
  x started as #PID<0.114.0>
  y started as #PID<0.115.0>
x crashes (1):
  x started as #PID<0.116.0>
x crashes (2):
  x started as #PID<0.117.0>
x crashes (3):
  x started as #PID<0.118.0>
x crashes (4):
  Pair started as #PID<0.119.0>
  x started as #PID<0.120.0>
  y started as #PID<0.121.0>
after:
  :counter is #PID<0.112.0>
  Pair is #PID<0.119.0>
  :x is #PID<0.120.0>
  :y is #PID<0.121.0>
```

`Pair` restarted `x` three times. On the fourth crash it gave up, stopped `y`, and exited. To the top supervisor that was one child crashing, its first, so it restarted `Pair`, and the new `Pair` started a new `x` and a new `y`. The counter, in another branch, never noticed.

That's how a supervision tree handles a failure. It's tried as close to where it happened as possible, and if restarting there doesn't fix it, it moves up a level and restarts a bigger piece. `y` was restarted though it had done nothing wrong, because it was part of the piece that wasn't working. Armstrong's version: "Supervision trees are trees of Supervisors", and "Supervisors monitor Workers and Supervisors." The AXD301, the Ericsson switch OTP was first built for, had a supervision tree of 141 nodes.

The OTP docs point out that the tries multiply as they go up. If each level allows 10 restarts, "a crashing child below that level will be restarted 100 times, which is probably excessive."

At the top of every Elixir program is a supervisor. An application's `start/2` callback starts its supervision tree, and Elixir's docs say it "has to spawn and link a supervisor". If that top supervisor gives up, the application stops. In a release, a program packaged by Mix to be deployed, applications are started `:permanent` by default, which means "the node shuts down if the application terminates". At that point the whole BEAM exits, and as page 5 said, something outside it has to start it again.

## And in Node?

The closest thing to a supervisor in Node's standard library is the `cluster` module, which runs copies of a program in separate processes. Its docs are clear that the restarting is up to you: "Node.js does not automatically manage the number of workers, however. It is the application's responsibility to manage the worker pool based on its own needs." Their example restarts a worker every time it exits, with no limit.

Here's supervised.exs again in Node, with worker threads, page 5's closest thing to BEAM processes, and the supervisor written by hand, giving up after more than 3 restarts in 5 seconds ([supervise.mjs](supervise.mjs)):

```javascript
const work = `
  const { threadId } = require("node:worker_threads");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    for (let n = 1; n <= 5; n++) {
      await sleep(50);
      if (Math.random() < 0.25) throw new Error("failed at " + n);
      console.log("worker " + threadId + ": " + n);
    }
  })();
`;

function supervise(source, { maxRestarts = 3, maxSeconds = 5 } = {}) {
  const restarts = [];
  const start = () => {
    const worker = new Worker(source, { eval: true });
    worker.on("error", () => {}); // the exit code says it failed
    worker.on("exit", (code) => {
      if (code === 0) return;
      const now = Date.now();
      while (restarts.length && restarts[0] < now - maxSeconds * 1000) restarts.shift();
      if (restarts.length >= maxRestarts) {
        console.log("supervisor: too many restarts, giving up");
        process.exit(1);
      }
      restarts.push(now);
      start();
    });
  };
  start();
}

supervise(work);
```

Two runs:

```text
$ node supervise.mjs; echo "exit code $?"
node v25.9.0
worker 1: 1
worker 2: 1
worker 2: 2
worker 2: 3
worker 3: 1
worker 3: 2
worker 4: 1
worker 4: 2
worker 4: 3
worker 4: 4
supervisor: too many restarts, giving up
exit code 1
$ node supervise.mjs; echo "exit code $?"
node v25.9.0
worker 1: 1
worker 1: 2
worker 2: 1
worker 2: 2
worker 2: 3
worker 3: 1
worker 3: 2
worker 3: 3
worker 4: 1
worker 4: 2
worker 4: 3
worker 4: 4
worker 4: 5
exit code 0
```

The threads don't print their crashes, but each new thread id is a restart. When it gives up, it ends the whole program with an error code, for an outside monitor to restart, which is what a release does when its top supervisor gives up.

That's about twenty lines, and it works. It's also one strategy for one child. The rest of what a supervisor does is yours to write: several children, and what one dying means for the others; starting them in order and stopping them in reverse, waiting a while for each and then forcing it; a way for the rest of the program to find the new worker, since anything holding the old `Worker` object is holding a dead thread; and supervisors of supervisors. And page 2's measurements still apply. A worker thread is about 9 MB and a BEAM process about 2.6 KB, so a Node program supervises a few threads where an Elixir program can supervise a process for every connection.

## Watch it happen

Here's tree.exs's tree, with a third worker under `Pair` so there's a child on each side of the middle one. Each worker counts once a second, and that count is its state. It's a simulation that follows the rules above, slowed down so you can follow each signal, except that restarts are counted in real seconds.

Click a process to pick it. The controls under the boxes act on whichever one is picked. Try these:

1. Pick `x` and crash it. `Pair` gets the `{:EXIT, ...}` message and starts a new `x`, counting from 0. `y` and `z` carry on.
2. Pick `Pair`, set its strategy to `:one_for_all`, then pick `y` and crash it. `Pair` stops `z`, then `x`, and starts `x`, `y`, and `z` again, in that order.
3. Set `Pair`'s strategy to `:rest_for_one` and crash `y` again. This time `x` keeps counting.
4. Reset, pick `x`, and crash it four times, quickly. On the fourth, `Pair` gives up, stops its other children, and exits, and the top supervisor starts a new `Pair`.
5. Pick `z`, set its restart to `:transient`, and let it finish. It isn't restarted. Set it back to `:permanent` and let it finish: a permanent child is restarted even when it finishes normally.
6. Pick `Pair` and kill it. Its children are linked to it and don't trap exits, so they die with it, and the top supervisor starts the whole branch again.
7. Reset, pick `counter`, and crash it four times, quickly. Now the top supervisor gives up. It stops `Pair`, which stops its own children first, and the application stops.

<supervision-tree>

![The simulation just after a restart. The top supervisor, with the strategy :one_for_one and 0 of 3 restarts in 5 seconds, is linked to counter, which has counted to 11, and to Pair. Pair's strategy is :one_for_all, and it has had 1 of 3 restarts. Its three children, x, y, and z, have new pids, #PID<0.116.0> to #PID<0.118.0>, and have just started counting again from 0. The log underneath says Pair received y's {:EXIT, ...} message, stopped z and then x with :shutdown, and started x, y, and z again, in order](supervision-tree.webp)

*The live version of this needs JavaScript. In it, you can crash, finish, or kill any process in the tree, choose each supervisor's strategy and each worker's restart value, and watch the supervisors stop and restart their children.*

</supervision-tree>

<script type="module" src="supervision-tree.js"></script>

## Where it gives ground

A supervisor restarts a process from the beginning, so whatever the process held is gone, as the ticket server's 12 tickets were. Anything that has to survive a crash needs to be kept somewhere else: in another process, or a database, or on disk.

Restarting fixes failures that pass. It doesn't fix bugs. A bug that crashes a process every time will exhaust its supervisor's restarts, then its parent's, all the way up the tree, and in the end it stops the whole node. That's by design, since a system that can't run correctly is better stopped, but it means the tree's shape and its limits are decisions you have to get right: which processes depend on which, in what order they start, and how many restarts in how long each level allows.

Starting is serialized too. A supervisor starts its children one at a time, and each GenServer's `start_link` "does not return until `init/1` has returned". So a child that's slow to start, like one that connects to a database in its `init/1`, holds up every child after it, and the supervisors above it.

## Sources

- The scripts and their runs: [supervised.exs](supervised.exs), [tickets.exs](tickets.exs), [strategies.exs](strategies.exs), [intensity.exs](intensity.exs), [tree.exs](tree.exs), and [supervise.mjs](supervise.mjs), run 2026-11-15 on an Apple M1 (8 cores) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1) and Node v25.9.0.
- A supervisor being a `gen_server` that traps exits: [supervisor.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/supervisor.erl#L297) and [L911](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/supervisor.erl#L911). Counting restarts within the period: [`add_restart`, L2187–L2217](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/supervisor.erl#L2187-L2217).
- Child specifications, their keys and defaults (`:permanent`, 5,000 ms for a worker, `:worker`), restart values, shutdown values, the `{module, arg}` form calling `child_spec/1`, `use GenServer` defining it, the three strategies, `:max_restarts` and `:max_seconds` defaulting to 3 and 5, children started in order and stopped in reverse with a `:shutdown` exit signal and then `:kill`, `terminate` running for a child that traps exits, and a supervisor that reaches its limit exiting with `:shutdown`: Elixir's [Supervisor docs](https://hexdocs.pm/elixir/1.19.5/Supervisor.html). `Task`'s default `:restart` of `:temporary`: [Task](https://hexdocs.pm/elixir/1.19.5/Task.html). Name registration: [GenServer, Name registration](https://hexdocs.pm/elixir/1.19.5/GenServer.html#module-name-registration). `start_link` not returning "until `init/1` has returned": [`GenServer.start_link/3`](https://hexdocs.pm/elixir/1.19.5/GenServer.html#start_link/3).
- "The intention of the restart mechanism is to prevent a situation where a process repeatedly dies for the same reason", a supervisor that gives up terminating its children and then itself with the reason `shutdown`, the next supervisor up restarting it or terminating itself, and restart limits multiplying across levels: the OTP design principles, [Supervisor Behaviour](https://www.erlang.org/doc/system/sup_princ.html#maximum-restart-intensity).
- OR and AND supervisors, and "Supervision trees are trees of Supervisors": Joe Armstrong, [*Making reliable distributed systems in the presence of software errors*](https://erlang.org/download/armstrong_thesis_2003.pdf) (2003), pages 118–123 (section 5.2). The AXD301's supervision tree of 141 nodes: page 174 (section 8.3.1).
- An application's `start/2` callback having to "spawn and link a supervisor": Elixir's [Application docs](https://hexdocs.pm/elixir/1.19.5/Application.html). A permanent application terminating taking "the entire Erlang node" with it: [`application:start/2`](https://www.erlang.org/doc/apps/kernel/application.html#start/2). Releases starting applications `:permanent` by default: [`mix release`, Options](https://hexdocs.pm/mix/1.19.5/Mix.Tasks.Release.html#module-options).
- Node not managing the number of workers, and restarting one from the `'exit'` event: Node's [cluster docs](https://nodejs.org/api/cluster.html). Worker threads and their `'exit'` event: page 5's sources. A worker thread's memory: page 2.
