---
tags: elixir, beam, nodejs
publish: false
meta_description: How Elixir runs code, and why one busy loop can't stop everything else
---

Here's a tiny experiment. A ticker prints a line every 100 milliseconds. At 350 milliseconds, something else starts a pile of slow math that takes about a second. The question: does the ticker keep ticking while the math runs?

Let's ask Node.js first, then Elixir.

## The experiment in Node

The slow math is the classic slow Fibonacci: `fib(n)` calls itself twice, for every number down to 1. Asking for `fib(40)` makes about 331 million calls. That's our busy loop.

```javascript
// The slow way on purpose: about 330 million calls for fib(40)
const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));

const start = performance.now();

const log = (message) => {
  const elapsed = Math.round(performance.now() - start);
  console.log(`${String(elapsed).padStart(4)} ms  ${message}`);
};

let n = 0;
const ticker = setInterval(() => log(`tick ${++n}`), 100);

setTimeout(() => {
  log("busy loop starts");
  fib(40);
  log("busy loop ends");
  setTimeout(() => clearInterval(ticker), 350);
}, 350);
```

`setInterval` asks Node to call a function every 100 ms. `setTimeout` asks it to call one once, later. Those functions you hand over to be called later are **callbacks**.

## The same experiment in Elixir

If you don't read Elixir yet, here's the short version. `spawn` starts a **process**: a small, independent piece of running code. It's not an operating system process; it lives inside the BEAM, the virtual machine that runs Elixir (and Erlang). `receive` waits for a message, `send` sends one, `self()` is the current process's own address, and `:timer.send_interval` sends a process the same message over and over.

So the ticker is a process that gets a `:tick` message every 100 ms and prints a line. The busy loop is another process.

```elixir
defmodule Fib do
  # The slow way on purpose: about 330 million calls for fib(40)
  def fib(n) when n < 2, do: n
  def fib(n), do: fib(n - 1) + fib(n - 2)
end

defmodule Ticker do
  def loop(log, n) do
    receive do
      :tick ->
        log.("tick #{n}")
        loop(log, n + 1)
    end
  end
end

start = System.monotonic_time(:millisecond)

log = fn message ->
  elapsed = System.monotonic_time(:millisecond) - start
  IO.puts("#{String.pad_leading("#{elapsed}", 4)} ms  #{message}")
end

log.("schedulers online: #{System.schedulers_online()}")

spawn(fn ->
  :timer.send_interval(100, :tick)
  Ticker.loop(log, 1)
end)

Process.sleep(350)
me = self()

spawn(fn ->
  log.("busy loop starts")
  Fib.fib(40)
  log.("busy loop ends")
  send(me, :done)
end)

receive do
  :done -> Process.sleep(350)
end
```

Both scripts are here if you want to run them yourself: [ticker.mjs](ticker.mjs) and [ticker.exs](ticker.exs). You don't need to. The simulation further down shows the same thing in your browser.

## What happened

I ran both on an Apple M1 with 8 cores, with Node v25.9.0 and Elixir 1.19.5 on Erlang/OTP 28 (erts 16.3.1). This is the real output.

```text
$ node ticker.mjs
 101 ms  tick 1
 202 ms  tick 2
 303 ms  tick 3
 350 ms  busy loop starts
1347 ms  busy loop ends
1348 ms  tick 4
1450 ms  tick 5
1550 ms  tick 6
1652 ms  tick 7
```

Node's ticker went quiet for a whole second. Not one tick while `fib(40)` ran. And the nine ticks it missed never showed up: the interval just carried on from tick 4.

```text
$ elixir ticker.exs
   0 ms  schedulers online: 8
 102 ms  tick 1
 202 ms  tick 2
 302 ms  tick 3
 351 ms  busy loop starts
 402 ms  tick 4
 502 ms  tick 5
 602 ms  tick 6
 702 ms  tick 7
 802 ms  tick 8
 902 ms  tick 9
1002 ms  tick 10
1102 ms  tick 11
1150 ms  busy loop ends
1202 ms  tick 12
1302 ms  tick 13
1402 ms  tick 14
1502 ms  tick 15
```

Elixir's ticker didn't notice. Tick, tick, tick, every 100 ms, right through the busy loop.

But hang on. The BEAM had 8 **schedulers** there (more on those in a moment), one per core, and Node runs JavaScript on one thread. Maybe the busy loop just went to another core? So here's Elixir again, held to a single scheduler with the `+S 1` flag:

```text
$ elixir --erl "+S 1" ticker.exs
   0 ms  schedulers online: 1
 102 ms  tick 1
 202 ms  tick 2
 302 ms  tick 3
 351 ms  busy loop starts
 402 ms  tick 4
 502 ms  tick 5
 602 ms  tick 6
 702 ms  tick 7
 802 ms  tick 8
 902 ms  tick 9
1002 ms  tick 10
1102 ms  tick 11
1202 ms  tick 12
1302 ms  tick 13
1402 ms  tick 14
1502 ms  tick 15
1602 ms  tick 16
1702 ms  tick 17
1802 ms  tick 18
1902 ms  tick 19
1992 ms  busy loop ends
2002 ms  tick 20
2102 ms  tick 21
2202 ms  tick 22
2302 ms  tick 23
```

Still ticking. One scheduler, one core's worth of work, and the busy loop still couldn't shut the ticker out.

So it's not the extra cores that allows Elixir to be reliable here. Something else is going on.

## Why Node stops

Node runs your JavaScript on one thread, in a loop called the **event loop**. Each time around, it takes the next callback that's ready and calls it. The function that's running lives on the **call stack**, and there's only one call stack.

Once a callback starts, it runs until it returns. Node can't pause it halfway to let something else go. When the 100 ms timer comes due during `fib(40)`, its callback just waits in line until the stack is empty. Node's own guide says it plainly: because a thread that's busy with one thing can't get to anything else, "the fair treatment of clients is thus the responsibility of your application."

That's called **cooperative scheduling**. The code that's running decides when to give the thread back, by returning, and nothing can take it away sooner. Everything else gets a turn only when the running code cooperates.

That's by design, not a bug. Node is fast and simple because your code promises to hand the thread back quickly. If you need heavy math in Node, you split it into small pieces that each give the loop a turn, or you move it off the event loop entirely. (Page 8 comes back to that.)

## Why Elixir doesn't

The BEAM has a different design. Here are its parts, one at a time.

A **scheduler** is a thread inside the BEAM whose whole job is running processes. By default you get one per logical processor, so 8 on my M1.

Each scheduler has a **run queue**: a line of processes that are ready to run. The scheduler takes the process at the front and runs it.

How long does it get to run? That's measured in **reductions**. A reduction is a small unit of work, roughly one function call. Each process gets a budget of 4,000 reductions per turn. (It was 2,000 before OTP 20, so older write-ups, including [one of mine](/leaflets/about-elixir/page-3/), say 2,000.) The BEAM checks the budget every time a function is called. When it runs out, the process goes to the back of the line and the next one gets a turn. A process that's waiting for a message, like our ticker between ticks, steps out of the line until one arrives.

Taking the CPU back like that, without the running code agreeing to it, is called **preemption**, and the BEAM's schedulers are **preemptive**. That's the whole difference on this page: Elixir's scheduling is preemptive, and Node's is cooperative. Your busy loop doesn't have to be polite. It just runs out of reductions.

And it can't dodge the count. Elixir has no `while` loop. To repeat something, a function calls itself, or calls something like `Enum.each` that does, and every one of those calls is counted. `fib(40)` makes 331 million calls, so it gets sent to the back of the line around 80,000 times before it's done.

How long is one turn? My busy loop made 331 million calls in about 0.8 seconds, so roughly 400 million a second. At that pace, 4,000 reductions take about 10 microseconds. A ticker that comes due mid-turn waits ten millionths of a second at most.

One more piece. When a scheduler's run queue is empty, it doesn't sit idle while another scheduler has a line. It steals a process from that line, so work spreads across the cores without you arranging it. With 8 schedulers, the ticker and the busy loop could each have one to themselves.

## Watch it happen

Ten microseconds is too fast to see, so here's the same workload as a simulation, slowed way down. Three tickers instead of one, so the run queue has something in it. Both sides do the same work at the same pace; the only difference is how each runtime decides what runs next.

Press **Add a busy loop**. On the BEAM side, watch the running process's reductions count down from 4,000 and the busy loop go to the back of the queue. On the Node side, the busy loop takes the stack and the tick callbacks pile up behind it. Then try 2 or 4 schedulers, or three busy loops on one.

For the closest look, set the speed to **extra slow**, where one turn lasts about ten seconds. Then you can see preemption happen. The scheduler hands the busy loop its 4,000 reductions, counts every one of them down, and sends it to the back of the line, behind any ticker that came due while it ran. The ticker prints its tick, and then the busy loop gets its next turn.

<beam-vs-node>

```text
A moment from the simulation, one busy loop in each runtime

BEAM, 1 scheduler
  scheduler 1   running: busy 1 (3,300 of 4,000 reductions left)
                run queue: ticker C
  waiting for a tick: ticker A, ticker B
  output: A tick 1, B tick 1, C tick 1, busy loop 1 starts, A tick 2, B tick 2

Node.js, one thread
  call stack    running: busy 1 (7,000 to go, no budget)
                waiting for the stack: tick A, tick B, tick C
  output: A tick 1, B tick 1, C tick 1, busy loop 1 starts
```

*The live version of this needs JavaScript. In it, the BEAM's tickers keep ticking between the busy loop's turns, and Node's wait until it's done.*

</beam-vs-node>

<script type="module" src="beam-vs-node.js"></script>

The faint marks on the strips are the ideal: where every tick would land if nothing else wanted the CPU. The numbers at the top of each side score it against that ideal. **Behind now** is ticks that are due but haven't printed yet, **late so far** is ticks that printed late, and **skipped so far** is ticks that will never print.

With one scheduler, even one busy loop makes some of the BEAM's ticks late: a ticker that comes due mid-turn waits for that turn to end. Put three busy loops on one scheduler and both sides fall behind. There's only so much CPU, and preemption can't make more. The difference is what happens to the ticks that came due while they waited.

In the BEAM, the timer keeps sending `:tick` messages on schedule, and they wait in each ticker's mailbox. Every one gets printed, some of them late, and then the tickers are back on the ideal beat. (That's why the BEAM's "late so far" can run higher than Node's. It prints every tick.)

In Node, one late callback stands in for all the ticks its interval missed. The rest are skipped, and the next tick counts on from the late one. You can see that in the real output above: after the busy loop, Node's ticks came at 1348, 1450, and 1550 ms. Still 100 ms apart, but on a new beat instead of 1400, 1500, 1600.

That new beat has a side effect when there's more than one interval. Here are four: A, B, and D every 100 ms, C every 150 ms, with a short busy loop at 500 ms and a longer one at 1000 ms. ([intervals.mjs](intervals.mjs), same machine.)

```text
$ node intervals.mjs
busy loops: 500–560 ms, 1002–1433 ms
A  103 203 303 403 560 662 761 863 963 1434 1534 1636 1744 1845 1946
B  142 244 344 446 560 662 761 863 963 1434 1534 1636 1744 1845 1946
D  194 296 396 496 597 698 800 900 1433 1534 1636 1744 1845 1946
C  172 323 474 625 777 927 1434 1585 1744 1895
```

A and B both came due during the short busy loop. They both ran the moment it ended, Node counted each one's next tick from that same moment, and from then on they tick together. D wasn't due until just after, so it kept its own beat until the longer busy loop caught it too. C has a different period, so it can't lock on, but now it lands on the same millisecond as the others every so often (1434, 1744). The details shift from run to run; in another run the short busy loop lasted until 594 ms and caught D as well.

Nothing ever spreads them back out. A long-running Node process that now and then hits some CPU-bound work can slowly gather its same-period intervals into one burst. Page 8 comes back to this, and to the BEAM's side of it: it never skips a tick, so when there's more work than CPU, the work piles up instead.

So why did the real Elixir run never fall behind, even on one scheduler? Scale. In the simulation a turn is long next to the time between ticks, so a few busy loops push ticks late. On my M1 a turn is about 10 microseconds and the ticks are 100 milliseconds apart: room for 10,000 turns between ticks. You'd need around ten thousand busy processes on one scheduler before a ticker waited a whole tick.

Want to press the button on a real machine? [ticker-live.exs](ticker-live.exs) and [ticker-live.mjs](ticker-live.mjs) tick until you type `q` and Enter, and every press of Enter starts another `fib(40)` busy loop. In Elixir each busy loop is a new process, so it starts the moment you press Enter, and the ticker keeps ticking: with two busy loops sharing one scheduler (`elixir --erl "+S 1" ticker-live.exs`), the longest gap between ticks in my run was still 100 ms. In Node, reading the keyboard is a callback too, so a second Enter waits in line behind the busy loop that's running. When I tried it, one late tick slipped out between the two busy loops, and then the ticker went quiet again until the second one finished.

## Sources

- The busy loop and ticker runs: [ticker.mjs](ticker.mjs) and [ticker.exs](ticker.exs), run 2026-11-11 on an Apple M1 (8 cores) with Node v25.9.0 and Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1). The calls-per-second figure comes from the 8-scheduler run. The interactive runs: [ticker-live.exs](ticker-live.exs) and [ticker-live.mjs](ticker-live.mjs), same machine and versions, with the keypresses piped in.
- The 4,000 reduction budget: `CONTEXT_REDS` in erts's [erl_vm.h at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/erts/emulator/beam/erl_vm.h#L53), and 2,000 in [erl_vm.h at OTP-19.3](https://github.com/erlang/otp/blob/OTP-19.3/erts/emulator/beam/erl_vm.h#L39).
- Preemptive multitasking (the scheduler suspends a process and lets another run): *The BEAM Book*, [Concurrency, Parallelism, and Preemptive Multitasking](https://blog.stenmans.org/theBeamBook/#_concurrency_parallelism_and_preemptive_multitasking). The BEAM as "preemptive scheduling on top of cooperative scheduling", switching only at a function call or a `receive`: [Reductions](https://blog.stenmans.org/theBeamBook/#_reductions).
- Node's scheduling as cooperative: Node's guide puts fair turns on your code, and its fix for long work is code that "regularly yields (gives turns to) other pending events" ([Don't Block the Event Loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop#what-does-this-mean-for-application-design), [Partitioning](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop#partitioning)). Node's docs don't use the word "cooperative"; the definition (scheduling where the running code has to allow for its own suspension) is *The BEAM Book*'s, in [Reductions](https://blog.stenmans.org/theBeamBook/#_reductions).
- What a reduction is, the check on every function call, waiting processes leaving the queue, and "no way to loop forever without doing a function call": Erik Stenman, *The BEAM Book*, [Reductions](https://blog.stenmans.org/theBeamBook/#_reductions) and [What is a Reduction Really?](https://blog.stenmans.org/theBeamBook/#_what_is_a_reduction_really)
- Run queues and going to the back of the line: *The BEAM Book*, [Scheduling](https://blog.stenmans.org/theBeamBook/#_scheduling) and [The Ready Queue](https://blog.stenmans.org/theBeamBook/#_the_ready_queue).
- `:timer.send_interval/2` sending its message repeatedly, every interval: [Erlang's timer docs](https://www.erlang.org/doc/apps/stdlib/timer.html#send_interval/2). Node's late interval and its new beat: the real Node run above.
- Intervals counting their next tick from when their callback starts: Node v25.9.0's [lib/internal/timers.js](https://github.com/nodejs/node/blob/v25.9.0/lib/internal/timers.js#L599-L611) reads the time just before the callback and re-inserts the interval from it, and [src/env.cc](https://github.com/nodejs/node/blob/v25.9.0/src/env.cc#L1611) refreshes that clock first. The intervals locking together: [intervals.mjs](intervals.mjs), run on the same machine and versions as the ticker scripts.
- Idle schedulers stealing work: *The BEAM Book*, [Task Stealing](https://blog.stenmans.org/theBeamBook/#_task_stealing).
- One scheduler per logical processor by default, and the `+S` flag: the Erlang/OTP [erl command docs](https://www.erlang.org/doc/apps/erts/erl_cmd.html#+S).
- `System.schedulers_online/0`: [Elixir's System docs](https://hexdocs.pm/elixir/1.19.5/System.html#schedulers_online/0). `:timer.send_interval/2`: [Erlang's timer docs](https://www.erlang.org/doc/apps/stdlib/timer.html#send_interval/2).
- Node's one event loop, callbacks running to completion, and fairness being the application's job: [Don't Block the Event Loop (or the Worker Pool)](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop#what-does-this-mean-for-application-design), and splitting work up: [Partitioning](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop#partitioning).
- Timer callbacks waiting for other callbacks: [The Node.js Event Loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick#timers).
