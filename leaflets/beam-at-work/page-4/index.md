---
tags: elixir, beam, nodejs
publish: false
meta_description: BEAM processes share nothing, so they talk by sending messages. What a send costs, how receive picks a message, and what happens when one process can't keep up.
---

Pages 2 and 3 kept coming back to one rule: no process access another's memory. That's what lets each one collect its own garbage independently. But processes have to work together somehow, and if they can't share data, they have to send it.

Sending messages is how BEAM processes talk to each other. One sends a message and it lands in the other's mailbox. This page is about what a send costs, how a process picks what to read from its mailbox, and what happens when messages come in faster than a process can read them.

## A send is a copy

`send(pid, message)` puts a copy of `message` in the mailbox belonging to the process `pid` and carries on. It doesn't wait for the other process to read it, acknowledge it, or even to exist. The Erlang docs say "Sending a message to a pid never fails, even if the pid identifies a non-existing process." And it copies. The efficiency guide: "All data in messages sent between Erlang processes is copied," with two exceptions we'll get to.

Here's what that copy costs. This script sends lists of different sizes to a process that never reads them, and measures how long each send took and how much the receiver grew ([copy.exs](copy.exs)):

```elixir
receiver = spawn(fn -> Process.sleep(:infinity) end)

for n <- [1_000, 10_000, 100_000, 1_000_000] do
  list = Enum.to_list(1..n)
  {us, _} = :timer.tc(fn -> send(receiver, list) end)
  # ...print the list's size, us, and how much the receiver's memory grew
end
```

```text
$ elixir copy.exs
sending to a process that never receives
list of      1000:    15 KB, send took     4 µs, receiver grew 15 KB
list of     10000:   156 KB, send took    41 µs, receiver grew 156 KB
list of    100000:  1562 KB, send took   518 µs, receiver grew 1562 KB
list of   1000000: 15625 KB, send took  6215 µs, receiver grew 15625 KB
binary of 16 MB: send took 3 µs, receiver grew 88 bytes
messages waiting: 5
```

Ten times the data, ten times as long, and the receiver grew by exactly the size of what was sent. The sender pays for the copy, and the receiver ends up with its own: the sender works out the message's size, makes room for it in the receiver's memory (on its heap, or in a separate fragment if it can't get at the heap right then), and copies it there. From then on the receiver's copy is part of the receiver, and each process's garbage collector (page 3) only ever has to look and only _can_ look at its own process's memory.

The last 16 MB binary line in the output above is the first exception. A binary bigger than 64 bytes (a string, a chunk of a file) is kept outside every process's heap, as page 3 said, and sending one copies only a small reference to it: 3 µs for 16 MB, and 88 bytes. That's safe to share because nothing in Elixir can change a binary once it's made. The other exception is literals, constants written into the code, which are kept with their module, outside every process.

The BEAM also ensures message delivery order. If a process sends two messages to the same process they arrive in the order they were sent. Messages from different senders can arrive in any order.

## The mailbox

A process's mailbox is a queue. Messages go on the end as they arrive, and `receive` takes them out. But it doesn't have to take the oldest. It takes the first one that matches one of its patterns, and leaves the rest where they were ([selective.exs](selective.exs)):

```elixir
send(self(), {:log, "first"})
send(self(), {:log, "second"})
send(self(), {:reply, 42})
send(self(), {:log, "third"})

receive do
  {:reply, answer} -> IO.puts("received the reply: #{answer}")
end
```

```text
$ elixir selective.exs
mailbox: {:log, "first"} {:log, "second"} {:reply, 42} {:log, "third"}
received the reply: 42
mailbox: {:log, "first"} {:log, "second"} {:log, "third"}
received the oldest: {:log, "first"}
mailbox: {:log, "second"} {:log, "third"}
```

That's how a process waits for one particular answer in the middle of everything else it's being sent. It asks another process something, then receives only the reply, and the other messages wait their turn.

It isn't free. To find a match, `receive` looks at the messages from the oldest on, and the docs warn that it's "`O(N)` where `N` corresponds to the number of messages" ahead of the one that matches. Here's a process with a mailbox full of messages it doesn't want, timing a receive for one that's at the end ([scan.exs](scan.exs)):

```text
$ for i in 1 2 3; do elixir scan.exs; done
     0 other messages waiting: receive 0.1 µs, with a reference 0.2 µs
  1000 other messages waiting: receive 3.8 µs, with a reference 0.2 µs
 10000 other messages waiting: receive 35.4 µs, with a reference 0.2 µs
100000 other messages waiting: receive 379.4 µs, with a reference 0.3 µs
     0 other messages waiting: receive 0.1 µs, with a reference 0.2 µs
  1000 other messages waiting: receive 3.7 µs, with a reference 0.2 µs
 10000 other messages waiting: receive 35.8 µs, with a reference 0.2 µs
100000 other messages waiting: receive 380.1 µs, with a reference 0.2 µs
     0 other messages waiting: receive 0.1 µs, with a reference 0.2 µs
  1000 other messages waiting: receive 3.6 µs, with a reference 0.1 µs
 10000 other messages waiting: receive 35.7 µs, with a reference 0.2 µs
100000 other messages waiting: receive 379.2 µs, with a reference 0.2 µs
```

About 4 ns a message, every time. For a process that's behind, that adds up: each receive looks again at everything it skipped last time.

The other column is the way around it. `make_ref()` makes a reference, a value that's new and unique, so no message that arrived before it was made can contain it. Make one, send it along with a request, and receive only replies that carry it, and the compiler spots it: it tells the BEAM to look only at messages that arrived after the reference was made.

```elixir
ref = make_ref()
send(self(), {ref, :ok})
receive do
  {^ref, answer} -> answer
end
```

0.2 µs, however full the mailbox. Elixir code rarely writes that by hand, because `GenServer.call`, the usual way to ask a process something and wait for the answer, already does it: it makes a reference (by monitoring the other process) and waits for a reply carrying it.

## When messages come in faster than they go out

Nothing limits how many messages a mailbox can hold, and nothing slows a sender down when the receiver falls behind. Here's a process sending a message, sleeping a millisecond, and sending another, to a consumer that sleeps 2 ms over each message. Every second it reports what it's sent, how many are waiting in the consumer's mailbox, and the consumer's size ([slow-consumer.exs](slow-consumer.exs)):

```text
$ elixir slow-consumer.exs send
mode: send
1000 ms: sent  500, handled  333, waiting  167, consumer 628 KB
2000 ms: sent  998, handled  666, waiting  332, consumer 1075 KB
3000 ms: sent 1498, handled 1000, waiting  498, consumer 2562 KB
4000 ms: sent 1995, handled 1332, waiting  663, consumer 2576 KB
5000 ms: sent 2495, handled 1665, waiting  830, consumer 2590 KB
6000 ms: sent 2995, handled 1999, waiting  996, consumer 3366 KB
```

(The sleeps took longer than asked, 2 ms and 3 ms, so it sent about 500 a second and handled about 333.) The mailbox grows by about 166 messages a second, and it would go on growing until the machine ran out of memory. The consumer grows with it, because messages waiting in a mailbox are the consumer's data. They sit on its heap, and its collector copies them along with everything else, since as far as the collector can tell they're all still in use. *The BEAM Book*: "If the receiver is backed up and is receiving more messages than it has time to handle, it might actually start using more memory". For a process that may pile up messages, the docs recommend setting its `message_queue_data` flag to `off_heap`, which keeps them out of its heap and out of its collections.

That's the most common way an Elixir system gets into trouble. Page 1's BEAM never skipped a tick: under load, work waits in mailboxes instead of being dropped. That's good until the load doesn't let up.

The fix is for the sender to wait. Here's the same script, but now the sender waits for a reply before sending the next message:

```text
$ elixir slow-consumer.exs call
mode: call
1000 ms: sent  200, handled  200, waiting    0, consumer 33 KB
2000 ms: sent  400, handled  400, waiting    0, consumer 25 KB
3000 ms: sent  599, handled  599, waiting    0, consumer 33 KB
4000 ms: sent  799, handled  799, waiting    0, consumer 33 KB
5000 ms: sent  998, handled  998, waiting    0, consumer 25 KB
6000 ms: sent 1198, handled 1198, waiting    0, consumer 33 KB
```

The sender now goes at the consumer's pace, and nothing piles up. That's backpressure: a slow receiver slows the sender down. `GenServer.call` gives it for free, because it waits for the reply. Its fire-and-forget sibling, `GenServer.cast`, doesn't, and a process that's sent a lot of casts is a process to keep an eye on.

## And in Node?

Inside one Node thread there's nothing to send. Pass an object to a function, or to an event listener, and the other end gets the same object, not a copy. That's fast, it's free, and it's safe only because of page 1: one callback runs at a time, so nobody else can be changing the object while you use it. Even an `EventEmitter`, the closest thing in plain Node to a message, isn't a mailbox. `emit` calls every listener right away, "synchronously," before it returns.

Node does have messages, between threads. A worker thread (page 2's 9 MB thread) and the main thread talk with `postMessage`, and like a BEAM send, it copies: the value is cloned "in a way which is compatible with the HTML structured clone algorithm," and "The message object is cloned immediately, and can be modified after posting without having side effects." Here's what that costs ([post-copy.mjs](post-copy.mjs)):

```text
$ for i in 1 2 3; do node post-copy.mjs; done
node v25.9.0, posting to a worker that never reads
array of      1000: postMessage took    35 µs
array of     10000: postMessage took    56 µs
array of    100000: postMessage took   704 µs
array of   1000000: postMessage took  7233 µs
ArrayBuffer of 16 MB, copied:        3159 µs, sender's still has 16000000 bytes
ArrayBuffer of 16 MB, transferred:     64 µs, sender's now has 0 bytes
SharedArrayBuffer of 16 MB, shared:    14 µs
node v25.9.0, posting to a worker that never reads
array of      1000: postMessage took    23 µs
array of     10000: postMessage took    55 µs
array of    100000: postMessage took   764 µs
array of   1000000: postMessage took  7088 µs
ArrayBuffer of 16 MB, copied:        2771 µs, sender's still has 16000000 bytes
ArrayBuffer of 16 MB, transferred:     24 µs, sender's now has 0 bytes
SharedArrayBuffer of 16 MB, shared:    10 µs
node v25.9.0, posting to a worker that never reads
array of      1000: postMessage took    20 µs
array of     10000: postMessage took    53 µs
array of    100000: postMessage took   677 µs
array of   1000000: postMessage took  6814 µs
ArrayBuffer of 16 MB, copied:        2677 µs, sender's still has 16000000 bytes
ArrayBuffer of 16 MB, transferred:     24 µs, sender's now has 0 bytes
SharedArrayBuffer of 16 MB, shared:     9 µs
```

Much the same as the BEAM: a million numbers took about 7 ms to post where the BEAM's send took about 6. Node's ways around the copy are different, though. A transferred buffer moves to the worker, and the sender's copy is left empty. A `SharedArrayBuffer` isn't copied at all: both threads use the same memory, and either one can change it while the other is reading. That's the kind of sharing the BEAM leaves out, and the reason it can share big binaries is that nobody can change them.

A slow worker falls behind the same way, too. Here's the slow consumer again, with the main thread posting to a worker that spends 2 ms on each message ([slow-worker.mjs](slow-worker.mjs)):

```text
$ node slow-worker.mjs send; node slow-worker.mjs call
node v25.9.0, mode: send
1000 ms: sent  794, handled  349, waiting  445
2000 ms: sent 1568, handled  700, waiting  868
3000 ms: sent 2351, handled 1052, waiting 1299
4000 ms: sent 3128, handled 1405, waiting 1723
5000 ms: sent 3905, handled 1758, waiting 2147
6000 ms: sent 4686, handled 2106, waiting 2580
node v25.9.0, mode: call
1000 ms: sent  226, handled  226, waiting    0
2000 ms: sent  457, handled  457, waiting    0
3000 ms: sent  688, handled  688, waiting    0
4000 ms: sent  918, handled  918, waiting    0
5000 ms: sent 1150, handled 1150, waiting    0
6000 ms: sent 1382, handled 1382, waiting    0
```

The queue grows without limit, and waiting for a reply fixes it, exactly as in the BEAM. (Node's timers slept closer to what was asked, so it sent faster.) Where Node is ahead is streams: a writable stream's `write()` returns `false` once its buffer passes a threshold, and well-behaved code waits for the `'drain'` event before writing more. That's backpressure built into the API, though nothing forces you to respect it: "Node.js will buffer all written chunks until maximum memory usage occurs".

So messages work much the same in both. The difference is how much they're used. In Node, messages are what you reach for once you've moved work onto a worker thread, at megabytes a thread. In the BEAM they're how everything talks to everything else, between processes that cost a couple of kilobytes, and the rest of the runtime is built around them: the per-process heaps of page 3, and page 5's monitors, which report a crash with a message.

## Watch it happen

<!-- TODO: the widget. -->

## Sources

- The scripts and their runs: [copy.exs](copy.exs), [selective.exs](selective.exs), [scan.exs](scan.exs), [slow-consumer.exs](slow-consumer.exs), [post-copy.mjs](post-copy.mjs), and [slow-worker.mjs](slow-worker.mjs), run 2026-11-12 on an Apple M1 (8 cores) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1) and Node v25.9.0.
- Communication by asynchronous signals, messages added to the end of the message queue, and the one ordering guarantee ("if an entity sends multiple signals to the same destination entity, the order is preserved"): the Erlang reference manual, [Processes](https://www.erlang.org/doc/system/ref_man_processes.html): [Signals](https://www.erlang.org/doc/system/ref_man_processes.html#signals), [Adding Messages to the Message Queue](https://www.erlang.org/doc/system/ref_man_processes.html#message-queue-order), and [Delivery of Signals](https://www.erlang.org/doc/system/ref_man_processes.html#delivery-of-signals).
- A send never failing for a pid, `receive` taking "The first message from the start of the message queue that matches", "All other messages in the message queue remain unchanged", its `O(N)` cost, and matching on a reference created close by: the Erlang reference manual, [Send](https://www.erlang.org/doc/system/expressions.html#send) and [Receive](https://www.erlang.org/doc/system/expressions.html#receive).
- All message data copied except refc binaries and literals: the efficiency guide, [Sending Messages](https://www.erlang.org/doc/system/eff_guide_processes.html#sending-messages) and [Literal Pool](https://www.erlang.org/doc/system/eff_guide_processes.html#literal-pool). Searching only the messages that arrived after the reference was made: [Fetching Received Messages](https://www.erlang.org/doc/system/eff_guide_processes.html#fetching-received-messages). Binaries over 64 bytes kept off the heap: page 3's sources.
- The steps of a send (size, space on or off the receiver's heap, copy, link into the queue), heap fragments, messages waiting counted as live by the collector, and a backed-up receiver using more memory: *The BEAM Book*, [Mailboxes and Message Passing](https://blog.stenmans.org/theBeamBook/#_mailboxes_and_message_passing), [Lock Free Message Passing](https://blog.stenmans.org/theBeamBook/#_lock_free_message_passing), [The Process of Sending a Message to a Process](https://blog.stenmans.org/theBeamBook/#_the_process_of_sending_a_message_to_a_process), and [Tuning Message Passing](https://blog.stenmans.org/theBeamBook/#_tuning_message_passing).
- `message_queue_data`, `off_heap` keeping messages out of collections, and the recommendation for processes that may pile up messages: [`process_flag/2`](https://www.erlang.org/doc/apps/erts/erlang.html#process_flag_message_queue_data). `message_queue_len`: [`process_info/2`](https://www.erlang.org/doc/apps/erts/erlang.html#process_info/2).
- `GenServer.call` monitoring the server and waiting for a reply tagged with that reference: Elixir's [gen_server.ex at v1.19.5](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/lib/gen_server.ex#L1139) calls `:gen.call`, whose `do_call` is in [gen.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/gen.erl#L251-L281). `GenServer.cast` not waiting: [GenServer.cast/2](https://hexdocs.pm/elixir/1.19.5/GenServer.html#cast/2).
- `postMessage` cloning with the structured clone algorithm, transferring an `ArrayBuffer`, and `SharedArrayBuffer` being "accessible from either thread": Node's [worker_threads docs, `port.postMessage`](https://nodejs.org/api/worker_threads.html#portpostmessagevalue-transferlist). `emit` calling listeners synchronously: [events, `emitter.emit`](https://nodejs.org/api/events.html#emitteremiteventname-args). `write()` returning `false` past `highWaterMark`, `'drain'`, and buffering until memory runs out: [stream, `writable.write`](https://nodejs.org/api/stream.html#writablewritechunk-encoding-callback).
