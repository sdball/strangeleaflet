---
tags: elixir, beam, nodejs
publish: false
meta_description: GenServer, where most Elixir programs keep their state, isn't part of the BEAM. It's a small library built from sends, receives, references, and monitors, and every piece of it is there because of something that can go wrong.
---

Page 4 ended with two ways for one process to talk to another: send a message and move on, or send one and wait for the reply. Most Elixir code that does either goes through GenServer, and most of the state in an Elixir program lives in one.

GenServer isn't part of the BEAM. It's a module in Elixir's standard library, a thin layer over Erlang's `gen_server`, and it's built from what pages 4 and 5 covered: `send`, `receive`, references, and monitors. This page writes a small server by hand, then writes it again as a GenServer, and then opens up the part that does the most work, `GenServer.call`.

(If you haven't met GenServer before, page 6 of the [About Elixir leaflet](/leaflets/about-elixir/page-6/) introduces it.)

## A server by hand

A server is a process that holds some state and answers requests about it. Here's one that sells tickets. It's a function that waits for a message, works out a reply and the new state, sends the reply, and calls itself with the new state to wait for the next message ([by-hand.exs](by-hand.exs)):

```elixir
defmodule Tickets do
  def start(left), do: spawn(fn -> loop(left) end)

  def buy(server) do
    ref = make_ref()
    send(server, {:buy, self(), ref})

    receive do
      {^ref, reply} -> reply
    end
  end

  defp loop(left) do
    receive do
      {:buy, from, ref} ->
        {reply, left} = if left > 0, do: {:ok, left - 1}, else: {:sold_out, left}
        send(from, {ref, reply})
        loop(left)
    end
  end
end

server = Tickets.start(2)

for buyer <- 1..3 do
  IO.puts("buyer #{buyer}: #{inspect(Tickets.buy(server))}")
end
```

```text
$ elixir by-hand.exs
buyer 1: :ok
buyer 2: :ok
buyer 3: :sold_out
```

That loop is how a process keeps state. Nothing in Elixir changes in place, so the number of tickets left is an argument, and each turn of the loop gets the new number. The loop can go on forever because calling itself is the last thing `loop` does: the Erlang docs say a call in that position uses no stack, so "an infinite loop using tail-recursive calls will not exhaust the call stack". `buy` is page 4's trick: make a reference, send it with the request, and receive only the reply that carries it.

## The same server as a GenServer

```elixir
defmodule Tickets do
  use GenServer

  def start(left), do: GenServer.start(__MODULE__, left)
  def buy(server), do: GenServer.call(server, :buy)

  @impl true
  def init(left), do: {:ok, left}

  @impl true
  def handle_call(:buy, _from, 0), do: {:reply, :sold_out, 0}
  def handle_call(:buy, _from, left), do: {:reply, :ok, left - 1}
end
```

```text
$ elixir genserver.exs
buyer 1: :ok
buyer 2: :ok
buyer 3: :sold_out
```

The loop is gone, because GenServer has one, in Erlang's `gen_server`, and it's the same loop: a `receive` that takes the oldest message, whatever it is, hands it to the module's callback, and calls itself with the state the callback returns. `handle_call` gets the request, who it's from, and the state, and returns the reply and the new state. GenServer sends the reply.

GenServer gives a client two ways to send a server a request, page 4's two ways to send:

- `GenServer.call(server, request)` is synchronous. It sends the request, waits for the server's reply, and returns it, so `buy` returns `:ok` or `:sold_out`. The server handles a call in `handle_call`, which returns a reply along with the new state.
- `GenServer.cast(server, request)` is asynchronous. It sends the request and returns `:ok` straight away, without waiting for the server to do anything with it. The server handles a cast in `handle_cast`, which returns only the new state, since nobody is waiting for a reply.

Buying a ticket is a call, because a buyer needs to know whether they got one.

So what does that get you over twenty lines you could write yourself? Most of the answer is in `call`. First, though, something the two versions share.

## One message at a time

A server handles one message, start to finish, before it looks at the next. Each `handle_call` returns before the loop's next `receive`. So the state never needs a lock: only the server can touch it, and it only works on one request at a time.

That holds even when handling a request means waiting. Suppose selling a ticket means charging a card, and the payment takes 100 ms. Here three buyers ask at the same moment for the last two tickets, and `handle_call` waits on a payment process in the middle of each sale ([wait-inside.exs](wait-inside.exs)):

```elixir
def handle_call(:buy, _from, {0, payments}), do: {:reply, :sold_out, {0, payments}}

def handle_call(:buy, _from, {left, payments}) do
  :paid = Payments.charge(payments)
  {:reply, :ok, {left - 1, payments}}
end
```

```text
$ for i in 1 2 3; do elixir wait-inside.exs; done
103 ms: buyer 1: :ok
204 ms: buyer 2: :ok
204 ms: buyer 3: :sold_out
tickets left: 0
102 ms: buyer 1: :ok
203 ms: buyer 2: :ok
203 ms: buyer 3: :sold_out
tickets left: 0
101 ms: buyer 1: :ok
202 ms: buyer 2: :ok
202 ms: buyer 3: :sold_out
tickets left: 0
```

Two tickets, two sales, and the third buyer hears they're sold out. While the server waits for the payment, it's in a `receive` that only the payment's reply matches (page 4's reference trick again), and the other buyers' requests wait in its mailbox. Nothing looks at them until the sale before them is done.

The times show what that costs. The second buyer waited for the first sale, and the third for both. The server does one thing at a time, waiting included. That comes back at the end of the page.

## What `call` does

A call is synchronous: the caller sends its request and then does nothing else until the reply comes back. The waiting is the hard part. What if the reply never comes, because the server has died, or is stuck, or is just slow?

`GenServer.call` hands the work to Erlang's `gen:call`, and the part that does it is a function called `do_call` in `gen.erl`. Here's the clause for a call with a timeout, with a comment taken out:

```erlang
do_call(Process, Label, Request, Timeout) when is_atom(Process) =:= false ->
    Mref = erlang:monitor(process, Process, [{alias,demonitor}]),
    Tag = [alias | Mref],
    erlang:send(Process, {Label, {self(), Tag}, Request}, [noconnect]),
    receive
        {[alias | Mref], Reply} ->
            erlang:demonitor(Mref, [flush]),
            {ok, Reply};
        {'DOWN', Mref, _, _, noconnection} ->
            Node = get_node(Process),
            exit({nodedown, Node});
        {'DOWN', Mref, _, _, Reason} ->
            exit(Reason)
    after Timeout ->
            erlang:demonitor(Mref, [flush]),
            receive
                {[alias | Mref], Reply} ->
                    {ok, Reply}
            after 0 ->
                    exit(timeout)
            end
    end.
```

It's Erlang, not Elixir, but it's page 4's shapes: a send, then a receive with patterns. The pieces:

- `erlang:monitor` asks the BEAM to watch the server and send the caller a `'DOWN'` message if it dies, or right away if it's already dead. It returns a reference, and since a reference is unique, the call uses it as the reply's tag. That gets page 4's fast receive, which looks only at messages that arrived after the reference was made.
- `{alias,demonitor}` makes that reference an *alias* as well: an address the reply can be sent to, which reaches the caller only until the monitor is removed.
- The request goes to the server as `{:"$gen_call", {caller, tag}, request}`. The server's loop knows `:"$gen_call"` means a call, passes `{caller, tag}` to `handle_call` as `from`, and sends the reply to the alias.
- Then the caller waits for one of three things: the reply, a `'DOWN'`, or the timeout, 5,000 ms unless you give another.

The fast receive works here too, with the reference inside `[alias | Mref]`. Here's a call from a process with a mailbox full of messages it doesn't want, as page 4 timed a plain receive ([call-scan.exs](call-scan.exs)):

```text
$ elixir call-scan.exs
     0 other messages waiting: call 1.0 µs
  1000 other messages waiting: call 1.0 µs
 10000 other messages waiting: call 1.0 µs
100000 other messages waiting: call 1.0 µs
```

The whole round trip, server included, takes a microsecond however many messages are waiting.

Each of those is there because of a way a call can go wrong. Here are two of them, with the same calls written by hand beside them for comparison: a reference and a receive, the way `buy` was written above, with no monitor and no alias.

### The server dies

Here the server crashes in the middle of a call, and then gets called again after it's gone ([call-dies.exs](call-dies.exs)):

```text
$ elixir call-dies.exs
caller exited: the server raised %RuntimeError{message: "oops"}
server alive? false
caller exited: :noproc
caller's mailbox: []
by hand, with no monitor:
still waiting after 5 seconds
```

The first call fails with the server's own error, and the second with `:noproc`, no such process, at once. That's the monitor. A send to a process that's gone never fails (page 4), so without a monitor nothing tells the caller, and the call by hand would wait forever. I gave it five seconds.

When a call fails, the caller exits, the same as an error in its own code. The script catches the exit so it can print it. A real program usually doesn't, and pages 5 and 7 are about what happens then.

### The caller gives up

Here the server takes 300 ms over a request, and the caller only waits 100 ([call-timeout.exs](call-timeout.exs)):

```text
$ elixir call-timeout.exs
GenServer.call, giving up after 100 ms
  caller exited: :timeout
  500 ms later, the caller's mailbox: []
by hand, giving up after 100 ms
  gave up
  500 ms later, the caller's mailbox: [{#Reference<0.1738014522.4186439684.211130>, :done}]
```

Giving up doesn't stop the server. It still did the work and sent the reply 200 ms later. With the call by hand, that late reply landed in the caller's mailbox, where nothing will ever receive it: page 4's stray message, taking memory and slowing every receive that has to look past it. With `GenServer.call` it never arrived. On a timeout, `do_call` removes the monitor, and with it the alias, so the late reply goes nowhere. (The second, `after 0` receive is for a reply that made it in before the alias was turned off. Then the call takes it after all.)

### The server is too slow

The third thing `call` gives you is page 4's backpressure. The caller waits for each reply, so it can't send faster than the server answers.

## Casts and other messages

A cast has none of that. `GenServer.cast` returns `:ok` "regardless of whether the destination `server` (or node) exists", because it doesn't wait to find out. That's page 4's send-and-move-on: no monitor, no timeout, no backpressure, and a mailbox that can grow. Every other message, a plain `send`, a timer's message from `Process.send_after`, a monitor's `'DOWN'`, goes to `handle_info`. They all share one mailbox and the same loop, one at a time, oldest first.

## What every GenServer comes with

Because every GenServer runs the same loop, tools can work with any of them. The loop understands a few *system messages* besides yours, and Erlang's `:sys` module sends them. Here's the ticket server again, with nothing added to it ([sys.exs](sys.exs)):

```text
$ elixir sys.exs
get_state: 2
*DBG* <0.108.0> got call buy from <0.101.0>
*DBG* <0.108.0> sent ok to <0.101.0>, new state 1
*DBG* <0.108.0> got call buy from <0.101.0>
*DBG* <0.108.0> sent ok to <0.101.0>, new state 0
*DBG* <0.108.0> got call buy from <0.101.0>
*DBG* <0.108.0> sent sold_out to <0.101.0>, new state 0
statistics: [messages_in: 3, messages_out: 3]
replace_state, then get_state: 1
suspended for 1 s: 1 request waiting
resumed: the buyer got :ok
```

`:sys.get_state` reads the server's state, `:sys.trace` prints every request, reply, and new state as they happen, `:sys.statistics` counts them, and `:sys.replace_state` sets the state from outside. `:sys.suspend` makes the server answer only system messages, so a buy waited in its mailbox until `:sys.resume`. All of that works on a server while it runs, without changing or restarting it.

Two more things come with it that later pages need. `use GenServer` writes a `child_spec/1` function, which tells a supervisor how to start the server (page 7). And a `code_change` callback is "invoked to change the state of the `GenServer` when a different version of a module is loaded" (page 10).

## And in Node?

Inside one Node thread, the fair equivalent of the ticket server is an object with methods. It's just as safe for code that doesn't wait: one callback runs at a time (page 1), so a method with no `await` in it runs to completion before anything else can touch the object. The difference shows when there's waiting in the middle. Here's the same sale with the same 100 ms payment ([wait-inside.mjs](wait-inside.mjs)):

```js
class Tickets {
  constructor(left) {
    this.left = left;
  }

  async buy() {
    if (this.left === 0) return "sold out";
    await charge();
    this.left -= 1;
    return "ok";
  }
}
```

```text
$ node wait-inside.mjs; node wait-inside.mjs queue
node v25.9.0, plain
107 ms: buyer 1: ok
108 ms: buyer 2: ok
108 ms: buyer 3: ok
tickets left: -1
node v25.9.0, queue
101 ms: buyer 1: ok
204 ms: buyer 2: ok
204 ms: buyer 3: sold out
tickets left: 0
```

Three tickets sold out of two. `await` hands the thread back while the payment is out, so the other two buyers ran their checks before the first sale took its ticket. All three saw one left.

The second run is the fix, a queue that makes each sale wait for the one before it:

```js
class QueuedTickets extends Tickets {
  queue = Promise.resolve();

  buy() {
    const result = this.queue.then(() => super.buy());
    this.queue = result.catch(() => {});
    return result;
  }
}
```

That matches the GenServer exactly, down to the times, and it's eight lines. So Node can do it. The difference is which way the default goes. In Node, everything interleaves at an `await` unless you queue it, and you have to spot where. In a GenServer, nothing interleaves unless you arrange it.

Between threads, Node has messages, and a call to a worker thread is something you build. Here's a call written by hand on top of `postMessage`, with what `do_call` has: an id on each request, a timeout, late replies dropped, and calls failed when the worker dies, run through the same cases as above ([call-by-hand.mjs](call-by-hand.mjs)):

```js
class Client {
  #worker;
  #next = 0;
  #pending = new Map();
  #gone = null;

  constructor(worker) {
    this.#worker = worker;
    worker.on("message", ({ id, reply }) => {
      const call = this.#pending.get(id);
      if (!call) return console.log(`  (dropped a late reply: ${reply})`);
      this.#pending.delete(id);
      clearTimeout(call.timer);
      call.resolve(reply);
    });
    worker.on("error", (error) => this.#fail(error));
    worker.on("exit", (code) => this.#fail(new Error(`worker exited, code ${code}`)));
  }

  call(request, timeout = 5000) {
    if (this.#gone) return Promise.reject(this.#gone);
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error("timeout"));
      }, timeout);
      this.#pending.set(id, { resolve, reject, timer });
      this.#worker.postMessage({ id, request });
    });
  }

  #fail(error) {
    this.#gone ??= error;
    for (const { reject, timer } of this.#pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.#pending.clear();
  }
}
```

```text
$ node call-by-hand.mjs
node v25.9.0
a call that gives up after 100 ms
  failed: timeout
  (dropped a late reply: done)
a call while the worker crashes
  failed: oops
a call after the worker is gone
  failed: oops
```

It works, and at 41 lines it's about the size of `do_call`, whose three clauses come to 53. Neither is hard to write. What's different is that in the BEAM it's written once, in the standard library, and every server gets it, where in Node each program that needs it writes its own or finds one. And Node's is per worker, at megabytes a thread (page 2), where the BEAM's works with any process.

## Where it gives ground

One GenServer is one process, so it works on one request at a time, on one scheduler. Here's a server that does about 1 ms of work for each call, with more and more callers, and then the same callers doing the work themselves, with no server ([bottleneck.exs](bottleneck.exs)):

```text
$ for i in 1 2 3; do elixir bottleneck.exs; done
8 schedulers, 1 ms of work is counting down from 621195
 1 caller:    986 a second through one server,  1004 doing the work themselves
 2 callers:   993 a second through one server,  1952 doing the work themselves
 4 callers:  1005 a second through one server,  3709 doing the work themselves
 8 callers:   999 a second through one server,  4743 doing the work themselves
16 callers:   999 a second through one server,  4738 doing the work themselves
8 schedulers, 1 ms of work is counting down from 562492
 1 caller:   1090 a second through one server,  1097 doing the work themselves
 2 callers:  1098 a second through one server,  2154 doing the work themselves
 4 callers:  1102 a second through one server,  4098 doing the work themselves
 8 callers:  1099 a second through one server,  5184 doing the work themselves
16 callers:  1105 a second through one server,  5330 doing the work themselves
8 schedulers, 1 ms of work is counting down from 612182
 1 caller:    998 a second through one server,   998 doing the work themselves
 2 callers:   999 a second through one server,  1978 doing the work themselves
 4 callers:  1011 a second through one server,  3764 doing the work themselves
 8 callers:  1005 a second through one server,  4772 doing the work themselves
16 callers:  1008 a second through one server,  4901 doing the work themselves
```

Through the server it's about 1,000 a second however many callers there are. Without it, the work spreads over the schedulers. (Not eight times as much with eight callers, because four of the M1's eight cores are slower efficiency cores.) The extra callers through the server just wait in its mailbox.

Elixir's docs warn about exactly this: putting code behind "a single process that will potentially become a bottleneck in your system", and "If you don't need a process, then you don't need a process." What Elixir programs do instead depends on the state. Work that doesn't touch it shouldn't go through the server at all, as in the second column. State that splits by key can live in several servers, one per part: the docs for `PartitionSupervisor`, which starts them, open with "Certain processes may become bottlenecks in large systems." And state that's read far more than it's written can go in an ETS table, a store built into the BEAM that, in the words of Elixir's guide, any process can read from, "but writes are still serialized through a single process." Page 11 has more about what the BEAM is slow at.

## Watch it happen

The thing that surprises most people about a GenServer is where the state is. There's no field on an object that `handle_call` changes. The state is an argument: the loop passes it to each callback, and each callback returns the next one as part of its answer, `{:reply, reply, new_state}`, or `{:noreply, new_state}` for a cast. The loop goes round again with whatever came back. Even a call that changes nothing, like asking how many tickets are left, returns the state, the same one it was given.

Here's the ticket server again, with a call that buys `n` tickets, a call that asks how many are left, and a cast that adds `n`:

```elixir
defmodule Tickets do
  use GenServer

  def init(left) do
    {:ok, left}
  end

  def handle_call({:buy, n}, _from, left) when n <= left do
    {:reply, :ok, left - n}
  end

  def handle_call({:buy, _n}, _from, left) do
    {:reply, :sold_out, left}
  end

  def handle_call(:left, _from, left) do
    {:reply, left, left}
  end

  def handle_cast({:add, n}, left) do
    {:noreply, left + n}
  end
end
```

Elixir tries the clauses of a function in order and runs the first one whose pattern, and `when` guard if it has one, matches. So buying more tickets than are left falls through to the second clause.

Below is a simulation of it, slowed down so you can follow a request through the loop. A real run of the same module with `:sys.trace` on prints the same states ([state.exs](state.exs)):

```text
$ elixir state.exs
started, state 3
*DBG* <0.108.0> got call {buy,2} from <0.101.0>
*DBG* <0.108.0> sent ok to <0.101.0>, new state 1
buy 2: :ok
*DBG* <0.108.0> got call {buy,2} from <0.101.0>
*DBG* <0.108.0> sent sold_out to <0.101.0>, new state 1
buy 2: :sold_out
*DBG* <0.108.0> got call left from <0.101.0>
*DBG* <0.108.0> sent 1 to <0.101.0>, new state 1
left: 1
add 3: :ok
*DBG* <0.108.0> got cast {add,3}
*DBG* <0.108.0> new state 4
*DBG* <0.108.0> got call {buy,2} from <0.101.0>
*DBG* <0.108.0> sent ok to <0.101.0>, new state 2
buy 2: :ok
```

Start the server, then send it requests. Watch the state, drawn in brass: it goes into each callback as the last argument and comes out in what the callback returns. Some things to try:

1. Buy 2, then buy 2 again. The second time, the first clause's guard (`when n <= left`) is false, so the next clause answers `:sold_out` and returns the state it was given.
2. Make a call and try to send something else before the reply comes. You can't: a caller waits in `receive` until its reply arrives.
3. Cast `{:add, n}` several times quickly. Each cast returns `:ok` at once, the casts wait in the mailbox, and the server takes them one at a time, each starting from the state the one before it returned.

<genserver-state>

![The simulation part way through a call. The server's state is 4. You, the client, called {:buy, 2} and are waiting for the reply. The server's mailbox is empty, because the server has taken the message, {:"$gen_call", from, {:buy, 2}}. It matched the clause def handle_call({:buy, n}, _from, left) when n <= left do, with n = 2 and left = 4, and that clause returns {:reply, :ok, left - n}, which is {:reply, :ok, 2}. Next it will send :ok back and loop with 2 as its state. Every state so far: 3 from init, 1 from {:buy, 2}, and 4 from {:add, 3}.](genserver-state.webp)

*The live version of this needs JavaScript. In it, you start the ticket server and send it calls and casts, and follow each one through the server's loop: the message in its mailbox, the callback called with the current state, the new state it returns, and the reply.*

</genserver-state>

<script type="module" src="genserver-state.js"></script>

## Sources

- The scripts and their runs: [by-hand.exs](by-hand.exs), [genserver.exs](genserver.exs), [wait-inside.exs](wait-inside.exs), [state.exs](state.exs), [call-dies.exs](call-dies.exs), [call-timeout.exs](call-timeout.exs), [call-scan.exs](call-scan.exs), [sys.exs](sys.exs), [bottleneck.exs](bottleneck.exs), [wait-inside.mjs](wait-inside.mjs), and [call-by-hand.mjs](call-by-hand.mjs), run 2026-11-12 on an Apple M1 (8 cores: 4 performance, 4 efficiency) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1) and Node v25.9.0.
- A tail-recursive call using no stack, so a loop can "run forever": the Erlang reference manual, [Tail recursion](https://www.erlang.org/doc/system/ref_man_functions.html#tail-recursion).
- GenServer as "a process like any other Elixir process" with "a standard set of interface functions" and tracing: [GenServer](https://hexdocs.pm/elixir/1.19.5/GenServer.html). `GenServer.call` passing the request to `:gen.call` with the label `:"$gen_call"` and a default timeout of 5,000: [gen_server.ex at v1.19.5](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/lib/gen_server.ex#L1108-L1146). `cast` returning `:ok` whether or not the server exists: [L1149–L1161](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/lib/gen_server.ex#L1149-L1161). `handle_info` handling "all other messages": [L650–L656](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/lib/gen_server.ex#L650-L656). `code_change`: [L749–L760](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/lib/gen_server.ex#L749-L760). The bottleneck warning: [L380–L396](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/lib/gen_server.ex#L381-L396). `child_spec/1` and the `:sys` functions: [Debugging with the :sys module](https://hexdocs.pm/elixir/1.19.5/GenServer.html#module-debugging-with-the-sys-module) and [How to supervise](https://hexdocs.pm/elixir/1.19.5/GenServer.html#module-how-to-supervise).
- The server loop taking the oldest message and dispatching `'$gen_call'` to `handle_call`: [gen_server.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/gen_server.erl#L2320-L2326) and [L2498–L2518](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/gen_server.erl#L2498-L2518). `do_call`: [gen.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/gen.erl#L231-L281); the reply sent to the alias: [L549–L554](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/gen.erl#L549-L554). Late replies not received: [`gen_server:call/3`](https://www.erlang.org/doc/apps/stdlib/gen_server.html#call/3).
- Monitors, `'DOWN'` messages, and `noproc` for a process that didn't exist: [`erlang:monitor/2`](https://www.erlang.org/doc/apps/erts/erlang.html#monitor/2). The `{alias, demonitor}` option deactivating the alias "when the monitor is removed": [`erlang:monitor/3`](https://www.erlang.org/doc/apps/erts/erlang.html#monitor/3).
- The fast receive for a reference made just before: page 4's sources.
- `sys` and system messages: [sys](https://www.erlang.org/doc/apps/stdlib/sys.html).
- `PartitionSupervisor`: [its docs](https://hexdocs.pm/elixir/1.19.5/PartitionSupervisor.html). ETS reads "from any processes but writes are still serialized through a single process": Elixir's guide, [Speeding up with ETS](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/pages/mix-and-otp/erlang-term-storage.md).
- Node's `await` and the one thread: page 1's sources. Worker `'error'` and `'exit'` events: Node's [worker_threads docs](https://nodejs.org/api/worker_threads.html#event-error).
