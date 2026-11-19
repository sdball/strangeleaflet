---
tags: elixir, beam, nodejs
publish: false
meta_description: What the BEAM doesn't do for you. A mailbox has no limit and a send never waits, so a process that can't keep up just falls further behind.
---

<!-- Draft, started 2026-11-19 with the slow consumer moved from page 4. Still to come, from todo/beam-elixir-split.md: the opening widget (page 1's with a NIF busy loop, if there's an honest real run, otherwise this section's), a huge heap being slow to collect (page 3's promise), raw speed (measure first: in page 1's runs fib(40) was 0.8 s in the BEAM and 1.04 s in Node), and what Node needs to match the BEAM (the old page 12 findings). -->

The pages so far have been about what the BEAM does that Node can't. This one is about what it doesn't do for you.

## When messages come in faster than they go out

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

- The scripts and their runs: [slow-consumer.exs](slow-consumer.exs), [slow-worker.mjs](slow-worker.mjs), [queue-memory.exs](queue-memory.exs), and [queue-memory.mjs](queue-memory.mjs), run 2026-11-12 on an Apple M1 (8 cores) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1) and Node v25.9.0.
- The steps of a send, messages waiting counted as live by the collector, and a backed-up receiver using more memory: *The BEAM Book*, [The Process of Sending a Message to a Process](https://blog.stenmans.org/theBeamBook/#_the_process_of_sending_a_message_to_a_process) and [Tuning Message Passing](https://blog.stenmans.org/theBeamBook/#_tuning_message_passing).
- `message_queue_data`, `off_heap` keeping messages out of collections, and the recommendation for processes that may pile up messages: [`process_flag/2`](https://www.erlang.org/doc/apps/erts/erlang.html#process_flag_message_queue_data). `message_queue_len`: [`process_info/2`](https://www.erlang.org/doc/apps/erts/erlang.html#process_info/2).
- `GenServer.cast` not waiting: [GenServer.cast/2](https://hexdocs.pm/elixir/1.19.5/GenServer.html#cast/2).
- `write()` returning `false` past `highWaterMark`, `'drain'`, and buffering until memory runs out: Node's [stream, `writable.write`](https://nodejs.org/api/stream.html#writablewritechunk-encoding-callback).
