---
tags: elixir, beam, nodejs
publish: false
meta_description: Where the BEAM doesn't help. Native code it calls can hold a scheduler the way a busy loop holds Node's thread, a huge heap is slow to collect, a mailbox has no limit, and what Node needs to match the rest.
---

<!-- Draft, complete 2026-11-19 apart from review: the opener, native code, raw speed, one huge heap, what Node needs, and the slow consumer (moved from page 4). -->

The pages so far have been about what the BEAM does that Node can't. This one is about where it doesn't help, starting with page 1's busy loop, written in C.

<native-code>

![The simulation just after the busy loops, four lanes. BEAM, the busy loop in Elixir: the strip has even ticks right through the shaded stretch where the busy loop ran. Took 0.78 s, and the ticker kept ticking. BEAM, the busy loop in C, as a NIF: a short shaded stretch with no ticks in it, then four red late ticks at once at its end, marked ×4. Took 0.31 s, and the ticker stopped. Its missed ticks all came at once. BEAM, the same NIF, marked dirty: even ticks through its short shaded stretch. Took 0.31 s on a dirty scheduler, and the ticker kept ticking. Node, the busy loop in JavaScript: a long shaded stretch with no ticks, then one red late tick. Took 1.00 s, and the ticker stopped. One late tick; the rest skipped.](native-code.webp)

*The live version of this needs JavaScript. In it, you can start page 1's busy loop in Elixir, in C as a NIF and as a dirty NIF, and in Node, and watch each one's ticker.*

</native-code>

<script type="module" src="native-code.js"></script>

Written in C, the busy loop was two and a half times as fast as in Elixir, and it stopped the BEAM's ticker as completely as Node's busy loop stopped Node's. Everything page 1 said about preemption is about code the BEAM runs itself. Code it calls out to, in C or Rust or anything else compiled to native code, runs until it returns, and the scheduler running it can't take it back. Marked dirty, the same C code ran just as fast, somewhere the ticker didn't need.

## Native code

A NIF is a native implemented function: a function written in C, or in another language compiled to native code, that's "called like any other functions without any difference to the caller". Here's page 1's `fib` as one, twice: once ordinary, and once marked as dirty CPU-bound work ([fib_nif.c](fib_nif.c)):

```c
#include <erl_nif.h>

static long fib(int n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

static ERL_NIF_TERM fib_nif(ErlNifEnv *env, int argc, const ERL_NIF_TERM argv[]) {
  int n;
  if (!enif_get_int(env, argv[0], &n)) return enif_make_badarg(env);
  return enif_make_long(env, fib(n));
}

static ErlNifFunc funcs[] = {
  {"fib", 1, fib_nif, 0},
  {"dirty_fib", 1, fib_nif, ERL_NIF_DIRTY_JOB_CPU_BOUND},
};

ERL_NIF_INIT(Elixir.Fib, funcs, NULL, NULL, NULL, NULL)
```

And here's page 1's ticker experiment again, with the busy loop calling one of them. The script compiles the C first, then loads it into a module whose functions it replaces ([nif.exs](nif.exs)):

```elixir
include = Path.join([:code.root_dir(), "usr", "include"])
{_, 0} = System.cmd("cc", ~w(-O2 -shared -undefined dynamic_lookup -I #{include} -o fib_nif.so fib_nif.c))

defmodule Fib do
  @on_load :load
  def load, do: :erlang.load_nif(~c"./fib_nif", 0)
  def fib(_n), do: :erlang.nif_error(:not_loaded)
  def dirty_fib(_n), do: :erlang.nif_error(:not_loaded)
end

# ...then page 1's ticker, and at 350 ms a process that calls
# Fib.fib(44) or Fib.dirty_fib(44)
```

It's `fib(44)` here, because in C `fib(40)` is over too quickly to see much. With one scheduler, as in page 1's `+S 1` run:

```text
$ elixir --erl "+S 1" nif.exs fib
   0 ms  schedulers online: 1, dirty CPU schedulers: 1
 102 ms  tick 1 (1 due)
 202 ms  tick 2 (2 due)
 302 ms  tick 3 (3 due)
 351 ms  busy loop starts: fib(44), in C
2496 ms  busy loop ends
2496 ms  tick 4 (24 due)
2497 ms  tick 5 (24 due)
2497 ms  tick 6 (24 due)
2497 ms  tick 7 (24 due)
2497 ms  tick 8 (24 due)
2497 ms  tick 9 (24 due)
2497 ms  tick 10 (24 due)
2497 ms  tick 11 (24 due)
2497 ms  tick 12 (24 due)
2497 ms  tick 13 (24 due)
2497 ms  tick 14 (24 due)
2497 ms  tick 15 (24 due)
2497 ms  tick 16 (24 due)
2497 ms  tick 17 (24 due)
2497 ms  tick 18 (24 due)
2497 ms  tick 19 (24 due)
2497 ms  tick 20 (24 due)
2497 ms  tick 21 (24 due)
2497 ms  tick 22 (24 due)
2497 ms  tick 23 (24 due)
2497 ms  tick 24 (24 due)
2502 ms  tick 25 (25 due)
2602 ms  tick 26 (26 due)
2702 ms  tick 27 (27 due)
2820 ms  tick 28 (28 due)
```

For two seconds, nothing: the same silence as Node's on page 1. Then the BEAM's difference shows in a different way. Every tick that came due was delivered once the scheduler was free, all twenty of them in a millisecond, and the ticker went back to its beat. None were skipped, as they were in Node. They were just very late.

The same function, marked dirty:

```text
$ elixir --erl "+S 1" nif.exs dirty_fib
   0 ms  schedulers online: 1, dirty CPU schedulers: 1
 102 ms  tick 1 (1 due)
 202 ms  tick 2 (2 due)
 302 ms  tick 3 (3 due)
 351 ms  busy loop starts: dirty_fib(44), in C
 402 ms  tick 4 (4 due)
 502 ms  tick 5 (5 due)
 602 ms  tick 6 (6 due)
 702 ms  tick 7 (7 due)
 802 ms  tick 8 (8 due)
 902 ms  tick 9 (9 due)
1002 ms  tick 10 (10 due)
1102 ms  tick 11 (11 due)
1202 ms  tick 12 (12 due)
1302 ms  tick 13 (13 due)
1402 ms  tick 14 (14 due)
1502 ms  tick 15 (15 due)
1602 ms  tick 16 (16 due)
1702 ms  tick 17 (17 due)
1802 ms  tick 18 (18 due)
1902 ms  tick 19 (19 due)
2002 ms  tick 20 (20 due)
2102 ms  tick 21 (21 due)
2202 ms  tick 22 (22 due)
2302 ms  tick 23 (23 due)
2402 ms  tick 24 (24 due)
2502 ms  tick 25 (25 due)
2545 ms  busy loop ends
2602 ms  tick 26 (26 due)
2702 ms  tick 27 (27 due)
2802 ms  tick 28 (28 due)
```

Every tick on time. A dirty NIF runs on one of the dirty schedulers page 2 counted among the BEAM's threads, not on the scheduler that runs the ticker.

More schedulers don't make the ordinary NIF safe. With all eight, in another run, the ticker still went quiet from the moment the NIF started at 351 ms until it returned at 2561 ms, and then printed tick 4 with 25 due. The dirty one, with eight, ticked on time throughout.

The NIF docs are direct about all of this. They start with a warning: "The VM _cannot_ provide the same services as provided when executing Erlang code, such as pre-emptive scheduling or memory protection. If the native function does not behave well, the whole VM will misbehave." Then: "A native function that crashes will crash the whole VM", which is page 5's isolation gone too. And a native function should "return to its caller within 1 millisecond". Work that can't be split up that small "is called a 'dirty NIF'", and runs "on a separate set of schedulers called dirty schedulers", which is what `ERL_NIF_DIRTY_JOB_CPU_BOUND` asks for.

Most Elixir programmers never write a NIF, but they may well call one. Erlang's own `crypto` module, for one, loads a NIF library when it starts, and its functions are native code. Wherever there's a NIF, the BEAM's guarantees stop at its edge.

## Raw speed

Why use native code at all? Because it's fast. Here's `fib(40)` timed on its own, in Elixir and as the NIFs above ([speed.exs](speed.exs)), and in Node ([speed.mjs](speed.mjs)):

```text
$ elixir speed.exs
fib(40): Elixir 780 ms, C NIF 309 ms, dirty C NIF 310 ms
fib(40): Elixir 780 ms, C NIF 309 ms, dirty C NIF 310 ms
fib(40): Elixir 780 ms, C NIF 309 ms, dirty C NIF 309 ms
$ node speed.mjs
fib(40): Node 1006 ms
fib(40): Node 1008 ms
fib(40): Node 1004 ms
```

For this one job, the BEAM wasn't slower than Node: 0.78 s against 1.0. One recursive function is a small sample, and other work will come out differently, so I wouldn't stretch that into a claim about speed in general. What it does show is where the speed is. C did the same work in 0.31 s, two and a half times as fast as either. The BEAM's way to that speed is native code, and native code is outside the BEAM's preemption and its isolation. A dirty NIF keeps the scheduler free, but a crash in it is still a crash of the whole VM.

## One huge heap

Page 3's builder kept 10 million pairs in its own heap, and spent much of its time collecting, a few hundred milliseconds at a time near the end. The BEAM kept that from holding up anyone else. It didn't make it any faster for the builder: a copying collector's work "is proportional to the amount of live data on the heap", and the builder's heap was nearly all live.

The usual answer is not to keep data like that in a process at all. ETS, Erlang term storage, is built into the BEAM, and its docs say it can "store very large quantities of data". A table isn't part of any process's heap: "every object insert and look-up operation results in a copy of the object", into the table or out of it. Here's the builder twice, once as on page 3 and once putting each pair in a table ([big-data.exs](big-data.exs)):

```elixir
defmodule Build do
  def heap(acc, 0), do: acc
  def heap(acc, n), do: heap([{n, n} | acc], n - 1)

  def ets(table, 0), do: table
  def ets(table, n) do
    :ets.insert(table, {n, n})
    ets(table, n - 1)
  end
end

# ...a builder process runs one of them on 10 million pairs, traced
# with :erlang.trace/3 as on page 3, and reports how long it took
```

```text
$ elixir big-data.exs heap; elixir big-data.exs ets
heap: built in 702 ms; the builder's heaps 590 MB
  its GCs while building: 68, 657 ms in all, longest 139 ms
ets: built in 3931 ms; the builder's heaps 0 MB, the table 611 MB
  its GCs while building: 136987, 162 ms in all, longest under 1 ms
```

Kept in its own heap, the list took 702 ms to build, and 657 ms of that was the builder collecting it. In a table it took more than five times as long, because every insert copied a pair into the table. But the builder's heap stayed almost empty, its collections were tiny (137,000 of them, none as long as a millisecond), and the 611 MB sat in the table, where no process's collector goes.

That's the trade: copying in and out, for data that's out of every collection. A table needs looking after, too. "There is no automatic garbage collection for tables": a table goes when the process that created it ends, or when it's deleted.

For data that's read all the time and hardly ever changes, like configuration, there's `persistent_term`, which doesn't even copy on a read: "the term is **not** copied to the heap (as is the case with terms stored in ETS tables)". It pays on writes instead: "When a persistent term is updated or deleted, a global garbage collection pass is run to scan all processes for the deleted term".

## What Node needs to match the BEAM

Page 1 left Node's tickers with two problems. While the busy loop ran, they couldn't tick at all. And afterwards each was on a new beat, about nine ticks behind for good, and every interval that came due during the busy loop was locked to that new beat from then on. Here's what it takes to fix both in Node ([fixed.mjs](fixed.mjs)).

The second is the smaller job. `setInterval` counts each tick from when the last one ran. A steady interval counts from the start, and runs the ticks it missed:

```javascript
// Like setInterval, except that tick n is due at start + n * period, and a
// tick that came due while the thread was busy runs late instead of not at all
const steadyInterval = (period, onTick) => {
  const start = performance.now();
  let n = 0;
  let timer;
  const fire = () => {
    while (start + (n + 1) * period <= performance.now()) onTick(++n);
    timer = setTimeout(fire, start + (n + 1) * period - performance.now());
  };
  timer = setTimeout(fire, period);
  return () => clearTimeout(timer);
};
```

Here's one of page 1's tickers with it, and the busy loop still on the main thread:

```text
$ node fixed.mjs main
 101 ms  tick 1 (1 due)
 200 ms  tick 2 (2 due)
 300 ms  tick 3 (3 due)
 351 ms  busy loop starts
1346 ms  busy loop ends
1347 ms  tick 4 (13 due)
1347 ms  tick 5 (13 due)
1347 ms  tick 6 (13 due)
1347 ms  tick 7 (13 due)
1347 ms  tick 8 (13 due)
1347 ms  tick 9 (13 due)
1347 ms  tick 10 (13 due)
1347 ms  tick 11 (13 due)
1347 ms  tick 12 (13 due)
1347 ms  tick 13 (13 due)
1401 ms  tick 14 (14 due)
1500 ms  tick 15 (15 due)
1600 ms  tick 16 (16 due)
```

Still nothing while the busy loop ran, but afterwards every tick that came due, and then back on the beat at 1401 ms. That's what the BEAM did with the ordinary NIF at the top of this page. And here are page 1's four intervals, each made steady:

```text
$ node fixed.mjs intervals
busy loops: 501–588 ms, 1001–1411 ms
A  103 201 302 402 588 601 702 802 901 1411 1411 1411 1411 1411 1503 1602 1702 1802 1902
B  142 241 342 441 589 642 741 841 941 1412 1412 1412 1412 1441 1541 1641 1741 1841 1942
D  191 292 391 491 591 692 792 891 991 1412 1412 1412 1412 1492 1591 1691 1791 1891 1991
C  172 321 472 620 771 920 1412 1412 1412 1521 1670 1820 1971
```

Each one catches up after each busy loop, then goes back to its own beat: A on the hundreds, B forty past, D ninety past, and C every 150 ms. Nothing locks together.

The first problem needs another thread. Here's the busy loop moved into a worker thread, which sends its result back as a message:

```javascript
if (!isMainThread) {
  parentPort.postMessage(fib(workerData));
} else {
  // ...the steady ticker, and at 350 ms:
  new Worker(new URL(import.meta.url), { workerData: 40 }).once("message", done);
}
```

```text
$ node fixed.mjs worker
 101 ms  tick 1 (1 due)
 200 ms  tick 2 (2 due)
 301 ms  tick 3 (3 due)
 351 ms  busy loop starts
 400 ms  tick 4 (4 due)
 500 ms  tick 5 (5 due)
 600 ms  tick 6 (6 due)
 700 ms  tick 7 (7 due)
 800 ms  tick 8 (8 due)
 900 ms  tick 9 (9 due)
1000 ms  tick 10 (10 due)
1100 ms  tick 11 (11 due)
1200 ms  tick 12 (12 due)
1300 ms  tick 13 (13 due)
1396 ms  busy loop ends
1400 ms  tick 14 (14 due)
1501 ms  tick 15 (15 due)
1600 ms  tick 16 (16 due)
1700 ms  tick 17 (17 due)
```

Every tick on time. So Node can do it: a dozen lines of steady interval, and a worker for the busy loop. What that asks of the programmer is the same kind of list as page 4's queue. Knowing the problem exists. Knowing ahead of time which code is CPU-bound, since only that goes to a worker. And each worker's costs: about 9 MB (page 2), an entry point of its own, data copied in and out (page 4), and its errors and exits handled by hand (page 5). In the BEAM, every process is all of that already.

## When messages come in faster than they go out

The BEAM has its own version of page 1's problem, though. It never skips a tick: a tick that comes due is a message, and it waits in the ticker's mailbox until the ticker gets to it. When there's more work than CPU for long enough, that's where the extra goes.

Nothing limits how many messages a mailbox can hold, and nothing slows a sender down when the receiver falls behind. Here's a producer sending 1,000 messages a second to a consumer that works on each one for 2 ms, so it can only handle 500 a second. Every second the producer reports how many it's sent, how many the consumer has handled, how many are waiting in the consumer's mailbox, and the consumer's size ([slow-consumer.exs](slow-consumer.exs)):

```text
$ elixir slow-consumer.exs send
mode: send
1000 ms: sent  998, handled  498, waiting  500, consumer 1089 KB
2000 ms: sent 1999, handled  998, waiting 1001, consumer 2656 KB
3000 ms: sent 2999, handled 1498, waiting 1501, consumer 3857 KB
4000 ms: sent 3999, handled 1998, waiting 2001, consumer 6713 KB
5000 ms: sent 4999, handled 2498, waiting 2501, consumer 6778 KB
6000 ms: sent 5999, handled 2998, waiting 3001, consumer 6923 KB
```

The mailbox grows by 500 messages a second, and it would go on growing until the machine ran out of memory. The consumer grows with it, because messages waiting in a mailbox are the consumer's data. They sit on its heap, and its collector copies them along with everything else, since as far as the collector can tell they're all still in use. *The BEAM Book*: "If the receiver is backed up and is receiving more messages than it has time to handle, it might actually start using more memory". For a process that may pile up messages, the docs recommend setting its `message_queue_data` flag to `off_heap`, which keeps them out of its heap and out of its collections.

That's a common way for an Elixir system to get into trouble. Page 1's BEAM never skipped a tick: under load, work waits in mailboxes instead of being dropped. That's good until the load doesn't let up.

The fix is for the producer to wait. `send` never waits, so the waiting is built from a second message going the other way. The producer puts its own address, `self()`, in each message and goes straight into a `receive`. The consumer sends `:done` back to that address when it's finished. Until `:done` arrives, the producer's `receive` has nothing to match, so it waits:

```elixir
# The producer
send(consumer, {:work, self(), payload})
receive do: (:done -> :ok)

# The consumer
receive do
  {:work, from, _payload} ->
    Work.busy(2)
    if from, do: send(from, :done)
end
```

(In the first run the producer sent `nil` in place of its address, so the consumer didn't reply.)

Here's the same script run that way:

```text
$ elixir slow-consumer.exs call
mode: call
1000 ms: sent  499, handled  499, waiting    0, consumer 33 KB
2000 ms: sent  998, handled  998, waiting    0, consumer 25 KB
3000 ms: sent 1498, handled 1498, waiting    0, consumer 33 KB
4000 ms: sent 1997, handled 1997, waiting    0, consumer 33 KB
5000 ms: sent 2497, handled 2497, waiting    0, consumer 25 KB
6000 ms: sent 2997, handled 2997, waiting    0, consumer 20 KB
```

The producer now goes at the consumer's pace, 500 a second, and nothing piles up. That's backpressure: a slow receiver slows the sender down. GenServer has a function for each of these two ways to send: one that waits for the reply, and so gives you backpressure, and one that sends and moves on, which doesn't. Elixir at Work comes back to both.

Node's worker threads fall behind the same way. Here's the slow consumer again, with the main thread posting 1,000 messages a second to a worker that works on each one for 2 ms ([slow-worker.mjs](slow-worker.mjs)). The waiting works the same way as in the BEAM: the worker posts `"done"` back when it's asked to, and the main thread waits for it:

```javascript
// The main thread, for each message that's due
worker.postMessage({ reply: mode === "call", payload });
if (mode === "call") await done(); // waits for the worker's "done"

// The worker
parentPort.on("message", ({ reply }) => {
  busy(2);
  if (reply) parentPort.postMessage("done");
});
```

```text
$ node slow-worker.mjs send; node slow-worker.mjs call
node v25.9.0, mode: send
1000 ms: sent  999, handled  482, waiting  517
2000 ms: sent 1998, handled  981, waiting 1017
3000 ms: sent 2999, handled 1480, waiting 1519
4000 ms: sent 3999, handled 1979, waiting 2020
5000 ms: sent 4999, handled 2478, waiting 2521
6000 ms: sent 5999, handled 2978, waiting 3021
node v25.9.0, mode: call
1000 ms: sent  489, handled  489, waiting    0
2000 ms: sent  983, handled  983, waiting    0
3000 ms: sent 1478, handled 1478, waiting    0
4000 ms: sent 1971, handled 1971, waiting    0
5000 ms: sent 2466, handled 2466, waiting    0
6000 ms: sent 2960, handled 2960, waiting    0
```

The queue grows without limit, and waiting for a reply fixes it, exactly as in the BEAM. Where Node is ahead is streams: a writable stream's `write()` returns `false` once its buffer passes a threshold, and well-behaved code waits for the `'drain'` event before writing more. That's backpressure built into the API, though nothing forces you to respect it: "Node.js will buffer all written chunks until maximum memory usage occurs".

### Watch it happen

This one is about backpressure more than about either runtime. It's the slow consumer again, in the BEAM and in Node side by side and slowed down: a simulation with the settings from the runs above, a producer sending 1,000 messages a second to a consumer that takes 2 ms over each one. Both sides follow the same rules, because in the runs they behaved the same. Neither one slows a sender down on its own.

The number to watch is how long the oldest waiting message has waited. That's about how long every message waits before the consumer gets to it: the delay someone at the other end of a request would feel.

It waits at the start until you press Play. Then try this:

1. Let it run. The producer sends 1,000 a second and the consumer handles 500, so the oldest message's wait grows by half a second every second, and it doesn't stop: each message waits longer than the one before.
2. Switch the producer to waiting for each reply. Its next message goes on the end of the queue like any other, so the reply only comes once everything ahead of it has been handled. The backlog still has to drain, and the wait keeps climbing until it does, while the producer's rate falls to nothing. After that the producer sends 500 a second, the consumer's pace, and nothing piles up. The consumer handles 500 a second the whole time. Waiting for replies doesn't get any more done; it stops the producer sending what can't be done.
3. Press Reset, choose 250 sends a second, and play. The consumer is busy half the time and nothing waits. Backpressure only matters when the producer is faster than the consumer.
4. Compare the two sides. They move together, message for message. What differs is where the waiting messages are (in the BEAM, in the consumer's own mailbox; in Node, in the worker's message queue) and what each one costs.

The memory figures come from sending the slow consumer's message to a process, or a worker, that never reads it, and measuring how much bigger that made things ([queue-memory.exs](queue-memory.exs), [queue-memory.mjs](queue-memory.mjs)):

```text
$ elixir queue-memory.exs
  1000 waiting: consumer grew 1678 KB, 1718 bytes each
  3000 waiting: consumer grew 5037 KB, 1719 bytes each
 10000 waiting: consumer grew 16795 KB, 1719 bytes each
 30000 waiting: consumer grew 50389 KB, 1719 bytes each
$ node --expose-gc queue-memory.mjs
  1000 waiting: rss grew 848 KB, 868 bytes each
  3000 waiting: rss grew 2320 KB, 792 bytes each
 10000 waiting: rss grew 7904 KB, 809 bytes each
 30000 waiting: rss grew 26832 KB, 916 bytes each
100000 waiting: rss grew 75152 KB, 770 bytes each
```

They're different measures. The BEAM's is the consumer process's own memory, and it's 1,719 bytes a message every time. Node's is the whole process as the operating system sees it, so it's rougher: in one run of seven, the last line came out at 96 bytes, because the process's memory had shrunk. The widget uses 800 bytes. Either way a waiting message isn't free, and a queue that grows without limit takes memory without limit.

<beam-mailbox>

![The simulation 601 ms in, with the producer sending and moving on, side by side. On the BEAM side the producer is sending 1,000 a second, and the consumer's mailbox is full of waiting messages, four rows of them and 221 more. The consumer is handling 500 a second and is busy 100% of the time, and the oldest waiting message has waited 300 ms. Sent 602, handled 300, waiting 301, and 517 KB in the consumer's mailbox. The Node side shows the same: the main thread sending 1,000 a second, the worker's message queue just as full, the worker handling 500 a second and busy 100%, the oldest message 300 ms old, the same counts, and 241 KB in the worker's queue.](beam-mailbox.webp)

*The live version of this needs JavaScript. In it, you can watch a producer and a slow consumer in the BEAM and in Node side by side, and change how fast messages are sent, how long each takes, and whether the producer waits for each reply.*

</beam-mailbox>

<script type="module" src="beam-mailbox.js"></script>

Whatever the settings, the consumer can only do so much. At 2 ms a message that's 500 a second, and it handled 500 a second whether the producer waited or not. When the producer is slower than that, as at 250 a second, nothing waits and it doesn't matter which way it sends. When it's faster, the difference has to go somewhere. Sending and moving on, it goes into the queue: 500 messages a second piling up, with every message waiting longer than the last and the memory growing, in both runtimes, until something gives. Waiting for each reply, it never gets sent. The producer slows to 500 a second, the queue stays empty, and every message is handled as soon as it arrives.

That's what backpressure is for. The work done is the same; what changes is where the overload goes. Instead of a queue that grows until it runs out of memory, the producer finds out it's going too fast, and the whole flow settles at the pace of its slowest part, with short waits and flat memory. The producer then has to decide what to do about the extra, wait or drop it, but that's a decision it can make, where a queue that grows without limit decides for it.

One message at a time is the simplest kind of backpressure. It also means the consumer has nothing to start on while each reply goes back and the next message comes in. GenStage, a library, lets a consumer ask for many messages at once and still never get more than it asked for. It's for a later leaflet.

## Sources

- The scripts and their runs: [fib_nif.c](fib_nif.c), [nif.exs](nif.exs), [speed.exs](speed.exs), and [speed.mjs](speed.mjs), run 2026-11-19 (the C compiled with Apple clang 17.0.0), and [slow-consumer.exs](slow-consumer.exs), [slow-worker.mjs](slow-worker.mjs), [queue-memory.exs](queue-memory.exs), and [queue-memory.mjs](queue-memory.mjs), run 2026-11-12, all on an Apple M1 (8 cores) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1) and Node v25.9.0. The eight-scheduler runs of nif.exs: `elixir nif.exs fib` and `elixir nif.exs dirty_fib`, same machine and versions.
- [big-data.exs](big-data.exs) and [fixed.mjs](fixed.mjs), run 2026-11-19, same machine and versions. big-data.exs ran four times in the heap, built in 702 to 761 ms with 657 to 707 ms of collecting (longest 139 to 144 ms), and three times in a table, built in 3931 to 4031 ms.
- ETS storing "very large quantities of data", tables owned by and destroyed with the process that created them, "no automatic garbage collection for tables", and "every object insert and look-up operation results in a copy of the object": the [ets docs](https://www.erlang.org/doc/apps/stdlib/ets.html) ([ets.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/ets.erl#L23-L82)). `:ets.info/2` and `memory` in words: the same docs.
- `persistent_term` reads not copied to the heap, and a global garbage collection pass on update or delete: the [persistent_term docs](https://www.erlang.org/doc/apps/erts/persistent_term.html) ([persistent_term.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/erts/preloaded/src/persistent_term.erl#L23-L64)).
- A copying collector's cost "proportional to the amount of live data on the heap": page 3's sources. Page 1's drifting and locking intervals, and Node re-arming an interval from when its callback runs: page 1's sources. `Worker`, `workerData`, and `parentPort.postMessage`: Node's [worker_threads docs](https://nodejs.org/api/worker_threads.html).
- NIFs, the warning that the VM "_cannot_ provide the same services as provided when executing Erlang code, such as pre-emptive scheduling or memory protection", "A native function that crashes will crash the whole VM", returning "within 1 millisecond", dirty NIFs and dirty schedulers, and `ERL_NIF_DIRTY_JOB_CPU_BOUND`: the [erl_nif docs](https://www.erlang.org/doc/apps/erts/erl_nif.html) ([erl_nif.md at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/erts/doc/references/erl_nif.md), the warning at L36–L50, long-running and dirty NIFs at L389–L446). NIFs "called like any other functions without any difference to the caller": the same docs, L28–L32. Loading a NIF library: [`erlang:load_nif/2`](https://www.erlang.org/doc/apps/erts/erlang.html#load_nif/2). `crypto` loading its NIF library: `-on_load` and `erlang:load_nif/2` in [crypto.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/crypto/src/crypto.erl#L3712-L3748).
- The steps of a send, messages waiting counted as live by the collector, and a backed-up receiver using more memory: *The BEAM Book*, [The Process of Sending a Message to a Process](https://blog.stenmans.org/theBeamBook/#_the_process_of_sending_a_message_to_a_process) and [Tuning Message Passing](https://blog.stenmans.org/theBeamBook/#_tuning_message_passing).
- `message_queue_data`, `off_heap` keeping messages out of collections, and the recommendation for processes that may pile up messages: [`process_flag/2`](https://www.erlang.org/doc/apps/erts/erlang.html#process_flag_message_queue_data). `message_queue_len`: [`process_info/2`](https://www.erlang.org/doc/apps/erts/erlang.html#process_info/2).
- `GenServer.cast` not waiting: [GenServer.cast/2](https://hexdocs.pm/elixir/1.19.5/GenServer.html#cast/2).
- `write()` returning `false` past `highWaterMark`, `'drain'`, and buffering until memory runs out: Node's [stream, `writable.write`](https://nodejs.org/api/stream.html#writablewritechunk-encoding-callback).
