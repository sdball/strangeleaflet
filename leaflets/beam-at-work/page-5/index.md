---
title: When a process dies
tags: elixir, beam, nodejs
publish: false
meta_description: A BEAM process that crashes takes nothing else down with it, unless it was told to. Links, trapping exits, and monitors, and the restarter they add up to.
---

We've repeatedly seen the same rule: no process can access another's memory. That's why each process can collect its own garbage, and why processes must talk by sending messages that include copies of their data. This page is about the reason that rule is there in the first place: what happens when a process crashes.

Here's a server with twelve connections, once in the BEAM and once in Node. Send it a message that hits a bug.

<one-bad-message>

![The simulation just after #6's message hit a bug, side by side. On the BEAM side, 12 processes, 1 per connection, 11 of 12 are still connected: #6's tile is outlined in red and its count has stopped, and the other eleven are still counting. Under them: #6's process crashed, and nothing noticed. The rest carry on. On the Node side, 1 process for all 12 connections, 0 of 12 are still connected, in red: every tile is outlined in red with its count stopped, and under them: The process exited, and everyone went with it, not just #6.](one-bad-message.webp)

*The live version of this needs JavaScript. In it, you can send the server a message that hits a bug, in the BEAM and in Node side by side.*

</one-bad-message>

<script type="module" src="one-bad-message.js"></script>

In Node, one bad message ended every connection. An error that nothing catches ends the whole process by default, and everything the process held goes with it. In the BEAM it ended one connection, and the other eleven carried on. But nothing noticed that one crash, either, and nothing started it again.

Joe Armstrong, one of Erlang's creators, wrote that processes "should share no data, and only communicate by message passing. This is to limit the consequences of a software error." And went on: "the only realistic way to build large reliable systems is by partitioning the system into independent parallel processes, and by providing mechanisms for monitoring and restarting these processes."

This page is about the first half of the mechanisms he's talking about: the ways a process finds out that another one died. The BEAM has two, links and monitors, and they're built right into the BEAM itself.

## A crash stays in its process

Here are three processes counting, each once every 100 ms. The second raises an error when it gets to 3 ([alone.exs](alone.exs)):

```elixir
defmodule Counter do
  def start(name, crash_at), do: spawn(fn -> count(name, crash_at, 1) end)

  defp count(name, crash_at, n) do
    Process.sleep(100)
    if n == crash_at, do: raise("#{name} crashed at #{n}")
    IO.puts("#{name}: #{n}")
    count(name, crash_at, n + 1)
  end
end

a = Counter.start("a", nil)
b = Counter.start("b", 3)
c = Counter.start("c", nil)

Process.sleep(550)
IO.puts("a alive? #{Process.alive?(a)}, b alive? #{Process.alive?(b)}, c alive? #{Process.alive?(c)}")
```

```text
$ elixir alone.exs
c: 1
b: 1
a: 1
c: 2
b: 2
a: 2
c: 3
a: 3

17:16:26.559 [error] Process #PID<0.109.0> raised an exception
** (RuntimeError) b crashed at 3
    alone.exs:9: Counter.count/3
c: 4
a: 4
c: 5
a: 5
a alive? true, b alive? false, c alive? true
```

`b` died, the error was logged, and `a` and `c` carried on counting. Nothing of `b`'s was shared with them, so nothing of theirs could be left half-changed by its crash. Its heap, its stack, and its mailbox went with it. (The same three counters in Node, further down, end together.)

That's the isolation Armstrong was after, but not the monitoring. Nothing observed `b` die and reacted to that event. If `a` and `c` had been waiting for `b` to send them something, they'd wait forever. A process that dies needs a way to tell the processes that depend on it.

## Links: die together

A link ties two processes together. When either one dies, the BEAM sends the other an *exit signal* carrying the reason it died, and by default a process that gets an exit signal dies too, with the same reason. `spawn_link` starts a process already linked to the one that started it, and `Process.link` links two that are already running.

Here are four ways linked processes can end. [link.exs](link.exs) runs the same four scenes and checks which processes are still alive afterwards.

<link-scenes>

```elixir
IO.puts("## A linked process crashes")
parent =
  spawn(fn ->
    spawn_link(fn ->
      Process.sleep(100)
      raise "oops"
    end)

    idle.()
  end)

check.(parent: parent)

IO.puts("\n## The other way round")
me = self()

parent =
  spawn(fn ->
    send(me, {:child, spawn_link(idle)})
    Process.sleep(100)
    raise "oops"
  end)

child = receive do: ({:child, pid} -> pid)
check.(parent: parent, child: child)

IO.puts("\n## A linked process finishes normally")

parent =
  spawn(fn ->
    spawn_link(fn -> Process.sleep(100) end)
    idle.()
  end)

check.(parent: parent)

IO.puts("\n## A chain: a is linked to b, b to c, and c crashes")
a = spawn(idle)

b =
  spawn(fn ->
    Process.link(a)
    idle.()
  end)

c =
  spawn(fn ->
    Process.link(b)
    Process.sleep(100)
    raise "oops"
  end)

check.(a: a, b: b, c: c)
```

```text
$ elixir link.exs
## A linked process crashes
parent alive? false

## The other way round
parent alive? false, child alive? false

## A linked process finishes normally
parent alive? true

## A chain: a is linked to b, b to c, and c crashes
a alive? false, b alive? false, c alive? false
```

*The live version of this needs JavaScript. In it, the four scenes play on a loop, with their exit signals travelling along the links.*

</link-scenes>

<script type="module" src="link-scenes.js"></script>

A link works both ways: the child's crash took down its parent, and the parent's crash took down its child. It doesn't care which process made it.

A process that finishes normally doesn't take anything with it. Every process exits with a reason, and when it simply runs out of code to run, the reason is `:normal`. An exit signal with the reason `:normal` is dropped by any process that isn't trapping exits (more on that below). So finishing your work isn't a crash, as far as links are concerned.

And signals travel along chains of links. When `c` crashed, its exit signal killed `b`, and `b` dying sent its own exit signal, with the same reason, to `a`.

Why would you want a crash to spread? Because processes that work on one job together are no use apart. If a process handling a request starts helpers to fetch things for it and then crashes, the helpers are left working for nobody; if a helper crashes, the request it was helping can't finish. Linked, they all go together, and nothing is left behind holding memory or waiting on a reply that'll never come. Elixir's guide says, "The majority of times we spawn processes in Elixir, we spawn them as linked processes."

## Trapping exits

Dying together is the default, but a process can opt out. `Process.flag(:trap_exit, true)` tells the BEAM to turn exit signals arriving at that process into ordinary messages, `{:EXIT, pid, reason}`, put on the end of its mailbox like any other. The process doesn't die; it reads the message whenever it gets to it, and decides what to do. Here are three scenes with trapping, from [trap.exs](trap.exs):

<link-scenes scenes="trap">

```elixir
IO.puts("## Trapping exits")
Process.flag(:trap_exit, true)
IO.puts("me: #{inspect(self())}")

crashes = spawn_link(fn -> Process.sleep(100); raise "oops" end)
IO.puts("crashes: #{inspect(crashes)}")
finishes = spawn_link(fn -> Process.sleep(100) end)
IO.puts("finishes: #{inspect(finishes)}")
Process.sleep(200)
show_mailbox.()

# ...

IO.puts("\n## A chain: a is linked to b, b to c, b traps exits, and c crashes")
a = spawn(idle)

b =
  spawn(fn ->
    Process.flag(:trap_exit, true)
    Process.link(a)

    receive do
      message -> IO.puts("b received #{show.(message)}")
    end

    idle.()
  end)

c = spawn(fn -> Process.link(b); Process.sleep(100); raise "oops" end)
check.(a: a, b: b, c: c)

IO.puts("\n## :kill, sent to a process that traps exits")
stubborn = spawn_link(fn -> Process.flag(:trap_exit, true); idle.() end)
Process.sleep(10)
Process.exit(stubborn, :kill)
check.(stubborn: stubborn)
receive do
  message -> IO.puts("me: received #{show.(message)}")
end
```

`show` prints a message with a crash's stack trace shortened to `stacktrace`, to keep the lines short:

```text
$ elixir trap.exs
## Trapping exits
me: #PID<0.101.0>
crashes: #PID<0.104.0>
finishes: #PID<0.105.0>
mailbox: {:EXIT, #PID<0.104.0>, {%RuntimeError{message: "oops"}, stacktrace}} {:EXIT, #PID<0.105.0>, :normal}

## A chain: a is linked to b, b to c, b traps exits, and c crashes
b received {:EXIT, #PID<0.108.0>, {%RuntimeError{message: "oops"}, stacktrace}}
a alive? true, b alive? true, c alive? false

## :kill, sent to a process that traps exits
stubborn alive? false
me: received {:EXIT, #PID<0.109.0>, :killed}
```

*The live version of this needs JavaScript. In it, the three scenes play on a loop, with their exit signals travelling along the links and arriving as messages.*

</link-scenes>

The parent trapped exits, so both of its children's exits arrived as messages: the crash, with the error and where it happened, and the normal exit too, which a process that traps exits does get told about.

In the chain, `b` trapping exits stopped the crash from spreading. It got a message, and `a`, on the far side of it, never heard a thing.

`Process.exit(pid, reason)` sends an exit signal by hand, as if a linked process had died with that reason. One reason is special. `:kill` can't be trapped, so the process dies however it's set up, with the reason `:killed`. That's the way to stop a process that's stuck, or that's trapping exits and not stopping when asked. The reason changes from `:kill` to `:killed` to tell the processes linked to it that it was killed. Here the parent, trapping exits, got a `:killed` message and carried on.

## Monitors: watch without being tied

A link is for processes that live and die together. Sometimes a process just needs to know when another one dies, without dying with it, and without the other one having any say. That's a monitor.

`Process.monitor(pid)` returns a reference, and when that process exits, for any reason, the BEAM sends any monitoring process a message: `{:DOWN, ref, :process, pid, reason}`. It's always a message, never an exit signal. Here are six scenes with monitors, from [monitor.exs](monitor.exs):

<link-scenes scenes="monitors">

```elixir
IO.puts("## Monitoring a process that crashes")
crashes = spawn(fn -> Process.sleep(100); raise "oops" end)
ref = Process.monitor(crashes)
IO.puts("monitoring #{inspect(crashes)}, ref #{inspect(ref)}")
receive_one.()

IO.puts("\n## ...that finishes normally")
finishes = spawn(fn -> Process.sleep(100) end)
Process.monitor(finishes)
receive_one.()

IO.puts("\n## ...that's already gone")
Process.monitor(crashes)
receive_one.()

IO.puts("\n## ...twice")
twice = spawn(fn -> Process.sleep(100); exit(:done) end)
Process.monitor(twice)
Process.monitor(twice)
receive_one.()
receive_one.()

IO.puts("\n## The watcher crashes")
watched = spawn(idle)

watcher =
  spawn(fn ->
    Process.monitor(watched)
    Process.sleep(100)
    raise "oops"
  end)

Process.sleep(200)
IO.puts("watcher alive? #{Process.alive?(watcher)}, watched alive? #{Process.alive?(watched)}")

IO.puts("\n## spawn_monitor, and Process.exit")
{pid, _ref} = spawn_monitor(idle)
Process.exit(pid, :shutdown)
receive_one.()
```

`receive_one` waits up to half a second for a message and prints it:

```text
$ elixir monitor.exs
## Monitoring a process that crashes
monitoring #PID<0.104.0>, ref #Reference<0.2306361067.576454663.233651>
received {:DOWN, #Reference<0.2306361067.576454663.233651>, :process, #PID<0.104.0>, {%RuntimeError{message: "oops"}, stacktrace}}

## ...that finishes normally
received {:DOWN, #Reference<0.2306361067.576454663.233710>, :process, #PID<0.105.0>, :normal}

## ...that's already gone
received {:DOWN, #Reference<0.2306361067.576454663.233725>, :process, #PID<0.104.0>, :noproc}

## ...twice
received {:DOWN, #Reference<0.2306361067.576454663.233732>, :process, #PID<0.106.0>, :done}
received {:DOWN, #Reference<0.2306361067.576454663.233733>, :process, #PID<0.106.0>, :done}

## The watcher crashes
watcher alive? false, watched alive? true

## spawn_monitor, and Process.exit
received {:DOWN, #Reference<0.2306361067.576454663.233754>, :process, #PID<0.109.0>, :shutdown}
```

*The live version of this needs JavaScript. In it, the six scenes play on a loop, with their `:DOWN` messages travelling back along the monitors.*

</link-scenes>

A crash, a normal exit, and an exit with a reason of the process's own choosing (`exit(:done)`) all came as `:DOWN` messages with their reasons. Monitoring a process that was already gone got a `:DOWN` at once, with the reason `:noproc`, no such process, so there's no gap between checking whether a process is alive and starting to watch it. Each monitor is separate, with its own reference, and each sends its own `:DOWN`. And a monitor only goes one way: the watcher crashing did nothing to the process it was watching.

The reference is how the watcher tells its `:DOWN` messages apart, and it's a reference like the ones `make_ref()` makes: new and unique. `GenServer.call` uses that. It monitors the server it's calling, so if the server dies before it replies, the caller gets a `:DOWN` instead of waiting forever, and it uses the monitor's reference to tag the reply.

So the two fit different jobs:

|  | Link | Monitor |
| --- | --- | --- |
| Goes | both ways | one way: the watcher hears about the watched |
| When the other process exits | an exit signal, which kills it unless the reason is `:normal` | a `:DOWN` message, whatever the reason |
| Trapping exits | turns exit signals into `{:EXIT, pid, reason}` messages | not needed |
| More than one | one link between any two processes | each `Process.monitor` call is another monitor |
| For | processes that can't do without each other | knowing when a process you depend on goes |

## Who restarts it?

Armstrong's thesis lists Erlang's ideas about errors as slogans: "Let some other process do the error recovery. If you can't do what you want to do, die. Let it crash. Do not program defensively." Links and trapping exits are how the first one works. "If the process Pid1 fails and if the processes Pid1 and Pid2 are linked together and if process Pid2 is set to trap errors then a message of the form {'EXIT',Pid1,Why} will be delivered to Pid2 if Pid1 fails." Then "it is Pid2's job to correct the error", and the simplest way to correct it is to start the process again.

Here's a restarter that does that. It traps exits, starts a worker linked to it, and whenever the worker exits with any reason but `:normal`, starts a new one. After three restarts it gives up and exits itself. The worker counts to 5, failing one time in four at each step. Here are two ways a run of [restart.exs](restart.exs) can go:

<link-scenes scenes="restart">

```elixir
defmodule Restarter do
  def start(work, tries) do
    spawn(fn ->
      Process.flag(:trap_exit, true)
      loop(work, spawn_link(work), tries)
    end)
  end

  defp loop(work, worker, tries) do
    receive do
      {:EXIT, ^worker, :normal} ->
        IO.puts("restarter: the worker finished")

      {:EXIT, ^worker, _reason} when tries == 0 ->
        IO.puts("restarter: the worker crashed again, giving up")
        exit(:too_many_restarts)

      {:EXIT, ^worker, {e, _stacktrace}} ->
        IO.puts("restarter: the worker crashed (#{Exception.message(e)}), starting a new one")
        loop(work, spawn_link(work), tries - 1)
    end
  end
end

# A worker that counts, and fails one time in four
work = fn ->
  Enum.each(1..5, fn n ->
    Process.sleep(50)
    if :rand.uniform(4) == 1, do: raise("failed at #{n}")
    IO.puts("worker #{inspect(self())}: #{n}")
  end)
end

restarter = Restarter.start(work, 3)
ref = Process.monitor(restarter)

receive do
  {:DOWN, ^ref, :process, _, reason} -> IO.puts("restarter exited: #{inspect(reason)}")
end
```

```text
$ for i in 1 2 3 4; do elixir restart.exs; done
worker #PID<0.109.0>: 1
worker #PID<0.109.0>: 2
worker #PID<0.109.0>: 3
restarter: the worker crashed (failed at 4), starting a new one
worker #PID<0.110.0>: 1
worker #PID<0.110.0>: 2
worker #PID<0.110.0>: 3
worker #PID<0.110.0>: 4
restarter: the worker crashed (failed at 5), starting a new one
worker #PID<0.111.0>: 1
restarter: the worker crashed (failed at 2), starting a new one
worker #PID<0.112.0>: 1
restarter: the worker crashed again, giving up
restarter exited: :too_many_restarts
restarter: the worker crashed (failed at 1), starting a new one
worker #PID<0.110.0>: 1
restarter: the worker crashed (failed at 2), starting a new one
restarter: the worker crashed (failed at 1), starting a new one
worker #PID<0.112.0>: 1
worker #PID<0.112.0>: 2
worker #PID<0.112.0>: 3
restarter: the worker crashed again, giving up
restarter exited: :too_many_restarts
restarter: the worker crashed (failed at 1), starting a new one
worker #PID<0.110.0>: 1
worker #PID<0.110.0>: 2
worker #PID<0.110.0>: 3
worker #PID<0.110.0>: 4
worker #PID<0.110.0>: 5
restarter: the worker finished
restarter exited: :normal
restarter: the worker crashed (failed at 1), starting a new one
worker #PID<0.110.0>: 1
worker #PID<0.110.0>: 2
restarter: the worker crashed (failed at 3), starting a new one
restarter: the worker crashed (failed at 1), starting a new one
worker #PID<0.112.0>: 1
worker #PID<0.112.0>: 2
worker #PID<0.112.0>: 3
worker #PID<0.112.0>: 4
worker #PID<0.112.0>: 5
restarter: the worker finished
restarter exited: :normal
```

*The live version of this needs JavaScript. In it, two runs play on a loop: one where a restart works, and one where the restarter gives up.*

</link-scenes>

The worker has no error handling at all. It does its job, and when something goes wrong it dies, and the restarter, which does nothing else, deals with it. Each new worker has a new pid and starts counting from 1, because a restart is a new process. Whatever the old one had built up died with it, the bad along with the good. A restart can only bring a process back to how it started.

That's what makes giving up necessary. A worker that fails because of something passing, like a dropped connection, will probably work the second time. One that fails because of a bug will fail every time, and restarting it forever only hides that. So the restarter stops after a few tries and exits, and since it's an ordinary process, something linked to it can find out and decide what to do next.

This is a small, hand-written version of a supervisor. A real supervisor handles more: several workers, what to do with the rest when one dies, how many restarts in how long count as too many. But it's built from these same pieces. A supervisor is a process that traps exits, links to the processes it starts, and restarts them when their `{:EXIT, ...}` messages arrive. It's written as a GenServer.

## And in Node?

In Node, a whole program runs in one process, and its callbacks share one heap. Here's alone.exs again, as three intervals, run three ways: throwing an error, with `b` failing in an `await` instead of a `throw`, and with an `'uncaughtException'` handler ([uncaught.mjs](uncaught.mjs)):

<link-scenes scenes="node">

```javascript
const mode = process.argv[2] ?? "default";
console.log(`node ${process.version}, mode: ${mode}`);

if (mode === "handler") {
  process.on("uncaughtException", (err) => console.log(`uncaughtException: ${err.message}`));
}
process.on("exit", (code) => console.log(`process exiting, code ${code}`));

const count = (name, crashAt) => {
  let n = 0;
  const timer = setInterval(async () => {
    n += 1;
    if (n === crashAt) {
      clearInterval(timer);
      if (mode === "async") await Promise.reject(new Error(`${name} crashed at ${n}`));
      throw new Error(`${name} crashed at ${n}`);
    }
    console.log(`${name}: ${n}`);
  }, 100);
  return timer;
};

const timers = [count("a"), count("b", 3), count("c")];

setTimeout(() => {
  console.log("still running at 550 ms");
  timers.forEach(clearInterval);
}, 550);
```

The first two runs also print `b`'s stack trace, which goes to the terminal's error output, omitted here:

```text
$ node uncaught.mjs 2>/dev/null; node uncaught.mjs async 2>/dev/null; node uncaught.mjs handler
node v25.9.0, mode: default
a: 1
b: 1
c: 1
a: 2
b: 2
c: 2
a: 3
process exiting, code 1
node v25.9.0, mode: async
a: 1
b: 1
c: 1
a: 2
b: 2
c: 2
a: 3
process exiting, code 1
node v25.9.0, mode: handler
a: 1
b: 1
c: 1
a: 2
b: 2
c: 2
a: 3
uncaughtException: b crashed at 3
c: 3
a: 4
c: 4
a: 5
c: 5
still running at 550 ms
process exiting, code 0
```

*The live version of this needs JavaScript. In it, the three runs play on a loop, with the counters inside one Node process.*

</link-scenes>

By default, one counter's error ended all three, and the whole program dies with them. The Node docs: "By default, Node.js handles such exceptions by printing the stack trace to `stderr` and exiting with code 1". A rejected promise that nothing handles goes the same way, and has since Node 15.

With a handler, the other two carried on. But the docs are blunt about that: "Unhandled exceptions inherently mean that an application is in an undefined state," and "**It is not safe to resume normal operation after `'uncaughtException'`.**" That's Armstrong's point from the other side. Everything in a Node process shares one heap, so a callback that throws halfway through changing something leaves it half-changed, and the rest of the program can't know what's still safe to depend on. The BEAM can carry on safely after a crash because whatever the process was changing when it crashed dies with it.

What the Node docs recommend instead is the BEAM's idea but external to the language or application: "To restart a crashed application in a more reliable way, whether `'uncaughtException'` is emitted or not, an external monitor should be employed in a separate process to detect application failures and recover or restart as needed." Let it crash, and have something else restart it, where the thing that crashes is an entire operating system process, with every connection and every piece of work it had going down entirely.

Inside a NodeJS process, worker threads are the closest thing to BEAM processes. A worker that throws ends only itself, and the main thread hears about it through the worker's `'error'` and `'exit'` events. Restarting it is up to us. Here the main thread's `'exit'` handler does what restart.exs's restarter does, starting a new worker when one exits with any code but 0, up to three times. The first worker fails at 3 ([worker-exit.mjs](worker-exit.mjs)):

<link-scenes scenes="node-worker">

```javascript
// A worker that counts to 5, once every 100 ms, unless it fails first
const work = `
  const { threadId, workerData } = require("node:worker_threads");
  let n = 0;
  const timer = setInterval(() => {
    n += 1;
    if (n === workerData.failAt) throw new Error(\`failed at \${n}\`);
    console.log(\`worker \${threadId}: \${n}\`);
    if (n === 5) clearInterval(timer);
  }, 100);
`;

let tries = 3;

const start = (failAt) => {
  const worker = new Worker(work, { eval: true, workerData: { failAt } });
  const id = worker.threadId; // -1 once the worker has stopped
  worker.on("error", (err) => console.log(`main: worker ${id} error: ${err.message}`));
  worker.on("exit", (code) => {
    console.log(`main: worker ${id} exit, code ${code}`);
    if (code === 0) return;
    if (tries === 0) return console.log("main: giving up");
    tries -= 1;
    console.log("main: starting a new worker");
    start(null);
  });
};

start(3);
```

```text
$ node worker-exit.mjs
node v25.9.0
worker 1: 1
worker 1: 2
main: worker 1 error: failed at 3
main: worker 1 exit, code 1
main: starting a new worker
worker 2: 1
worker 2: 2
worker 2: 3
worker 2: 4
worker 2: 5
main: worker 2 exit, code 0
```

*The live version of this needs JavaScript. In it, the first worker throws, its events travel to the main thread, and the main thread starts a new worker, on a loop.*

</link-scenes>

That's a monitor: one way, a notification, and the main thread carries on, here to start a new worker with a new thread id, counting from 1. There's nothing like a link, though; if two workers should go down together, you have to hand write the code that terminates one when the other exits. And workers cost about 9 MB of memory each, so they're for a few big jobs, not for every individual request like you'd do with BEAM processes.

## Links and monitors together

Here are the processes from this page, together: the restarter, trapping exits and linked to a worker; the worker, linked to two helpers it started; a watcher, monitoring the worker; and a counter, linked to nothing. The restarter behaves like restart.exs's, restarting the worker up to three times. It's a simulation that follows the rules above, slowed down so you can follow each signal.

Click a process to pick it. The buttons under the boxes act on whichever one is picked. Try these:

1. Pick helper 1 and crash it. Its exit signal kills the worker, the worker's kills helper 2, and the restarter, trapping exits, gets a message and starts a new worker and new helpers. The watcher gets a `:DOWN`, and the counter never notices.
2. Pick the new worker and crash it. The watcher hears nothing this time: its monitor went with the old worker. Pick the watcher and have it monitor the worker again.
3. Pick the worker and let it finish. Its helpers drop the `:normal` signal and carry on, linked to nothing now, and the restarter doesn't restart anything.
4. Reset, pick the restarter, and turn off its trapping. Then pick a helper and crash it. Nothing stops the crash this time, and it takes everything but the watcher and the counter with it.
5. Reset, pick the worker, and turn on its trapping. Then pick a helper and crash it. The worker gets a message and carries on without it.
6. Reset, pick the restarter, leave it trapping exits, and kill it. Trapping doesn't help against `:kill`, and its `:killed` takes the worker and helpers with it.

<beam-links>

![The simulation a few seconds after helper 1 crashed. On top, the watcher, the restarter, and the counter; the restarter is outlined in brass because it traps exits, and it shows 1 of 3 restarts. Below it is a new worker, #PID<0.116.0>, linked to the restarter and to two new helpers, #PID<0.117.0> and #PID<0.118.0>. There's no monitor line from the watcher: its monitor went with the old worker. The counter, linked to nothing, has counted to 5. The log underneath says helper 2 got an exit signal from the worker and exited with the same error, the watcher received a :DOWN message for the old worker, #PID<0.113.0>, and the restarter started a new worker, which started two new helpers](beam-links.webp)

*The live version of this needs JavaScript. In it, you can crash, finish, or kill any of these processes, switch trapping exits on and off, and watch exit signals travel along the links and `:DOWN` messages along the monitor.*

</beam-links>

<script type="module" src="beam-links.js"></script>

## Tradeoffs

A crash in the BEAM is contained to its process, and that's only as good as the way the processes are split up. A process holding something important, like a cache that took minutes to fill, loses all of it when it crashes, and its restart starts from empty. Anything that has to survive a crash has to live somewhere durable: another process, a database, a disk.

Links spread failures intentionally, which means a careless link spreads them by accident. Link a short-lived helper to a long-lived process that isn't trapping exits, and the helper's crash takes the long-lived process with it.

The BEAM itself is one operating system process. Everything on this page happens inside it. If the whole thing goes down then something external has to restart it, just as with Node. Distribution, more than one BEAM on more than one machine, is the BEAM's answer to that: Armstrong's thesis puts workers and supervisors "on different physical machines".

## Sources

- The scripts and their runs: [alone.exs](alone.exs), [link.exs](link.exs), [trap.exs](trap.exs), [monitor.exs](monitor.exs), [restart.exs](restart.exs), [uncaught.mjs](uncaught.mjs), and [worker-exit.mjs](worker-exit.mjs), run 2026-11-15 (link.exs and worker-exit.mjs again 2026-11-25, after changes) on an Apple M1 (8 cores) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1) and Node v25.9.0.
- Share-nothing processes "to limit the consequences of a software error", and "providing mechanisms for monitoring and restarting these processes": Joe Armstrong, [*Making reliable distributed systems in the presence of software errors*](https://erlang.org/download/armstrong_thesis_2003.pdf) (2003), page 19 (section 2.3). The slogans, "Let some other process fix the error", the `{'EXIT',Pid1,Why}` message, "it is Pid2's job to correct the error", workers and supervisors on "different physical machines", and "Let it crash": pages 104–107 (sections 4.3 to 4.4).
- Exit reasons, `normal` for a process with no more code to run, links being bidirectional with only one between two processes, exit signals carrying the exit reason, and what a process does with one (dropped if `normal` and not trapping, terminated if not trapping, turned into `{'EXIT', SenderID, Reason}` if trapping, `kill` untrappable and turned into `killed`): the Erlang reference manual, [Processes](https://www.erlang.org/doc/system/ref_man_processes.html): [Process Termination](https://www.erlang.org/doc/system/ref_man_processes.html#process-termination), [Links](https://www.erlang.org/doc/system/ref_man_processes.html#links), [Sending Exit Signals](https://www.erlang.org/doc/system/ref_man_processes.html#sending_exit_signals), and [Receiving Exit Signals](https://www.erlang.org/doc/system/ref_man_processes.html#receiving_exit_signals). Monitors being unidirectional, the `'DOWN'` message, `noproc` at once for a process that doesn't exist, and each call creating an independent monitor: [Monitors](https://www.erlang.org/doc/system/ref_man_processes.html#monitors).
- `exit/2`, and `kill` becoming `killed` "to hint to linked processes that the killed process got killed": [`erlang:exit/2`](https://www.erlang.org/doc/apps/erts/erlang.html#exit/2). `trap_exit`: [`process_flag/2`](https://www.erlang.org/doc/apps/erts/erlang.html#process_flag_trap_exit). [`link/1`](https://www.erlang.org/doc/apps/erts/erlang.html#link/1), [`monitor/2`](https://www.erlang.org/doc/apps/erts/erlang.html#monitor/2). Elixir's wrappers: [Process](https://hexdocs.pm/elixir/1.19.5/Process.html).
- "The majority of times we spawn processes in Elixir, we spawn them as linked processes": Elixir's guide, [Processes](https://hexdocs.pm/elixir/1.19.5/processes.html#links).
- A supervisor being a `gen_server` that traps exits: [supervisor.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/supervisor.erl#L297) and [L911](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/supervisor.erl#L911).
- An uncaught exception printing the stack trace and exiting with code 1, the handler overriding that, "It is not safe to resume normal operation", and an external monitor in a separate process: Node's [process docs, `'uncaughtException'`](https://nodejs.org/api/process.html#event-uncaughtexception) and [Warning: Using `'uncaughtException'` correctly](https://nodejs.org/api/process.html#warning-using-uncaughtexception-correctly). Unhandled rejections raised as uncaught exceptions by default since v15.0.0: [`--unhandled-rejections`](https://nodejs.org/api/cli.html#--unhandled-rejectionsmode). A worker that throws being terminated, and its `'error'` and `'exit'` events: [worker_threads, Event: `'error'`](https://nodejs.org/api/worker_threads.html#event-error).
