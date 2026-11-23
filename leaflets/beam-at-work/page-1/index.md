---
tags: elixir, beam, nodejs
publish: false
meta_description: How Elixir runs code, and why one busy loop can't stop everything else
---

Let's consider a simple application. Three tickers that tick every 100 milliseconds. Then something starts a CPU-bound loop within the application that takes about 1000 milliseconds to run. Can the tickers keep ticking while the application is still working the loop?

Press **Add a busy loop** to trigger one (or more) of those CPU-bound loops and watch the effect on a BEAM application vs NodeJS.

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

This widget simulates that application in the BEAM and in NodeJS. The BEAM is the virtual machine that runs Elixir and Erlang applications.

The simulation behaves the way the real runs further down this page do. It's also slowed way down to make the differences between the application architectures more easily observable. Both sides do the same work at the same pace; the only difference is how each runtime decides what runs.

The faint marks on the strips are the ideal: where every tick would land if nothing else occupied the CPU. The numbers at the top of each side score it against that ideal. **Behind now** is ticks that are due but haven't printed yet, **late so far** is ticks that printed late, and **skipped so far** is ticks that will never print.

Node's tickers have no choice but to stop while the busy loop runs. The BEAM's tickers keep going and automatically recover to the correct (ideal) cadence without any explicit correction code. Why?

## The ticker application in Node

The slow math is the classic slow recursive Fibonacci: `fib(n)` calls itself twice, for every number down to 1. Asking for `fib(40)` makes about 331 million calls. That's the CPU-bound busy loop.

```javascript
// The slow way on purpose: about 330 million calls for fib(40)
const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));

const start = performance.now();
const elapsed = () => Math.floor(performance.now() - start);

// Each ticker starts `offset` ms in, then ticks every 100 ms and
// writes down when each tick ran.
const tickers = [["A", 0], ["B", 33], ["C", 67]].map(([name, offset]) => ({ name, offset, ticks: [] }));
for (const ticker of tickers) {
  setTimeout(() => {
    ticker.interval = setInterval(() => ticker.ticks.push(elapsed()), 100);
  }, ticker.offset);
}

let from, to;
setTimeout(() => {
  from = elapsed();
  fib(40);
  to = elapsed();
}, 350);

// Stop at 2490 ms: between beats, so every tick that's come due has had its
// chance to run
setTimeout(() => {
  for (const ticker of tickers) clearInterval(ticker.interval);
  report(tickers, from, to, elapsed());
}, 2490);

// report() prints a column per ticker: when each tick ran, then how many
// ticks the clock expected by the end and how many actually ran. It's in
// ticker.mjs.
```

`setInterval` asks Node to call a function every 100 ms. `setTimeout` asks it to call one once, later. Those functions you hand over to be called later are **callbacks**. The tickers start 0, 33, and 67 ms in, so their ticks come a third of a beat apart, as in the simulation.

## The ticker application in Elixir

If you don't read Elixir yet, here's the gist:

- `spawn` starts a **process**: a small, independent piece of code running on the BEAM VM
- `receive` waits for a message
- `send` sends a message
- `self()` is the current process's address
- `:timer.send_interval` sends a process the same message repeatedly
- `for` runs its block once for each item in a list and collects the results

So each ticker is a process that gets a `:tick` message every 100 ms and writes down when it handled it. The busy loop is another process.

```elixir
defmodule Fib do
  # The slow way on purpose: about 330 million calls for fib(40)
  def fib(n) when n < 2, do: n
  def fib(n), do: fib(n - 1) + fib(n - 2)
end

defmodule Ticker do
  # Writes down when each :tick message was handled, and hands the list
  # over when asked.
  def loop(elapsed, ticks) do
    receive do
      :tick -> loop(elapsed, [elapsed.() | ticks])
      {:report, to} -> send(to, {:ticks, self(), Enum.reverse(ticks)})
    end
  end
end

start = System.monotonic_time(:millisecond)
elapsed = fn -> System.monotonic_time(:millisecond) - start end

IO.puts("schedulers online: #{System.schedulers_online()}")

# Each ticker is a process that starts `offset` ms in, then gets a :tick
# message every 100 ms.
tickers =
  for {name, offset} <- [{"A", 0}, {"B", 33}, {"C", 67}] do
    pid =
      spawn(fn ->
        Process.sleep(offset)
        :timer.send_interval(100, :tick)
        Ticker.loop(elapsed, [])
      end)

    {name, offset, pid}
  end

# Stop at 2490 ms: between beats, so every tick that's come due has had its
# chance to run
Process.send_after(self(), :stop, 2490)

Process.sleep(350)
me = self()

spawn(fn ->
  from = elapsed.()
  Fib.fib(40)
  send(me, {:done, from, elapsed.()})
end)

{from, to} =
  receive do
    {:done, from, to} -> {from, to}
  end

receive do
  :stop -> :ok
end

end_at = elapsed.()

# Then each ticker hands over its list, and the script prints a column per
# ticker, as ticker.mjs does. It's in ticker.exs.
```

Both scripts are here if you want to run them yourself: [ticker.mjs](ticker.mjs) and [ticker.exs](ticker.exs).

## What happened

I ran both on an Apple M1 with 8 cores, with Node v25.9.0 and Elixir 1.19.5 on Erlang/OTP 28 (erts 16.3.1). Each script prints a column per ticker: when each of its ticks ran, in milliseconds from the start, and at the bottom, how many ticks the clock expected by the time the script stopped, and how many actually ran. If actual is lower than expected, ticks went missing.

```text
$ node ticker.mjs
busy loop 350–1359 ms, stopped at 2490 ms
    tick      A      B      C
       1    101    134    168
       2    202    236    269
       3    303    336   1359
       4   1359   1359   1460
       5   1460   1460   1561
       6   1561   1561   1662
       7   1663   1663   1763
       8   1763   1763   1864
       9   1864   1864   1965
      10   1965   1965   2066
      11   2066   2066   2167
      12   2167   2167   2269
      13   2269   2269   2370
      14   2370   2370   2470
      15   2471   2471
expected     24     24     24
  actual     15     15     14
```

Node's tickers went quiet for a whole second. Not one tick while `fib(40)` ran, from 350 to 1359 ms. When it ended, each ticker ran one late tick, all three at 1359 ms, and then carried on 100 ms apart. The ticks each one missed in between never showed up: by the end, A had run 15 of the 24 ticks the clock expected.

```text
$ elixir ticker.exs
schedulers online: 8
busy loop 352–1165 ms, stopped at 2492 ms
    tick      A      B      C
       1    103    137    171
       2    203    237    271
       3    303    337    371
       4    403    437    471
       5    503    537    571
       6    603    637    671
       7    703    737    771
       8    803    837    871
       9    903    937    971
      10   1003   1037   1071
      11   1103   1137   1171
      12   1203   1237   1271
      13   1303   1337   1371
      14   1403   1437   1471
      15   1503   1537   1571
      16   1603   1637   1671
      17   1703   1737   1771
      18   1803   1837   1871
      19   1903   1937   1971
      20   2003   2037   2071
      21   2103   2137   2171
      22   2203   2237   2271
      23   2303   2337   2371
      24   2403   2437   2471
expected     24     24     24
  actual     24     24     24
```

Elixir's tickers didn't notice. Tick, tick, tick, every 100 ms, right through the busy loop from 352 to 1165 ms, still a third of a beat apart, and every one of them ran every tick the clock expected.

But hang on. The BEAM had 8 **schedulers** there (more on those in a moment), one per core, and Node runs JavaScript on one thread. Maybe the busy loop just went to another core? So here's Elixir again, held to a single scheduler with the `+S 1` flag:

```text
$ elixir --erl "+S 1" ticker.exs
schedulers online: 1
busy loop 351–1980 ms, stopped at 2491 ms
    tick      A      B      C
       1    102    136    170
       2    202    236    270
       3    302    336    370
       4    402    436    470
       5    502    536    570
       6    602    636    670
       7    702    736    770
       8    802    836    870
       9    902    936    970
      10   1002   1036   1070
      11   1102   1136   1170
      12   1202   1236   1270
      13   1302   1336   1370
      14   1402   1436   1470
      15   1502   1536   1570
      16   1602   1636   1670
      17   1702   1736   1770
      18   1802   1836   1870
      19   1902   1936   1970
      20   2002   2036   2070
      21   2102   2136   2170
      22   2202   2236   2270
      23   2302   2336   2370
      24   2402   2436   2470
expected     24     24     24
  actual     24     24     24
```

Still ticking. One scheduler, one core's worth of work, and the busy loop still couldn't shut the tickers out.

So it's not the extra cores that allows Elixir to be reliable here. Something else is going on.

## Why Node stops

Node runs your JavaScript on one thread, in a loop called the **event loop**. Each time around, it takes the next callback that's ready and calls it. The function that's running lives on the **call stack**, and there's only one call stack.

Once a callback starts, it runs until it returns. Node can't pause it halfway to let something else go. When a ticker's timer comes due during `fib(40)`, its callback has to wait in line until the stack is empty. Node's own guide says it plainly: because a thread that's busy with one thing can't get to anything else, "the fair treatment of clients is thus the responsibility of your application."

That's called **cooperative scheduling**. The code that's running decides when to give the thread back, by returning, and nothing can take it away sooner. Everything else gets a turn only when the running code cooperates.

That's by design, not a bug. Node is fast and simple because your code promises to hand the thread back quickly. If you need heavy math in Node, you split it into small pieces that each give the loop a turn, or you move it off the event loop entirely.

## Why Elixir doesn't

The BEAM has a different design. Here are its parts, one at a time.

A **scheduler** is a thread inside the BEAM whose whole job is running processes. By default you get one per logical processor, so 8 on my M1.

Each scheduler has a **run queue**: a line of processes that are ready to run. The scheduler takes the process at the front and runs it. The key is that the scheduler only allows the process to run for a certain number of **reductions** before another process gets to run.

A reduction is a small unit of work, roughly one function call. Each process gets a budget of 4,000 reductions per turn (2,000 before OTP 20). The BEAM checks the budget every time a function is called. When it runs out, the process goes to the back of the line and the next one gets a turn. Additionally a process that's waiting for a message, like a ticker between ticks, takes itself out of the queue until a message arrives. There's no need to even get compute time if all you're doing is waiting for a message.

Taking the CPU back like that, without requiring the running code to return or yield, is called **preemption**, and the BEAM's schedulers are **preemptive schedulers**. That's the whole difference on this page: Elixir's scheduling is preemptive, and Node's is cooperative. The busy loop doesn't have to be polite or cleverly coded to efficiently allow shared work.

It also can't dodge the count. To repeat something, a function calls itself, or calls something like `Enum.each` that does, and every one of those calls is counted. `fib(40)` makes 331 million calls, so it gets sent to the back of the line around 80,000 times before it's done.

How long is one turn? My busy loop made 331 million calls in about 0.8 seconds, so roughly 400 million a second. At that pace, 4,000 reductions take about 10 microseconds. A ticker that comes due mid-turn waits ten millionths of a second at most.

When a scheduler's run queue is empty, it doesn't sit idle while another scheduler has a line. It steals a process from that line, so work naturally spreads across the cores without you arranging it. With 8 schedulers, the three tickers and the busy loop could end up each having one to themselves.

## Back to the simulation

Ten microseconds is too fast to see, which is why the simulation is slowed way down. Here it is again and slowed down even further by default to the slow setting so you can more easily watch the reductions count on the BEAM side.

Press **Add a busy loop**. On the BEAM side, watch the running process's reductions count down from 4,000 and the busy loop go to the back of the queue when it has zero reductions left. On the Node side, the busy loop takes the stack and the tick callbacks pile up behind it. Then try 2 or 4 schedulers, or three busy loops on one.

<beam-vs-node speed="slow">

```text
The moment the busy loop used up its first 4,000 reductions

BEAM, 1 scheduler
  scheduler 1   running: ticker B (3,900 of 4,000 reductions left)
                run queue: ticker C, busy 1 33%
  waiting for a tick: ticker A
  output: A tick 1, busy loop 1 starts

Node.js, one thread
  call stack    running: busy 1 (7,900 to go, no budget)
                waiting for the stack: tick B, tick C
  output: A tick 1, busy loop 1 starts
```

*The live version of this needs JavaScript. In it, the BEAM's busy loop goes to the back of the line after every 4,000 reductions, behind the tickers that came due, and Node's tick callbacks wait for the whole busy loop.*

</beam-vs-node>

For the closest look, set the speed to **extra slow**, where one turn lasts about ten seconds. Then you can see preemption happen. The scheduler hands the busy loop its 4,000 reductions, counts every one of them down, and sends it to the back of the line, behind any ticker that came due while it ran. The ticker prints its tick, and then the busy loop gets its next turn.

With one scheduler, even one busy loop makes some of the BEAM's ticks late: a ticker that comes due mid-turn waits for that turn to end. Put three busy loops on one scheduler and both sides fall behind. There's only so much CPU, and preemption can't make more. The difference is what happens to the ticks that came due while they waited.

In the BEAM, the timer keeps sending `:tick` messages on schedule, and they wait in each ticker's mailbox. Every one gets printed, some of them late, and then the tickers are back on the ideal beat without any code needed to handle timing correction.

In Node, one late callback stands in for all the ticks its interval missed. The rest are skipped, and the next tick counts on from the late one. You can see that in the real output above: after the busy loop, A's ticks came at 1359, 1460, 1561, and 1663 ms. Still 100 ms apart, but on a new beat instead of 1400, 1500, 1600, and nine ticks behind the clock for good.

That new beat has a side effect when there's more than one interval. Node's three tickers started a third of a beat apart. But then all three came due during the busy loop and all three ran the moment it ended. From that point onward Node counts each one's next tick from that same moment. At that point all of the intervals tick together and application level code would be required to enforce their timing differential.

A long-running Node process that now and then hits some CPU-bound work can slowly gather its same-period intervals into one burst. The BEAM never skips a tick, so when there's more work than CPU, the extra work piles up in mailboxes instead of being dropped.

Want to generate CPU loops at runtime for each of these approaches on your own machine? [ticker-live.exs](ticker-live.exs) and [ticker-live.mjs](ticker-live.mjs) have one ticker each, so you can read along as they tick. When you press "Enter" that will start a `fib(40)` busy loop. `q` will quit.

```sh
elixir ticker-live.exs                  # Elixir, the default schedulers
elixir --erl "+S 1" ticker-live.exs     # Elixir, one scheduler
node ticker-live.mjs                    # Node
```

Press Enter a few times while each one runs. In Elixir each busy loop is a new process (BEAM process, not operating system process), so it starts the moment you press Enter, and the ticker keeps ticking: with two busy loops sharing one scheduler (`elixir --erl "+S 1" ticker-live.exs`), the longest gap between ticks in my run was still 100 ms. In Node, reading the keyboard is a callback too, so a second Enter waits in line behind the busy loop that's running.


## Sources

- The busy loop and ticker runs: [ticker.mjs](ticker.mjs) and [ticker.exs](ticker.exs), run 2026-11-19 on an Apple M1 (8 cores) with Node v25.9.0 and Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1). The calls-per-second figure comes from the 8-scheduler run. The interactive runs: [ticker-live.exs](ticker-live.exs) and [ticker-live.mjs](ticker-live.mjs), same machine and versions, with the keypresses piped in.
- The 4,000 reduction budget: `CONTEXT_REDS` in erts's [erl_vm.h at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/erts/emulator/beam/erl_vm.h#L53), and 2,000 in [erl_vm.h at OTP-19.3](https://github.com/erlang/otp/blob/OTP-19.3/erts/emulator/beam/erl_vm.h#L39).
- Preemptive multitasking (the scheduler suspends a process and lets another run): *The BEAM Book*, [Concurrency, Parallelism, and Preemptive Multitasking](https://blog.stenmans.org/theBeamBook/#_concurrency_parallelism_and_preemptive_multitasking). The BEAM as "preemptive scheduling on top of cooperative scheduling", switching only at a function call or a `receive`: [Reductions](https://blog.stenmans.org/theBeamBook/#_reductions).
- Node's scheduling as cooperative: Node's guide puts fair turns on your code, and its fix for long work is code that "regularly yields (gives turns to) other pending events" ([Don't Block the Event Loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop#what-does-this-mean-for-application-design), [Partitioning](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop#partitioning)). Node's docs don't use the word "cooperative"; the definition (scheduling where the running code has to allow for its own suspension) is *The BEAM Book*'s, in [Reductions](https://blog.stenmans.org/theBeamBook/#_reductions).
- What a reduction is, the check on every function call, waiting processes leaving the queue, and "no way to loop forever without doing a function call": Erik Stenman, *The BEAM Book*, [Reductions](https://blog.stenmans.org/theBeamBook/#_reductions) and [What is a Reduction Really?](https://blog.stenmans.org/theBeamBook/#_what_is_a_reduction_really)
- Run queues and going to the back of the line: *The BEAM Book*, [Scheduling](https://blog.stenmans.org/theBeamBook/#_scheduling) and [The Ready Queue](https://blog.stenmans.org/theBeamBook/#_the_ready_queue).
- `:timer.send_interval/2` sending its message repeatedly, every interval: [Erlang's timer docs](https://www.erlang.org/doc/apps/stdlib/timer.html#send_interval/2). Node's late interval and its new beat: the real Node run above.
- Intervals counting their next tick from when their callback starts: Node v25.9.0's [lib/internal/timers.js](https://github.com/nodejs/node/blob/v25.9.0/lib/internal/timers.js#L599-L611) reads the time just before the callback and re-inserts the interval from it, and [src/env.cc](https://github.com/nodejs/node/blob/v25.9.0/src/env.cc#L1611) refreshes that clock first. The intervals locking together: the Node ticker run above.
- Idle schedulers stealing work: *The BEAM Book*, [Task Stealing](https://blog.stenmans.org/theBeamBook/#_task_stealing).
- One scheduler per logical processor by default, and the `+S` flag: the Erlang/OTP [erl command docs](https://www.erlang.org/doc/apps/erts/erl_cmd.html#+S).
- `System.schedulers_online/0`: [Elixir's System docs](https://hexdocs.pm/elixir/1.19.5/System.html#schedulers_online/0). `:timer.send_interval/2`: [Erlang's timer docs](https://www.erlang.org/doc/apps/stdlib/timer.html#send_interval/2).
- Node's one event loop, callbacks running to completion, and fairness being the application's job: [Don't Block the Event Loop (or the Worker Pool)](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop#what-does-this-mean-for-application-design), and splitting work up: [Partitioning](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop#partitioning).
- Timer callbacks waiting for other callbacks: [The Node.js Event Loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick#timers).
