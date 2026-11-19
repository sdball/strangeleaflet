---
tags: elixir, beam, nodejs
publish: false
meta_description: A BEAM process's data is its own, and the only way in is a message, read one at a time. So a process can stop and wait in the middle of a job, and nothing else gets in. What a send costs, and how receive picks a message.
---

Pages 2 and 3 kept coming back to one rule: no process can get at another's memory. That's what lets each one collect its own garbage on its own. But processes have to work together somehow, and if they can't share data, they have to send it. This page is about what that buys you, starting with a ticket sale.

<ticket-race>

![The sale just after it ends, side by side. On the BEAM side the seller is a process, and 0 tickets are left. Buyer 1 saw 2 left and got a ticket at 100 ms, buyer 2 saw 1 left and got a ticket at 200 ms, and buyer 3 saw 0 left and was told they're sold out at 200 ms: 2 tickets sold, and one buyer was told they're sold out. On the Node side the seller is an object with an async buy(), and the tickets left are -1, in red. All three buyers saw 2 left and got a ticket at 100 ms: 3 tickets sold, and there were only 2.](ticket-race.webp)

*The live version of this needs JavaScript. In it, you can run the sale in the BEAM and in Node side by side, slowed down, and try Node again with a queue.*

</ticket-race>

<script type="module" src="ticket-race.js"></script>

In Node all three buyers got a ticket, and there were only two. Look at what each one saw: all three checked while two were still left, because none of the payments had come back yet. In the BEAM each buyer saw what the sale before had left: two, then one, then none. Press **Node with a queue** and Node sells them one at a time too. The rest of this page is about why the BEAM does that without being asked, and what it costs.

## Three buyers, two tickets

Here's the sale for real, in Node first. The tickets are an object with an async `buy()` method that checks what's left, waits 100 ms for the payment, and then takes a ticket ([wait-inside.mjs](wait-inside.mjs)):

```js
const charge = async () => {
  await sleep(100);
  return "paid";
};

class Tickets {
  constructor(left) {
    this.left = left;
  }

  async buy() {
    if (this.left === 0) return "sold out";
    await charge(); // takes 100 ms
    this.left -= 1;
    return "ok";
  }
}

const tickets = new Tickets(2);
const start = performance.now();

await Promise.all(
  [1, 2, 3].map(async (buyer) => {
    const reply = await tickets.buy();
    console.log(`${Math.round(performance.now() - start)} ms: buyer ${buyer}: ${reply}`);
  }),
);
console.log(`tickets left: ${tickets.left}`);
```

```text
$ for i in 1 2 3; do node wait-inside.mjs; done
node v25.9.0
106 ms: buyer 1: ok
106 ms: buyer 2: ok
106 ms: buyer 3: ok
tickets left: -1
node v25.9.0
102 ms: buyer 1: ok
102 ms: buyer 2: ok
102 ms: buyer 3: ok
tickets left: -1
node v25.9.0
102 ms: buyer 1: ok
102 ms: buyer 2: ok
102 ms: buyer 3: ok
tickets left: -1
```

Three tickets sold out of two, every time. `await` hands the thread back while the payment is out, so the second buyer's `buy()` ran its check right then, and so did the third's, before the first sale had taken its ticket.

That isn't a bug in Node. Without the `await`, the same class would be fine: one callback runs at a time (page 1), so a method that doesn't wait runs to the end before anything else can touch the object. The trouble is the waiting in the middle.

Here's the same sale in Elixir, with the seller as a process ([wait-inside.exs](wait-inside.exs)). It's a loop: receive a request, check what's left, charge the card, reply, and call itself with what's left now. Nothing in Elixir changes in place, so the number of tickets left is the loop's argument, and each pass gets the new number. `buy` and `left` send the seller a request with a fresh reference and wait for the reply that carries it:

```elixir
defmodule Tickets do
  def start(left, payments), do: spawn(fn -> loop(left, payments) end)

  def buy(seller), do: ask(seller, :buy)
  def left(seller), do: ask(seller, :left)

  defp ask(seller, request) do
    ref = make_ref()
    send(seller, {request, self(), ref})
    receive do: ({^ref, reply} -> reply)
  end

  defp loop(left, payments) do
    receive do
      {:buy, from, ref} ->
        if left == 0 do
          send(from, {ref, :sold_out})
          loop(left, payments)
        else
          :paid = Payments.charge(payments) # takes 100 ms
          send(from, {ref, :ok})
          loop(left - 1, payments)
        end

      {:left, from, ref} ->
        send(from, {ref, left})
        loop(left, payments)
    end
  end
end
```

`Payments.charge` asks the same way. The payment process replies 100 ms later:

```elixir
defmodule Payments do
  def start, do: spawn(fn -> loop() end)

  # Send a charge with a fresh reference, and wait for the reply carrying it
  def charge(payments) do
    ref = make_ref()
    send(payments, {:charge, self(), ref})
    receive do: ({^ref, reply} -> reply)
  end

  defp loop do
    receive do
      {:charge, from, ref} ->
        spawn(fn ->
          Process.sleep(100)
          send(from, {ref, :paid})
        end)

        loop()
    end
  end
end
```

Three buyers ask at once, each from its own process, as in the Node script:

```elixir
seller = Tickets.start(2, Payments.start())
start = System.monotonic_time(:millisecond)
me = self()

for buyer <- 1..3 do
  spawn(fn ->
    reply = Tickets.buy(seller)
    ms = System.monotonic_time(:millisecond) - start
    send(me, {:done, "#{ms} ms: buyer #{buyer}: #{inspect(reply)}"})
  end)
end

for _ <- 1..3, do: receive(do: ({:done, line} -> IO.puts(line)))
IO.puts("tickets left: #{Tickets.left(seller)}")
```

```text
$ for i in 1 2 3; do elixir wait-inside.exs; done
101 ms: buyer 1: :ok
202 ms: buyer 2: :ok
202 ms: buyer 3: :sold_out
tickets left: 0
101 ms: buyer 1: :ok
202 ms: buyer 2: :ok
202 ms: buyer 3: :sold_out
tickets left: 0
101 ms: buyer 1: :ok
202 ms: buyer 2: :ok
202 ms: buyer 3: :sold_out
tickets left: 0
```

Two tickets, two sales, and the third buyer hears they're sold out. The times show how: the second buyer waited for the first sale, and the third for both.

## Why the BEAM sold two

Nothing told the seller to take one request at a time. It's how a process works.

The number of tickets left is the seller's own data. No other process can read it or change it, so the only way to ask about it is to send the seller a message. Messages wait in its mailbox until it receives them, and it receives one at a time: each pass of the loop handles one request, start to finish, before the next `receive`.

While it waits for a payment, the seller is inside `Payments.charge`, in a `receive` that only the payment's reply matches. The buyers' requests are in its mailbox too, and they stay there until the sale in progress is done. (The mailbox section below shows how a `receive` picks one message and leaves the rest.)

And the seller can afford to wait, because waiting only stops the seller. A process waiting in a `receive` isn't holding a thread. It's out of the run queue (page 1) and costs only its memory (page 2), while the buyers, the payment process, and everything else carry on. Node can't let a function wait like that, because its one thread would wait with it, so it hands the thread back at `await`, and that's where the other buyers got in.

## Node with a queue

Node can sell one at a time too. The fix is a queue that makes each sale wait for the one before it. Here's the Node script again, with the buyers using this instead of `Tickets` ([wait-inside-queue.mjs](wait-inside-queue.mjs)):

```js
class QueuedTickets extends Tickets {
  queue = Promise.resolve();

  buy() {
    const result = this.queue.then(() => super.buy());
    this.queue = result.catch(() => {});
    return result;
  }
}

const tickets = new QueuedTickets(2);
```

```text
$ for i in 1 2 3; do node wait-inside-queue.mjs; done
node v25.9.0
102 ms: buyer 1: ok
204 ms: buyer 2: ok
204 ms: buyer 3: sold out
tickets left: 0
node v25.9.0
102 ms: buyer 1: ok
204 ms: buyer 2: ok
204 ms: buyer 3: sold out
tickets left: 0
node v25.9.0
102 ms: buyer 1: ok
203 ms: buyer 2: ok
204 ms: buyer 3: sold out
tickets left: 0
```

That matches the BEAM exactly, down to the times, and it's eight lines. So Node can do it. The difference is which way the default goes, and what that asks of the programmer.

In Node, everything interleaves at an `await` unless you queue it. Getting it right means knowing this failure can happen at all, spotting it in code that looks fine and works whenever requests come one at a time, knowing that a queue fixes it and how to write one, and then remembering to use it everywhere state is read before an `await` and changed after. Miss any one of those and the code still works, until two requests overlap.

In a BEAM process, nothing interleaves unless you arrange it. There's nothing to know or remember first: one message at a time is how a process runs. The cost is the one the times show, a sale at a time.

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

A process's mailbox is a queue. Messages go on the end as they arrive, and `receive` takes them out. But it doesn't have to take the oldest. It takes the first one that matches one of its patterns, and leaves the rest where they were.

Here's a process that sends itself four messages, then receives twice: once with a pattern that only a reply matches, and once with one that matches anything. In between, `show` prints what's in its mailbox, using `Process.info`, which looks without taking anything out ([selective.exs](selective.exs)):

```elixir
send(self(), {:log, "first"})
send(self(), {:log, "second"})
send(self(), {:reply, 42})
send(self(), {:log, "third"})

show = fn label ->
  {:messages, messages} = Process.info(self(), :messages)
  IO.puts("#{label}: #{Enum.map_join(messages, " ", &inspect/1)}")
end
show.("mailbox")

receive do
  {:reply, answer} -> IO.puts("received the reply: #{answer}")
end
show.("mailbox")

receive do
  message -> IO.puts("received the oldest: #{inspect(message)}")
end
show.("mailbox")
```

```text
$ elixir selective.exs
mailbox: {:log, "first"} {:log, "second"} {:reply, 42} {:log, "third"}
received the reply: 42
mailbox: {:log, "first"} {:log, "second"} {:log, "third"}
received the oldest: {:log, "first"}
mailbox: {:log, "second"} {:log, "third"}
```

That's how a process waits for one particular answer in the middle of everything else it's being sent. It asks another process something, then receives only the reply, and the other messages wait their turn. That's what the ticket seller did while it waited for each payment: `Payments.charge` receives only the reply that carries its reference, and the buyers' requests waited behind it.

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

The time grows with the number of messages `receive` has to look past, at about 4 ns for each one it checks and skips: about 3.7 µs to get past 1,000, and 380 µs to get past 100,000. For a process that's behind, that adds up, because the next receive checks all the skipped messages again.

The other column is the way around it. `make_ref()` makes a reference, a value that's new and unique, so no message that arrived before it was made can contain it. Make one, send it along with a request, and receive only replies that carry it, and the compiler spots it: it tells the BEAM to look only at messages that arrived after the reference was made.

```elixir
ref = make_ref()
send(self(), {ref, :ok})
receive do
  {^ref, answer} -> answer
end
```

0.2 µs, however full the mailbox. Elixir programmers rarely write that directly. Most processes that answer requests are written with GenServer, a part of Elixir's standard library, and its function for asking a process something and waiting for the answer already does it. Elixir at Work, the leaflet after this one, starts with GenServer.

## And in Node?

Inside one Node thread there's nothing to send. Pass an object to a function, or to an event listener, and the other end gets the same object, not a copy. That's fast and it's free, and it's safe for as long as nobody waits halfway through using it, as the tickets showed. Even an `EventEmitter`, the closest thing in plain Node to a message, isn't a mailbox. `emit` calls every listener right away, "synchronously," before it returns.

Node does have messages, between threads. A worker thread (page 2's 9 MB thread) and the main thread talk with `postMessage`, and like a BEAM send, it copies: the value is cloned "in a way which is compatible with the HTML structured clone algorithm," and "The message object is cloned immediately, and can be modified after posting without having side effects." Here's what that costs, measured the way copy.exs did, with a worker that never reads its messages ([post-copy.mjs](post-copy.mjs)):

```javascript
const worker = new Worker("setInterval(() => {}, 60_000);", { eval: true }); // stays up, never reads its messages

for (const n of [1_000, 10_000, 100_000, 1_000_000]) {
  const array = Array.from({ length: n }, (_, i) => i + 1);
  // ...print how long worker.postMessage(array) took
}

// ...and the same for a 16 MB ArrayBuffer, copied, then transferred, and a SharedArrayBuffer
const buffer = new ArrayBuffer(16_000_000);
worker.postMessage(buffer);
worker.postMessage(buffer, [buffer]);
worker.postMessage(new SharedArrayBuffer(16_000_000));
```

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

So messages work much the same in both. The difference is how much they're used. In Node, messages are what you reach for once you've moved work onto a worker thread, at megabytes a thread. In the BEAM they're how everything talks to everything else, between processes that cost a couple of kilobytes, and the rest of the runtime is built around them: the per-process heaps of page 3, and page 5's monitors, which report a crash with a message.

## Where it gives ground

One at a time is also a queue, and a busy process is a bottleneck. The third buyer waited 200 ms to hear the tickets were gone. With a thousand tickets and a thousand buyers at once, the last buyer would wait for the 999 payments ahead of theirs, a hundred seconds. Elixir at Work comes back to what Elixir programs do about that.

And nothing limits a mailbox. A send never waits, so a process that gets messages faster than it can handle them just falls further behind, holding on to every one. Page 8 is about that.

## Sources

- The scripts and their runs: [wait-inside.mjs](wait-inside.mjs), [wait-inside.exs](wait-inside.exs), and [wait-inside-queue.mjs](wait-inside-queue.mjs), run 2026-11-19, and [copy.exs](copy.exs), [selective.exs](selective.exs), [scan.exs](scan.exs), and [post-copy.mjs](post-copy.mjs), run 2026-11-12, all on an Apple M1 (8 cores) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1) and Node v25.9.0.
- `await` pausing its async function while "Control exits the function and returns to the caller", and never blocking the main thread: MDN, [await](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await#control_flow_effects_of_await) and its [Description](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await#description). Node's one thread and one callback at a time, and a process waiting in `receive` leaving the run queue: page 1's sources.
- Communication by asynchronous signals, messages added to the end of the message queue, and the one ordering guarantee ("if an entity sends multiple signals to the same destination entity, the order is preserved"): the Erlang reference manual, [Processes](https://www.erlang.org/doc/system/ref_man_processes.html): [Signals](https://www.erlang.org/doc/system/ref_man_processes.html#signals), [Adding Messages to the Message Queue](https://www.erlang.org/doc/system/ref_man_processes.html#message-queue-order), and [Delivery of Signals](https://www.erlang.org/doc/system/ref_man_processes.html#delivery-of-signals).
- A send never failing for a pid, `receive` taking "The first message from the start of the message queue that matches", "All other messages in the message queue remain unchanged", its `O(N)` cost, and matching on a reference created close by: the Erlang reference manual, [Send](https://www.erlang.org/doc/system/expressions.html#send) and [Receive](https://www.erlang.org/doc/system/expressions.html#receive).
- All message data copied except refc binaries and literals: the efficiency guide, [Sending Messages](https://www.erlang.org/doc/system/eff_guide_processes.html#sending-messages) and [Literal Pool](https://www.erlang.org/doc/system/eff_guide_processes.html#literal-pool). Searching only the messages that arrived after the reference was made: [Fetching Received Messages](https://www.erlang.org/doc/system/eff_guide_processes.html#fetching-received-messages). Binaries over 64 bytes kept off the heap: page 3's sources.
- The steps of a send (size, space on or off the receiver's heap, copy, link into the queue) and heap fragments: *The BEAM Book*, [Mailboxes and Message Passing](https://blog.stenmans.org/theBeamBook/#_mailboxes_and_message_passing), [Lock Free Message Passing](https://blog.stenmans.org/theBeamBook/#_lock_free_message_passing), [The Process of Sending a Message to a Process](https://blog.stenmans.org/theBeamBook/#_the_process_of_sending_a_message_to_a_process), and [Tuning Message Passing](https://blog.stenmans.org/theBeamBook/#_tuning_message_passing).
- `GenServer.call` monitoring the server and waiting for a reply tagged with that reference: Elixir's [gen_server.ex at v1.19.5](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/lib/gen_server.ex#L1139) calls `:gen.call`, whose `do_call` is in [gen.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/gen.erl#L251-L281). `GenServer.cast` not waiting: [GenServer.cast/2](https://hexdocs.pm/elixir/1.19.5/GenServer.html#cast/2).
- `postMessage` cloning with the structured clone algorithm, transferring an `ArrayBuffer`, and `SharedArrayBuffer` being "accessible from either thread": Node's [worker_threads docs, `port.postMessage`](https://nodejs.org/api/worker_threads.html#portpostmessagevalue-transferlist). `emit` calling listeners synchronously: [events, `emitter.emit`](https://nodejs.org/api/events.html#emitteremiteventname-args).
