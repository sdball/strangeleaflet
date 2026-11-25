---
title: GenServer
tags: elixir, beam, nodejs
publish: false
meta_description: GenServer, where most Elixir programs keep their state, isn't part of the BEAM. It's a small library built from sends, receives, references, and monitors, and every piece of it is there because of something that can go wrong.
---

[Page 4 of The BEAM at Work](/leaflets/beam-at-work/page-4/) showed two ways for one process to talk to another: send a message and move on, or send one and wait for the reply. Most Elixir code that does either goes through GenServer, and most of the state in an Elixir program lives in one.

GenServer isn't part of the BEAM. It's a module in Elixir's standard library, a thin layer over Erlang's `gen_server`, and it's built from the BEAM's own pieces: `send`, `receive`, references, and monitors. This page writes a small server by hand, then writes it again as a GenServer, and then looks more deeply at how GenServers operate.

(If you haven't met GenServer before, page 6 of the [About Elixir leaflet](/leaflets/about-elixir/page-6/) also talks about them.)

## A server by hand

A server is a process that holds some state and answers requests about it. Here's one that sells tickets and tracks the number of tickets remaining. It's essentially a function that

1. Waits for a message
2. When it receives a message it works out a reply and a new state
3. Sends the reply
4. Calls itself with the new state to wait for the next message

[by-hand.exs](by-hand.exs):

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

That loop is how a process keeps state. Nothing in Elixir changes in place, so the number of tickets left is an argument, and each new call of the loop gets the new number. The loop can go on forever because calling itself is the last thing it does. The Erlang docs say a call in that position uses no stack, so "an infinite loop using tail-recursive calls will not exhaust the call stack".

The `Tickets.buy/1` function uses the BEAM's usual approach for a request with a reply: make a reference, send it with the request, and receive only the reply that carries it.

## The same server as a GenServer

```elixir
# The same server as a GenServer.

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

{:ok, server} = Tickets.start(2)

for buyer <- 1..3 do
  IO.puts("buyer #{buyer}: #{inspect(Tickets.buy(server))}")
end
```

```text
$ elixir genserver.exs
buyer 1: :ok
buyer 2: :ok
buyer 3: :sold_out
```

A GenServer is a codified way to have a process that holds state and can deal with messages about that state in a reliable and consistent way.

A GenServer essentially needs a name and an initial state. Our `Tickets.start/1` function handles that setup. `__MODULE__` is an easy way to say "use the name of the module" (`Tickets` in this case) and we pass the `left` argument as the initial state.

Declaring `use GenServer` means we are asserting that the module (`Tickets`) meets the contract requirements of the GenServer API. Those `@impl true` calls are helper declarations to say that the following functions meet contract requirements.

- We have the required `init` function that returns a value saying that the GenServer is ready to start `:ok` and its initial state `left`.
- We have some `handle_call` functions that will handle synchronous messages, determine a response, determine a new state, and return both.

The explicit loop function is gone because GenServer has its own in Erlang's `gen_server`. Conceptually it's the same approach: a `receive` that takes the oldest message, whatever it is, hands it to the module's callback, and calls itself with the state the callback returns. `handle_call` gets the request, who it's from, and the state, and returns the reply and the new state. GenServer sends the reply.

GenServer gives a client two ways to send a server a request:

- `GenServer.call(server, request)` is synchronous. It sends the request, waits for the server's reply, and returns it, so `buy` returns `:ok` or `:sold_out`. The server handles a call in `handle_call`, which returns a reply along with the new state.
- `GenServer.cast(server, request)` is asynchronous. It sends the request and returns `:ok` straight away, without waiting for the server to do anything with it. The server handles a cast in `handle_cast`, which returns only the new state, since nobody is waiting for a reply.

Buying a ticket is a call (synchronous), because a buyer needs a response to know whether they got a ticket or not.

## Where the state lives

A potentially surprising point about GenServer is where the state lives. There's no field on an object that `handle_call` changes. The state is an argument: the loop passes it to each callback, and each callback hands back the next state as part of what it returns.

Here are two more callback examples for the ticket server, a call that asks how many tickets are left (needs a response) and a cast that adds some (we'll say this doesn't need a response). Cast messages are asynchronous: sent by the caller without waiting for a response.

```elixir
def handle_call(:left, _from, left), do: {:reply, left, left}
def handle_cast({:add, n}, left), do: {:noreply, left + n}
```

Every callback returns a tuple, and the GenServer behavior reads it to know what to do next. Here's what `handle_call` returns:

<return-tuple>

```text
{  :reply,          reply,           new_state  }
   ───────          ──────           ─────────
   what to do:      sent back to     the state the loop
   send a reply     the caller       carries on with
```

</return-tuple>

<script type="module" src="return-tuple.js"></script>

And all three:

- `{:ok, state}` from `init`: the server has started, and `state` is its first state.
- `{:reply, reply, new_state}` from `handle_call`: send `reply` back to the caller, and carry on with `new_state`.
- `{:noreply, new_state}` from `handle_cast`: there's nobody waiting for a reply, so just carry on with `new_state`.

So `{:reply, :ok, left - 1}` means reply `:ok`, and the new state is `left` decremented. `{:reply, left, left}` replies with how many tickets are left and keeps the state as it was. `left` is both the reply and the new state. A GenServer callback always returns the state, even when it hasn't changed.

Here's the ticket server's state going round the loop. Send it a few messages, and watch each one start from the state the last one left behind:

<genserver-loop>

```text
message          state      the callback, and what it returned
(start)              2      init(2) returns {:ok, 2}
buy a ticket     2 → 1      handle_call(:buy, from, 2) returns {:reply, :ok, 1}
what's left?     1 → 1      handle_call(:left, from, 1) returns {:reply, 1, 1}
add 2 tickets    1 → 3      handle_cast({:add, 2}, 1) returns {:noreply, 3}
buy a ticket     3 → 2      handle_call(:buy, from, 3) returns {:reply, :ok, 2}
```

*The live version of this needs JavaScript. In it, you send the server messages and watch its state go round the loop: each message takes the state down a step and it lands as the next one, changed or the same.*

</genserver-loop>

<script type="module" src="genserver-loop.js"></script>

## One message at a time

A server handles one message, start to finish, before it looks at the next. Each `handle_call` returns before the loop's next `receive`. So the state never needs a lock: only the server can touch it, and it only works on one request at a time.

That holds even when handling a request means waiting. Here's a ticket sale with the seller as a GenServer: three buyers ask at the same moment for the last two tickets, and `handle_call` waits 100 ms on a payment process in the middle of each sale ([wait-inside.exs](wait-inside.exs)):

```elixir
def handle_call(:buy, _from, {0, payments}), do: {:reply, :sold_out, {0, payments}}

def handle_call(:buy, _from, {left, payments}) do
  :paid = Payments.charge(payments) # takes 100 ms
  {:reply, :ok, {left - 1, payments}}
end
```

`Payments.charge` is a call written by hand, like `buy` in the server by hand. The payment process replies 100 ms later:

```elixir
defmodule Payments do
  def start, do: spawn(fn -> loop() end)

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

Two tickets, two sales, and the third buyer hears they're sold out. While the server waits for the payment, it's in a `receive` that only the payment's reply matches, and the other buyers' requests wait in its mailbox. Nothing looks at them until the sale before them is done.

The times show what that costs. The second buyer waited for the first sale, and the third for both. The server does one thing at a time by design.

## What `call` does

A call is synchronous: the caller sends its request and then does nothing else until the reply comes back. But what if the reply never comes? Networks are going to network, or maybe the server died, or is stuck, or is just slow.

`GenServer.call` handles bad outcomes. By deferring the work to Erlang's `gen:call`, and here's the Erlang function called `do_call` in `gen.erl` that's handling the edges.

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

It's Erlang, not Elixir, but it's made of the same plain shapes: a send, then a receive with patterns.

The pieces:

- `erlang:monitor` sets up a monitor: the caller gets a `'DOWN'` message if the server dies, or right away if it's already dead. It returns a reference, and since a reference is unique, the call uses it as the reply's tag. That gets the BEAM's fast receive, which looks only at messages that arrived after the reference was made.
- `{alias,demonitor}` makes that reference an *alias* as well: an address the reply can be sent to, which reaches the caller only until the monitor is removed.
- The request goes to the server as `{:"$gen_call", {caller, tag}, request}`. The server's loop knows `:"$gen_call"` means a call, passes `{caller, tag}` to `handle_call` as `from`, and sends the reply to the alias.
- Then the caller waits for one of three things: the reply, a `'DOWN'`, or the timeout which defaults to 5,000 ms.

The fast receive works here too, with the reference inside `[alias | Mref]`. Here's a call from a process with a mailbox full of messages it's not looking to receive ([call-scan.exs](call-scan.exs)):

```text
$ elixir call-scan.exs
     0 other messages waiting: call 1.0 µs
  1000 other messages waiting: call 1.0 µs
 10000 other messages waiting: call 1.0 µs
100000 other messages waiting: call 1.0 µs
```

The whole round trip, server included, takes a microsecond however many messages are waiting.

Each of those is there because of a way a call can go wrong. Here are two of them, each with the same call written by hand beside it. The call by hand sends the server the same message `GenServer.call` does, so the server can't tell them apart, but it waits the way `buy` did in the server by hand: a reference and a receive, with no monitor and no alias.

### The server dies

Here the server crashes in the middle of a call, and then gets called again after it's gone ([call-dies.exs](call-dies.exs)). The server:

```elixir
def handle_call(:crash, _from, _state) do
  Process.sleep(100)
  raise "oops"
end
```

The caller, with `GenServer.call`, run twice:

```elixir
try do
  GenServer.call(server, :crash)
catch
  :exit, {{%RuntimeError{} = e, _stacktrace}, _where} ->
    IO.puts("caller exited: the server raised #{inspect(e)}")

  :exit, {reason, _where} ->
    IO.puts("caller exited: #{inspect(reason)}")
end
```

And by hand:

```elixir
ref = make_ref()
send(server, {:"$gen_call", {self(), ref}, :crash})

receive do
  {^ref, reply} -> IO.puts("reply: #{inspect(reply)}")
after
  5_000 -> IO.puts("still waiting after 5 seconds")
end
```

```text
$ elixir call-dies.exs
## GenServer.call
caller exited: the server raised %RuntimeError{message: "oops"}
server alive? false
caller exited: :noproc
caller's mailbox: []

## By hand, with no monitor
still waiting after 5 seconds
```

The first call fails with the server's own error, and the second with `:noproc`, no such process, at once. That's the monitor. A send to a process that's gone never fails so without a monitor nothing tells the caller, and the call by hand would wait forever if its `after` didn't give up.

When a call fails, the caller exits, the same as an error in its own code. The script catches the exit so it can print it. A real program usually doesn't, and then anything linked to the caller dies too, unless it traps exits.

### The caller gives up

Here the server takes 300 ms over a request, and the caller only waits 100 ([call-timeout.exs](call-timeout.exs)). The server:

```elixir
def handle_call(:work, _from, state) do
  Process.sleep(300)
  {:reply, :done, state}
end
```

The caller, with `GenServer.call` and then by hand, looking in its own mailbox half a second after each one gives up:

```elixir
show_mailbox = fn ->
  {:messages, messages} = Process.info(self(), :messages)
  IO.puts("500 ms later, the caller's mailbox: #{inspect(messages)}")
end

try do
  GenServer.call(server, :work, 100) # only wait 100ms for a response
catch
  :exit, {reason, _where} -> IO.puts("caller exited: #{inspect(reason)}")
end

Process.sleep(500)
show_mailbox.()

ref = make_ref()
send(server, {:"$gen_call", {self(), ref}, :work})

receive do
  {^ref, reply} -> IO.puts("reply: #{inspect(reply)}")
after
  100 -> IO.puts("gave up")
end

Process.sleep(500)
show_mailbox.()
```

```text
$ elixir call-timeout.exs
## GenServer.call, giving up after 100 ms
caller exited: :timeout
500 ms later, the caller's mailbox: []

## By hand, giving up after 100 ms
gave up
500 ms later, the caller's mailbox: [{#Reference<0.3433416021.1507852296.193126>, :done}]
```

Giving up doesn't stop the server. It still did the work and dutifully sent the reply 200 ms later. With the call by hand, that late reply landed in the caller's mailbox even though the caller had already moved on.

With `GenServer.call` it never arrived. On a timeout, `do_call` removes the monitor, and with it the alias, so the late reply goes nowhere.

### The server is too slow

The third thing `call` gives you is backpressure. The caller waits for each reply, so it can't send faster than the server answers.

## Casts and other messages

A cast has none of that. `GenServer.cast` returns `:ok` "regardless of whether the destination `server` (or node) exists", because it doesn't wait to find out. That's a plain `send`: no monitor, no timeout, no backpressure, and a mailbox that can grow without limit.

Every other message sent to a GenServer: a plain `send`, a timer's message from `Process.send_after`, a monitor's `'DOWN'`, etc. goes to `handle_info`.

- `handle_call`: synchronous requests
- `handle_cast`: asynchronous requests
- `handle_info`: non-GenServer messages

## GenServer tooling

Because every GenServer runs the same loop, tools can work with any of them. The loop understands a few *system messages* besides yours, and Erlang's `:sys` module sends them. Here's the ticket server again, with nothing added to it but with a peek into what the GenServer tooling can observe ([sys.exs](sys.exs)):

```elixir
{:ok, server} = Tickets.start(2)

IO.puts("get_state: #{:sys.get_state(server)}")

:sys.trace(server, true)
:sys.statistics(server, true)
Tickets.buy(server)
Tickets.buy(server)
Tickets.buy(server)
:sys.trace(server, false)
{:ok, stats} = :sys.statistics(server, :get)
IO.puts("statistics: #{inspect(Keyword.take(stats, [:messages_in, :messages_out]))}")

:sys.replace_state(server, fn _ -> 1 end)
IO.puts("replace_state, then get_state: #{:sys.get_state(server)}")

:sys.suspend(server)
buyer = Task.async(fn -> Tickets.buy(server) end)
Process.sleep(1_000)
{:message_queue_len, waiting} = Process.info(server, :message_queue_len)
IO.puts("suspended for 1 s: #{waiting} request waiting")
:sys.resume(server)
IO.puts("resumed: the buyer got #{inspect(Task.await(buyer))}")
```

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

`:sys.get_state` reads the server's state, `:sys.trace` prints every request, reply, and new state as they happen, `:sys.statistics` counts them, and `:sys.replace_state` sets the state from outside. `:sys.suspend` makes the server answer only system messages, so a buy waited in its mailbox until `:sys.resume`. (The buy runs in a separate process, started with `Task.async`, because a call would block the script until the reply came.) All of that works on a server while it runs, without changing or restarting it.

Two more things come with it. `use GenServer` writes a `child_spec/1` function, which tells a supervisor how to start the server. And a `code_change` callback is "invoked to change the state of the `GenServer` when a different version of a module is loaded".

## And in Node?

[The same sale in Node](/leaflets/beam-at-work/page-4/), with the tickets as an object and an async `buy()`, gave all three buyers a ticket, because `await` handed the thread back while each payment was out and the other buyers checked in the meantime, until a queue made each sale wait for the one before it. A GenServer, like any process, takes one request at a time without being asked.

Between threads, Node has messages, and a call to a worker thread is something you have to build. Here's a call written by hand on top of `postMessage`, with what `do_call` has: an id on each request, a timeout, late replies dropped, and calls failed when the worker dies, run through the same cases as above ([call-by-hand.mjs](call-by-hand.mjs)):

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

It works, and at 41 lines it's about the size of `do_call`, whose three clauses come to 53. Neither is exactly hard to write. What's different is who wrote it, and how much it's been through. In Node, each program that needs a call like this writes its own or finds one. In the BEAM it's written once, in the standard library, and every server gets the same one, already written, already tested, and already tuned. The runtime has features built for it: the fast receive that kept a call at a microsecond with 100,000 messages waiting, and the aliases that drop late replies, which Erlang's docs describe as "useful in client/server scenarios".

And it has been through a lot. `gen_server` is part of OTP, which Ericsson started in 1996 for the AXD301, a telecom switch built for "carrier-class" non-stop operation. In a 2001 snapshot of the AXD301's code, over a million lines of Erlang, 122 of its 191 standard OTP processes were gen_servers. Discord built its chat service on Elixir from its first prototype: when it wrote up how it reached nearly five million users connected at once, in 2017, each connected user had a session process, "a GenServer", and each Discord server was a GenServer too.

And Node's is per worker, at megabytes a thread, where the BEAM's works with any process.

## Tradeoffs

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

Elixir's docs warn about exactly this: putting code behind "a single process that will potentially become a bottleneck in your system", and "If you don't need a process, then you don't need a process."

Discord's write-up of reaching five million users at once is largely about single processes that couldn't keep up. Each Discord server is a guild process that sends everything posted in it on to the session of every member who's connected, and at peak hours the guild processes fell behind their mailboxes.

What Elixir programs do instead depends on the state. Work that doesn't need to query or update server state shouldn't go through a server at all, as in the second column. State that splits by key can live in several servers, one per part. State that's read far more than it's written can go in an ETS table, a data store built into the BEAM that any process can read from.

## Watch it happen

The widget in "Where the state lives" showed the state going from one message to the next. Here's the same thing inside a running server, with its mailbox and a client sending it requests.

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

- The scripts and their runs: [by-hand.exs](by-hand.exs), [genserver.exs](genserver.exs), [wait-inside.exs](wait-inside.exs), [state.exs](state.exs), [call-dies.exs](call-dies.exs), [call-timeout.exs](call-timeout.exs), [call-scan.exs](call-scan.exs), [sys.exs](sys.exs), [bottleneck.exs](bottleneck.exs), and [call-by-hand.mjs](call-by-hand.mjs), run 2026-11-12 on an Apple M1 (8 cores: 4 performance, 4 efficiency) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1) and Node v25.9.0.
- A tail-recursive call using no stack, so a loop can "run forever": the Erlang reference manual, [Tail recursion](https://www.erlang.org/doc/system/ref_man_functions.html#tail-recursion).
- GenServer as "a process like any other Elixir process" with "a standard set of interface functions" and tracing: [GenServer](https://hexdocs.pm/elixir/1.19.5/GenServer.html). `GenServer.call` passing the request to `:gen.call` with the label `:"$gen_call"` and a default timeout of 5,000: [gen_server.ex at v1.19.5](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/lib/gen_server.ex#L1108-L1146). `cast` returning `:ok` whether or not the server exists: [L1149–L1161](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/lib/gen_server.ex#L1149-L1161). `handle_info` handling "all other messages": [L650–L656](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/lib/gen_server.ex#L650-L656). `code_change`: [L749–L760](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/lib/gen_server.ex#L749-L760). The bottleneck warning: [L380–L396](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/lib/gen_server.ex#L381-L396). `child_spec/1` and the `:sys` functions: [Debugging with the :sys module](https://hexdocs.pm/elixir/1.19.5/GenServer.html#module-debugging-with-the-sys-module) and [How to supervise](https://hexdocs.pm/elixir/1.19.5/GenServer.html#module-how-to-supervise).
- The server loop taking the oldest message and dispatching `'$gen_call'` to `handle_call`: [gen_server.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/gen_server.erl#L2320-L2326) and [L2498–L2518](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/gen_server.erl#L2498-L2518). `do_call`: [gen.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/gen.erl#L231-L281); the reply sent to the alias: [L549–L554](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/gen.erl#L549-L554). Late replies not received: [`gen_server:call/3`](https://www.erlang.org/doc/apps/stdlib/gen_server.html#call/3).
- Monitors, `'DOWN'` messages, and `noproc` for a process that didn't exist: [`erlang:monitor/2`](https://www.erlang.org/doc/apps/erts/erlang.html#monitor/2). The `{alias, demonitor}` option deactivating the alias "when the monitor is removed": [`erlang:monitor/3`](https://www.erlang.org/doc/apps/erts/erlang.html#monitor/3).
- The fast receive for a reference made just before: the sources of The BEAM at Work's page 4.
- `sys` and system messages: [sys](https://www.erlang.org/doc/apps/stdlib/sys.html).
- OTP started in 1996 for the AXD301; the AXD301's "carrier-class" non-stop operation; the 2001 snapshot's size and its 191 behaviour instances, 122 of them `gen_server`: Joe Armstrong, [*Making reliable distributed systems in the presence of software errors*](https://erlang.org/download/armstrong_thesis_2003.pdf) (2003), pages 6, 171, and 174 (sections 1.1, 8.2, and 8.3). Aliases "useful in client/server scenarios": [`erlang:monitor/3`](https://www.erlang.org/doc/apps/erts/erlang.html#monitor/3). Discord's session and guild processes as GenServers, and nearly five million concurrent users: Stanislav Vishnevskiy, [How Discord Scaled Elixir to 5,000,000 Concurrent Users](https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users) (Discord, 2017).
- Guild processes falling behind their message queues: the same Discord post, Message Fanout.
- `PartitionSupervisor`: [its docs](https://hexdocs.pm/elixir/1.19.5/PartitionSupervisor.html). ETS reads "from any processes but writes are still serialized through a single process": Elixir's guide, [Speeding up with ETS](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/pages/mix-and-otp/erlang-term-storage.md).
- Node's `await` and the one thread: the sources of The BEAM at Work's page 1. Worker `'error'` and `'exit'` events: Node's [worker_threads docs](https://nodejs.org/api/worker_threads.html#event-error).
