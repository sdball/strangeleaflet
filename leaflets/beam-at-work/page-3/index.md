---
tags: elixir, beam, nodejs
publish: false
meta_description: Every BEAM process has its own heap and collects its own garbage, so a collection only ever pauses the one process that needed it
---

Elixir data is immutable: it cannot be changed. Add an item to a list and you get a new list, with the old one still there for anyone still using it. Programs with immutable data make a lot of garbage: old versions of things that nothing uses any more. Something has to find the garbage and take the memory back, and in the BEAM, as in Node, that's a garbage collector.

Every garbage collector has the same problem. To tell what's garbage, it has to look at what the program is using, and that's hard to do while the program keeps changing it. So collectors stop the program, at least for a moment. The interesting question is: stop *what*, exactly?

In Node it's your JavaScript, all of it. In the BEAM it's one process, the one whose garbage it is. This page is about why.

## Each process has its own heap

Page 2 said a new process has a heap of 233 words, and that its stack lives in the same block. The Erlang docs put it this way: "Each Erlang process has its own stack and heap which are allocated in the same memory block and grow towards each other." The heap fills from one end, with lists, tuples, and everything else the process makes. The stack fills from the other, with the function calls it's in the middle of. "When the stack and the heap meet, the garbage collector is triggered."

The collector copies. It starts from what the process can still reach (its stack, and what that points to), copies all of that into a fresh block, and throws the old block away whole. The garbage is never looked at. That makes a collection cost what the process still uses, not what it threw away. In the docs' words, the algorithm "is proportional to the amount of live data on the heap."

It's also generational, because most data dies young. Data that has survived one collection gets copied to a second block on the next one, the old heap. The usual collection, a minor one, only copies what's new and still in use. Once the old heap is full, a major collection (the docs call it a full sweep) goes through both.

Here's one process doing that, traced. It builds a list a number at a time, and at every step it also makes a short list it never uses again ([gc-steps.exs](gc-steps.exs)):

```elixir
defmodule Builder do
  def loop(acc, 0), do: acc
  def loop(acc, n) do
    _garbage = Enum.to_list(1..10)
    loop([n | acc], n - 1)
  end
end
```

`:erlang.trace/3` sends a message at the start and end of every garbage collection, with the sizes of the heaps. One line per collection:

```text
$ elixir gc-steps.exs 1000
sizes in words of 8 bytes      young heap         old heap
minor   used  220 →  220 of  233   used    0 of    0
major   used  220 →   34 of  233   used    0 of    0
minor   used  216 →   18 of  233   used   18 of  376
minor   used  216 →   18 of  233   used   36 of  376
minor   used  216 →   18 of  233   used   54 of  376
minor   used  216 →   18 of  233   used   72 of  376
minor   used  216 →   18 of  233   used   90 of  376
minor   used  216 →   18 of  233   used  108 of  376
minor   used  216 →   18 of  233   used  126 of  376
minor   used  216 →   18 of  233   used  144 of  376
minor   used  216 →   18 of  233   used  162 of  376
minor   used  216 →   18 of  233   used  180 of  376
minor   used  216 →   18 of  233   used  198 of  376
minor   used  216 →   18 of  233   used  216 of  376
minor   used  216 →   18 of  233   used  234 of  376
minor   used  216 →   18 of  233   used  252 of  376
minor   used  216 →   18 of  233   used  270 of  376
minor   used  216 →   18 of  233   used  288 of  376
minor   used  216 →   18 of  233   used  306 of  376
minor   used  216 →   18 of  233   used  324 of  376
minor   used  216 →   18 of  233   used  342 of  376
minor   used  216 →   18 of  233   used  360 of  376
minor   used  216 →  216 of  233   used  360 of  376
major   used  216 →  396 of  610   used    0 of    0
minor   used  594 →   18 of  610   used  396 of  987
minor   used  598 →   60 of  610   used  414 of  987
minor   used  596 →   64 of  610   used  466 of  987
minor   used  598 →   50 of  610   used  514 of  987
minor   used  600 →   50 of  610   used  564 of  987
minor   used  600 →   50 of  610   used  614 of  987
minor   used  600 →   50 of  610   used  664 of  987
minor   used  600 →   50 of  610   used  714 of  987
minor   used  600 →   50 of  610   used  764 of  987
minor   used  600 →   50 of  610   used  814 of  987
minor   used  600 →   50 of  610   used  864 of  987
minor   used  600 →   50 of  610   used  914 of  987
minor   used  600 →   50 of  610   used  964 of  987
minor   used  600 →  600 of  610   used  964 of  987
major   used  600 → 1064 of 1598   used    0 of    0
minor   used 1586 →   62 of 1598   used 1064 of 2586
minor   used 1586 →  140 of 1598   used 1110 of 2586
minor   used 1586 →  146 of 1598   used 1250 of 2586
minor   used 1582 →  132 of 1598   used 1380 of 2586
minor   used 1584 →  132 of 1598   used 1512 of 2586
minor   used 1584 →  132 of 1598   used 1644 of 2586
minor   used 1584 →  132 of 1598   used 1776 of 2586
```

Read it a block at a time. The young heap fills to 216 of its 233 words, and each minor collection keeps only 18: the nine newest numbers in the list, at 2 words each. The rest was the short lists, garbage, and none of it was copied. The 18 words kept last time move to the old heap, which climbs 18 words per collection. When the old heap can't take the next 18, the minor collection gives up (216 → 216) and a major one takes everything still in use, both heaps, into one bigger young heap (396 of 610). Then it starts again at the new size.

The sizes go 233, 376, 610, 987, 1598, 2586: each is roughly the two before it added together. That's on purpose. The docs: "first a variation of the Fibonacci sequence is used starting at 233 words. Then at about 1 mega words the heap only grows in 20% increments." Heaps shrink too, when a collection finds them mostly empty.

All of this happened inside one process, on its own memory. Nothing in it touched another process's heap, because nothing can: page 2's table says nothing in Elixir can point at another process's memory. So nothing else had to stop.

## Who waits?

Here's a bigger job to make that visible. One process builds a list of 10 million pairs and keeps all of it, which is close to the worst case for a copying collector: everything is live, so every collection copies everything. Meanwhile six other processes each try to tick every 10 ms, and note how late each tick was ([gc-alone.exs](gc-alone.exs)):

```text
$ for i in 1 2 3; do elixir gc-alone.exs; done
schedulers: 8, dirty CPU schedulers: 8
builder's GCs: 68, 1089 ms in all, longest 290 ms
ticks while the builder collected: 672, worst 0 ms late
ticks the rest of the time: 1728, worst 0 ms late
schedulers: 8, dirty CPU schedulers: 8
builder's GCs: 68, 961 ms in all, longest 309 ms
ticks while the builder collected: 594, worst 1 ms late
ticks the rest of the time: 1806, worst 1 ms late
schedulers: 8, dirty CPU schedulers: 8
builder's GCs: 68, 899 ms in all, longest 300 ms
ticks while the builder collected: 540, worst 0 ms late
ticks the rest of the time: 1860, worst 3 ms late
```

The builder spent about a second collecting, and its last collections took about a third of a second each, once its heaps held a few hundred megabytes. The tickers ticked right through them: hundreds of ticks while the builder collected, none more than a millisecond late. That's the same as the rest of the run.

Run it yourself and now and then you'll see a tick tens of milliseconds late outside the collections. The six tickers do that with no builder at all ([tickers-alone.exs](tickers-alone.exs)), so that's the machine, not the collector.

You might guess the tickers were fine because there were eight schedulers and they ran on different ones. Here it is with one:

```text
$ elixir --erl "+S 1" gc-alone.exs
schedulers: 1, dirty CPU schedulers: 1
builder's GCs: 68, 987 ms in all, longest 326 ms
ticks while the builder collected: 594, worst 0 ms late
ticks the rest of the time: 1806, worst 2 ms late
```

Still nothing. Had that 326 ms collection run on the only scheduler, it would have had the scheduler's thread for 326 ms, and no ticker could have run. It didn't run there, because the BEAM saw it coming. Before collecting, it adds up how much it will have to go through, and if that's 128K words (a megabyte) or more, it hands the collection to a dirty CPU scheduler. Page 2 met those: extra scheduler threads for work that can't be counted in reductions. The process waits there while it's collected, and its own scheduler goes on running everyone else.

## And in Node?

Node has one heap for all of its JavaScript. Any object can point at any other, so there's no smaller piece to collect on its own. V8 splits that heap into generations too: a small young generation that it collects often, by copying, the same idea as the BEAM's minor collections, and an old generation that a major collection goes through by marking what's in use.

V8 has worked hard on its pauses. Its young collections run in parallel on several threads. Most of the marking for a major collection happens on helper threads while your JavaScript keeps running. But the young collection still stops your JavaScript while it runs, and a major collection still ends with a pause on the main thread to finish the marking. While the collector has the main thread, no callback runs.

Here's the same job in Node: a list of 10 million pairs, all kept, and a ticker every 10 ms ([gc-pause.mjs](gc-pause.mjs)). To keep page 1's problem out of it, the builder works in chunks of 10,000 and lets the ticker run between chunks, so the longest the ticker waits on the builder's own code is a chunk, 2 to 4 ms. `perf_hooks` reports each collection and how long it took.

```text
$ for i in 1 2 3; do node gc-pause.mjs; done
node v25.9.0, heap used 465 MB, longest chunk of work 4 ms
GCs: 14, 91 ms in all, longest 46 ms
ticks while V8 collected: 9, worst 41 ms late
ticks the rest of the time: 390, worst 8 ms late
node v25.9.0, heap used 464 MB, longest chunk of work 2 ms
GCs: 14, 115 ms in all, longest 57 ms
ticks while V8 collected: 11, worst 50 ms late
ticks the rest of the time: 389, worst 5 ms late
node v25.9.0, heap used 464 MB, longest chunk of work 3 ms
GCs: 14, 124 ms in all, longest 58 ms
ticks while V8 collected: 11, worst 53 ms late
ticks the rest of the time: 388, worst 6 ms late
```

Be fair to V8 here: it's much faster at this job. It spent about a tenth of a second collecting where the BEAM spent a whole one, and its longest pause was a sixth as long. Copying 300 MB of live data, over and over, is exactly what a copying collector is worst at, and V8's mostly-concurrent marking doesn't have to.

But look at who waited. In Node the ticks that came due during a collection waited it out, and the worst of them was late by nearly the whole longest pause, every run, because the pause stopped all the JavaScript there was. The rest of the time the ticker was never more than a few milliseconds late. In the BEAM the builder waited a third of a second and nobody else waited at all. In a server, the ticker is every other request. One request building something big in Node makes every request wait for its garbage. In the BEAM it only slows down that one request.

## Most processes never collect at all

There's a cheaper way still to deal with garbage: don't collect it. When a process ends, the BEAM frees its heaps whole, garbage and all, without a collection. A process that finishes before its heap fills up never collects once.

Here are 100,000 short-lived processes that each build a list, sum it, and exit ([die-young.exs](die-young.exs)), with the whole system's count of garbage collections from `:erlang.statistics/1` before and after:

```text
$ for size in 50 100 1000 10000; do elixir die-young.exs $size; done
100000 processes, each summing a list of 50: 90 garbage collections
100000 processes, each summing a list of 100: 90 garbage collections
100000 processes, each summing a list of 1000: 800090 garbage collections
100000 processes, each summing a list of 10000: 1500090 garbage collections
```

With lists of 50 or 100, the whole system did 90 collections, and none of them were the children's. (Tracing every new process's collections in a second run counted zero. The 90 were other processes'.) Their lists fit in a 233-word heap, so each one did its work and was freed whole. With lists of 1,000 the heap fills and each process collects 8 times. That's still cheap (each collection copies only that one process's small heap), but it's no longer free.

That's the shape of a lot of Elixir programs: a process per request or per job, short-lived, making garbage nobody ever collects. Generational collectors, V8's included, are built on the idea that most data dies young. A BEAM process can make that true for a whole heap at once.

## Watch it happen

Here are both runs again, side by side and slowed down. It's a replay, not a simulation: everything in it comes from recording the real thing ([record-gc.exs](record-gc.exs) and [record-gc.mjs](record-gc.mjs)). The job is the one above, a builder keeping a list of 10 million pairs, with one change: the tickers make a little garbage every tick, the way a small request would, so their heaps fill and get collected too.

On the BEAM side, every process has its own young and old heap. Watch the tickers' heaps fill and collect on their own, and then the builder's long collections, each on a dirty CPU scheduler, while the tickers' strips keep their even rhythm. On the Node side there's one heap. When V8 collects, the builder and all three tickers stop together, and the ticks they owed come out late in a bunch.

<beam-heaps>

![The replay 640 ms into both runs, side by side. On the BEAM side the collecting badge is lit: when the builder collects, it's on a dirty CPU scheduler, and the tickers run on. The builder is collecting, its young heap 19 of 19 MB and its old heap 39 of 47 MB. The three tickers each have their own small heaps, 1.2 of 4.8 KB young and 2.8 of 7.7 KB old, are marked ticking, and their strips show evenly spaced ticks: 189 so far, the worst 1 ms late, 39 of them while the builder was collecting. On the Node side the collecting badge is lit too: when V8 collects, no JavaScript runs, not even a ticker. Its one heap is 207 of 208 MB old. The builder and all three tickers are marked paused, and each ticker's strip ends in a red bar for a tick that's still waiting.](beam-heaps.webp)

*The live version of this needs JavaScript. In it, you can play the replay or drag through it, and spawn short-lived processes that never collect at all.*

</beam-heaps>

<script type="module" src="beam-heaps.js"></script>

## Where it gives ground

Two things don't fit the picture of each process alone with its heap.

Big binaries are shared. A binary (a string, a chunk of a file, a network packet) bigger than 64 bytes isn't kept on a process's heap. It's kept once, outside every heap, with a count of the processes using it, and each process holds a small reference to it. That makes sending one to another process cheap, since only the reference is copied. But the count only goes down when the processes holding a reference collect or exit, so a big binary can stay in memory well after it was last used, if a process holding it rarely collects.

And one process with a huge heap is slow to collect, as the builder showed. The BEAM keeps that from holding anyone else up, but it doesn't make it fast. Page 8 comes back to that, and to what Elixir programs do instead of keeping hundreds of megabytes in one process.

<!-- TODO: the widget. Plan in todo/beam-leaflet.md, page 3: per-process heaps filling and
collecting on their own (fed from gc-steps.exs's real snapshots), one with a big heap handed
to a dirty scheduler, against Node's one heap pausing every callback. -->

## Sources

- The scripts and their runs: [gc-steps.exs](gc-steps.exs), [gc-alone.exs](gc-alone.exs), [tickers-alone.exs](tickers-alone.exs), [gc-pause.mjs](gc-pause.mjs), and [die-young.exs](die-young.exs), run 2026-11-12. The widget replays a run each of [record-gc.exs](record-gc.exs) and [record-gc.mjs](record-gc.mjs), saved as [beam-run.json](beam-run.json) and [node-run.json](node-run.json). All of them ran on an Apple M1 (8 cores) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1) and Node v25.9.0.
- The stack and heap in one block growing toward each other, a collection when they meet, the collector being a "per process generational semi-space copying collector", generations and the old heap, the full sweep, growth starting at 233 words in "a variation of the Fibonacci sequence" then by 20%, shrinking, and cost "proportional to the amount of live data on the heap": the ERTS docs, [Erlang Garbage Collector](https://www.erlang.org/doc/apps/erts/garbagecollection.html): [Overview](https://www.erlang.org/doc/apps/erts/garbagecollection.html#overview), [Generational Garbage Collection](https://www.erlang.org/doc/apps/erts/garbagecollection.html#generational-garbage-collection), and [Sizing the heap](https://www.erlang.org/doc/apps/erts/garbagecollection.html#sizing-the-heap). The same, from another angle: *The BEAM Book*, [The PCB](https://blog.stenmans.org/theBeamBook/#_the_pcb), [The Garbage Collector (GC)](https://blog.stenmans.org/theBeamBook/#_the_garbage_collector_gc), and [Copying Garbage Collection](https://blog.stenmans.org/theBeamBook/#_copying_garbage_collection) ("most terms die young").
- Tracing collections and the sizes in each trace message: `garbage_collection` in [`erlang:trace/3`](https://www.erlang.org/doc/apps/erts/erlang.html#trace/3). Counting them system-wide: `garbage_collection` in [`erlang:statistics/1`](https://www.erlang.org/doc/apps/erts/erlang.html#statistics/1).
- Collections of 128K words or more going to a dirty CPU scheduler: `check_for_possibly_long_gc` in [erl_gc.c at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/erts/emulator/beam/erl_gc.c#L688-L716), with `ERTS_POTENTIALLY_LONG_GC_HSIZE` in [erl_gc.h](https://github.com/erlang/otp/blob/OTP-28.4.2/erts/emulator/beam/erl_gc.h#L30), and dirty system work going on the dirty CPU queue in [erl_process.c](https://github.com/erlang/otp/blob/OTP-28.4.2/erts/emulator/beam/erl_process.c#L6507-L6509).
- A process's heaps freed whole when it ends: `delete_process` in [erl_process.c at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/erts/emulator/beam/erl_process.c#L13459-L13476).
- Binaries over 64 bytes kept off the process heap and reference counted, a pointer on the heap, and only the reference copied when sent: the ERTS docs, [Binary heap](https://www.erlang.org/doc/apps/erts/garbagecollection.html#binary-heap); the efficiency guide, [Sending Messages](https://www.erlang.org/doc/system/eff_guide_processes.html#sending-messages). Lingering until the processes holding them collect: *The BEAM Book*, [Binaries](https://blog.stenmans.org/theBeamBook/#SS-Binaries).
- V8's heap, its generations, the scavenger for the young generation and mark-compact for the whole heap, parallel scavenging, concurrent marking, and the pause to finish marking: Peter Marshall, [Trash talk: the Orinoco garbage collector](https://v8.dev/blog/trash-talk) (2019); Ulan Degenbaev, Michael Lippautz, and Hannes Payer, [Orinoco: young generation garbage collection](https://v8.dev/blog/orinoco-parallel-scavenger) (2017) and [Concurrent marking in V8](https://v8.dev/blog/concurrent-marking) (2018). "Trash talk" calls parallel collection "still a 'stop-the-world' approach" and says young collections are parallel; that's my basis for saying they stop your JavaScript. The runs above only show a major collection's pause directly. These describe V8 as of those dates; the runs above are the current behavior on Node v25.9.0.
- Node's `gc` performance entries: [perf_hooks, Garbage Collection ('gc') Details](https://nodejs.org/api/perf_hooks.html#garbage-collection-gc-details).
