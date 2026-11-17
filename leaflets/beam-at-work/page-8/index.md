---
tags: elixir, beam, nodejs
publish: false
meta_description: GenStage turns page 4's slow consumer around. The consumer asks for events and the producer never sends more than it asked for, so the backlog can't pile up in the consumer, and what happens to it becomes a choice.
---

Page 4 ended with a producer sending faster than its consumer could keep up, and two cheap answers. Send and move on, and the consumer's mailbox grows until something gives. Wait for each reply, and nothing piles up, but only one message is ever on its way, and the consumer sits idle while each reply goes back and the next message comes in.

GenStage is the answer in between. It turns the conversation around: the consumer tells the producer how many events it can take, and the producer sends no more than that. Many events can be on their way at once, but never more than the consumer asked for.

GenStage isn't part of the BEAM, or of Elixir's standard library. It's a separate package, `gen_stage`, from the Elixir team, and like page 6's GenServer it's plain code built from sends and receives. Its docs say it "is implemented on top of a `GenServer` with a few additions."

## Asking for events

A GenStage process is a *stage*, and every stage is a producer, a consumer, or both. A consumer subscribes to a producer, and from then on it sends the producer *demand*: a number of events it's ready for. In GenStage's docs: "the producer will emit events, never emitting more events than the consumer asked for. This provides a back-pressure mechanism."

Here's a producer that counts, and a consumer that takes 100 ms over each event and asks for at most 10 at a time ([demand.exs](demand.exs)):

```elixir
Mix.install([{:gen_stage, "1.3.2"}])

defmodule Counter do
  use GenStage

  def init(next), do: {:producer, next}

  def handle_demand(demand, next) do
    events = Enum.to_list(next..(next + demand - 1))
    IO.puts("#{Clock.now()}  producer asked for #{demand}, sends #{inspect(events)}")
    {:noreply, events, next + demand}
  end
end

defmodule Slow do
  use GenStage

  def init(producer), do: {:consumer, nil, subscribe_to: [{producer, max_demand: 10}]}

  def handle_events(events, _from, state) do
    IO.puts("#{Clock.now()}  consumer got #{inspect(events)}")
    Process.sleep(100 * length(events))
    {:noreply, [], state}
  end
end

{:ok, counter} = GenStage.start_link(Counter, 1)
{:ok, _slow} = GenStage.start_link(Slow, counter)
Process.sleep(2100)
```

`Mix.install` fetches the package, and `Clock.now()` gives the milliseconds since the script started:

```text
$ elixir demand.exs
    2 ms  producer asked for 10, sends [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    3 ms  consumer got [1, 2, 3, 4, 5]
  504 ms  consumer got [6, 7, 8, 9, 10]
  504 ms  producer asked for 5, sends [11, 12, 13, 14, 15]
 1005 ms  consumer got [11, 12, 13, 14, 15]
 1005 ms  producer asked for 5, sends [16, 17, 18, 19, 20]
 1506 ms  consumer got [16, 17, 18, 19, 20]
 1506 ms  producer asked for 5, sends [21, 22, 23, 24, 25]
 2007 ms  consumer got [21, 22, 23, 24, 25]
 2007 ms  producer asked for 5, sends [26, 27, 28, 29, 30]
```

The producer never decides to send anything. Its `handle_demand` callback runs when demand arrives, and returns the events to send. The consumer's `handle_events` callback runs with the events, and when it returns, GenStage asks for more on its behalf.

The consumer asked for 10 to begin with, its `max_demand`, and got 10. It didn't handle them all at once, though. It handled them 5 at a time, and as soon as it finished the first 5, it asked for 5 more, so they were on their way while it worked on the second 5. The consumer always had the next events waiting when it finished, and it never had more than 10 that it hadn't handled.

Those 5s come from a second setting, `min_demand`, which is half of `max_demand` unless you say otherwise. The consumer handles at most `max_demand - min_demand` events at a time, and each time what it's waiting for falls to `min_demand` or below, it asks for enough to bring it back up to `max_demand`. GenStage's defaults are 1,000 and 500.

## Page 4's slow consumer, again

Here's page 4's slow consumer as a GenStage pipeline. Events arrive at the producer 1,000 a second, and the consumer works on each one for 2 ms, so it can handle 500 a second ([pipeline.exs](pipeline.exs)):

```elixir
defmodule Producer do
  use GenStage

  def init(counts), do: {:producer, counts, buffer_size: 2_000}

  # An event arriving from outside: emit it. GenStage sends it to a
  # consumer that has asked for one, or keeps it in its buffer.
  def handle_info({:event, event}, counts), do: {:noreply, [event], counts}

  # Demand from a consumer: nothing to make here, events come from outside
  def handle_demand(_demand, counts), do: {:noreply, [], counts}

  # Called when the buffer is full and events are dropped
  def format_discarded(dropped, counts) do
    :counters.add(counts, 2, dropped)
    false
  end
end

defmodule Consumer do
  use GenStage

  def init({producer, counts}), do: {:consumer, counts, subscribe_to: [{producer, max_demand: 50}]}

  def handle_events(events, _from, counts) do
    Enum.each(events, fn _event ->
      Work.busy(2)
      :counters.add(counts, 1, 1)
    end)
    {:noreply, [], counts}
  end
end
```

`Work.busy(2)` keeps the consumer busy for 2 ms by the clock, as in page 4, and `counts` is a pair of shared counters, for the events handled and the events dropped, so the script can report them. The rest of the script is page 4's loop: an event is due every millisecond since the start, sent to the producer with `send(producer, {:event, n})`, and every second it reports how many events have arrived, how many are handled, how many are in flight (sent to the consumer but not handled yet), how many are waiting in the producer's buffer, and how many have been dropped:

```text
$ elixir pipeline.exs 1
consumers: 1
1000 ms: arrived  999, handled  499, in flight   26, buffered  474, dropped    0
2000 ms: arrived 1999, handled  999, in flight   26, buffered  974, dropped    0
3000 ms: arrived 2999, handled 1499, in flight   26, buffered 1474, dropped    0
4000 ms: arrived 3999, handled 1999, in flight   26, buffered 1974, dropped    0
5000 ms: arrived 4999, handled 2499, in flight   26, buffered 2000, dropped  474
6000 ms: arrived 5999, handled 2999, in flight   26, buffered 2000, dropped  974
7000 ms: arrived 6999, handled 3499, in flight   26, buffered 2000, dropped 1474
8000 ms: arrived 7999, handled 3999, in flight   26, buffered 2000, dropped 1974
```

The consumer handles 500 a second, as it did in page 4. Nothing can change that. What's changed is where the other 500 a second go.

They don't go to the consumer. It asked for 50, and at no point did it have more than 50 that it hadn't handled. Its mailbox stays short, and so it stays small, however long this runs. In page 4 the consumer's mailbox grew by 500 messages a second, and its memory with it.

The producer keeps them instead. When an event arrives and no consumer has asked for one, GenStage puts it in the producer's buffer, and sends it on when a consumer asks. That buffer has a size, 10,000 events unless you say otherwise; it's 2,000 here, to get there sooner. Once it's full, each event that arrives pushes the oldest one out, and it's dropped. By default GenStage logs a warning each time it drops events; this producer's `format_discarded` counts them instead.

## Where the extra goes

Demand can't slow down the world outside. Events arrive at 1,000 a second whether the consumer asked for them or not, and the 500 a second it can't handle have to go somewhere. Page 4's send-and-move-on put them in the consumer's mailbox, without limit. GenStage moves them to the edge of the pipeline, the producer that events come in at, and gives them a limit. What happens past the limit is now a decision, and it's yours. There are three things you can do with events nobody has asked for:

- Keep them, and the backlog grows. GenStage's buffer does that up to its size, and a `buffer_size` of `:infinity` does it without limit, which is page 4's growing mailbox in a different process.
- Drop them, as the buffer does when it's full. It keeps the newest unless you set `buffer_keep: :first`, and keeps the oldest.
- Make whatever is sending them wait. That's page 4's call again, one level further out. GenStage's docs have an example: a producer whose `sync_notify` function is a call, and it replies only once a consumer has asked for the event, so the sender waits until then.

Which is right depends on what the events are. Dropping the oldest suits readings from a sensor, where the newest is what matters. It doesn't suit orders.

Often the best place to wait is somewhere built for it. A message queue service holds a backlog for as long as it takes, on disk, and hands out messages when asked. Broadway, a library built on GenStage for reading from queues like Amazon SQS and RabbitMQ, works that way: its producers ask the queue for only as many messages as their consumers have asked for. From Broadway's docs: "by relying on `GenStage`, we only get the amount of events necessary from upstream sources, never flooding the pipeline."

## More consumers

A consumer that can't keep up can have help. Here's the same pipeline with two consumers and then three, all subscribed to the one producer:

```text
$ elixir pipeline.exs 2
consumers: 2
1000 ms: arrived  999, handled  985, in flight   14, buffered    0, dropped    0
2000 ms: arrived 1999, handled 1985, in flight   14, buffered    0, dropped    0
3000 ms: arrived 2999, handled 2985, in flight   14, buffered    0, dropped    0
4000 ms: arrived 3999, handled 3985, in flight   14, buffered    0, dropped    0
5000 ms: arrived 4999, handled 4985, in flight   14, buffered    0, dropped    0
6000 ms: arrived 5999, handled 5985, in flight   14, buffered    0, dropped    0
7000 ms: arrived 6999, handled 6985, in flight   14, buffered    0, dropped    0
8000 ms: arrived 7999, handled 7985, in flight   14, buffered    0, dropped    0
$ elixir pipeline.exs 3
consumers: 3
1000 ms: arrived  998, handled  996, in flight    2, buffered    0, dropped    0
2000 ms: arrived 1998, handled 1996, in flight    2, buffered    0, dropped    0
3000 ms: arrived 2998, handled 2996, in flight    2, buffered    0, dropped    0
4000 ms: arrived 3998, handled 3996, in flight    2, buffered    0, dropped    0
5000 ms: arrived 4998, handled 4996, in flight    2, buffered    0, dropped    0
6000 ms: arrived 5998, handled 5996, in flight    2, buffered    0, dropped    0
7000 ms: arrived 6998, handled 6996, in flight    2, buffered    0, dropped    0
8000 ms: arrived 7998, handled 7996, in flight    2, buffered    0, dropped    0
```

Two consumers handle 500 a second each, which is exactly what arrives, and the buffer stays empty. With three there's room to spare, and every event is handled about as soon as it arrives.

Each consumer is a process, so as page 1 showed, they run at the same time on different schedulers, and the busy work spreads over the machine's cores. The producer keeps track of each consumer's demand separately, and by default sends each batch to the consumer that has asked for the most. Each consumer still never gets more than it asked for, so adding consumers can't overload any of them.

GenStage also has a `ConsumerSupervisor`, which goes one further: it starts a new process for every event, under a supervisor, with at most `max_demand` of them running at once.

## And in Node?

Node has this in its standard library, and has for a long time. A readable stream asks for data by calling its `_read()` method, and "`_read()` may continue reading from the resource and pushing data until `readable.push()` returns `false`." Pipe it to a writable stream, and the readable stops asking whenever the writable has a buffer's worth waiting. The docs: "A key goal of the `stream` API, particularly the `stream.pipe()` method, is to limit the buffering of data to acceptable levels such that sources and destinations of differing speeds will not overwhelm the available memory." That's demand, under another name.

Here's pipeline.exs again in Node, with the same limit of 2,000 waiting events, and a writable stream taking 2 ms over each event ([pipeline.mjs](pipeline.mjs)):

```javascript
const waiting = [];
let asked = false;
let dropped = 0;
const source = new Readable({
  objectMode: true,
  read() {
    // The stream wants more: give it what's waiting, until it says stop
    asked = true;
    while (asked && waiting.length) asked = this.push(waiting.shift());
  },
});
const arrive = (event) => {
  if (asked) asked = source.push(event);
  else if (waiting.length < 2_000) waiting.push(event);
  else dropped++;
};

let handled = 0;
const sink = new Writable({
  objectMode: true,
  write(event, _encoding, done) {
    if (mode === "busy") {
      busy(2);
      handled++;
      done();
    } else {
      setTimeout(() => { handled++; done(); }, 2);
    }
  },
});
pipeline(source, sink);
```

The loop that calls `arrive` and reports is the same as before. The first run spends the 2 ms waiting, the way a stream writing to a slow disk or a slow client would:

```text
$ node pipeline.mjs wait
node v25.9.0, mode: wait
1000 ms: arrived  999, handled  468, in flight   24, buffered  507, dropped    0
2000 ms: arrived 1999, handled  919, in flight   21, buffered 1059, dropped    0
3000 ms: arrived 2999, handled 1365, in flight   23, buffered 1611, dropped    0
4000 ms: arrived 3999, handled 1821, in flight   31, buffered 1986, dropped  161
5000 ms: arrived 4998, handled 2282, in flight   18, buffered 2000, dropped  698
6000 ms: arrived 5999, handled 2741, in flight   23, buffered 2000, dropped 1235
7000 ms: arrived 6999, handled 3201, in flight   27, buffered 1995, dropped 1776
8000 ms: arrived 7999, handled 3660, in flight   32, buffered 1985, dropped 2322
```

It behaves like the GenStage pipeline. (It handles a little under 500 a second, because a 2 ms timer takes a little longer than 2 ms.) The two streams' buffers hold 16 objects each by default, so there are never more than about 32 in flight, and the rest wait at the edge, where the code decides what to do with them. And just as with GenStage, the streams don't decide that for you: the `highWaterMark` that sets a buffer's size "is a threshold, not a limit", and a source that ignores `push()` returning `false` can keep pushing.

The second run spends the 2 ms working, as pipeline.exs's consumer did:

```text
$ node pipeline.mjs busy
node v25.9.0, mode: busy
1000 ms: arrived  499, handled  499, in flight    0, buffered    0, dropped    0
2000 ms: arrived  999, handled  999, in flight    0, buffered    0, dropped    0
3000 ms: arrived 1498, handled 1498, in flight    0, buffered    0, dropped    0
4000 ms: arrived 1998, handled 1998, in flight    0, buffered    0, dropped    0
5000 ms: arrived 2498, handled 2498, in flight    0, buffered    0, dropped    0
6000 ms: arrived 2998, handled 2998, in flight    0, buffered    0, dropped    0
7000 ms: arrived 3498, handled 3498, in flight    0, buffered    0, dropped    0
8000 ms: arrived 3997, handled 3997, in flight    0, buffered    0, dropped    0
```

Only 500 events a second arrived. Here the events come from a loop in the same thread, and that loop can't run while the consumer is working, so it's page 1 again: one thing runs at a time, and the consumer's work holds up everything else, including the arrivals. In this script the missing events were never made. In a real program, events coming from outside would have to wait outside it until the thread was free.

So Node's streams give you demand between the parts of a program, as long as the slow part is waiting on something. When the slow part is the work itself, a stream can't spread it out, because every stage runs in the one thread. More consumers wouldn't help, the way they did for GenStage. To use the other cores you'd move the work into worker threads and pass events to them with `postMessage`, and the demand between them, how many each worker has asked for and how many it has been sent, would be yours to write.

## Watch it happen

<!-- TODO: the widget. A producer with its buffer, one to three consumers with their demand, events going one way and demand the other. -->

## Where it gives ground

GenStage is a library, and you have to choose to use it. Nothing in the BEAM stops one process sending another more than it can handle; plain `send`, and GenServer's `cast`, still never wait. Demand only helps between processes that agree to use it.

It's more machinery than a plain process. A stage has a type, subscriptions, demand settings, and a dispatcher, and the numbers matter: the docs warn that "making the buffer too small may make the whole pipeline slower, making the buffer too big may unnecessarily consume memory." For one producer and one consumer that are never far apart in speed, a GenServer call is simpler.

And demand doesn't make a slow consumer faster. It decides where the waiting happens and how much of it there can be. A pipeline that gets more than it can handle for long enough still has to wait, keep, or drop, and GenStage leaves that choice to you.

## Sources

- The scripts and their runs: [demand.exs](demand.exs), [pipeline.exs](pipeline.exs), and [pipeline.mjs](pipeline.mjs), run 2026-11-17 on an Apple M1 (8 cores) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1), GenStage 1.3.2, and Node v25.9.0.
- Stage types, consumers sending demand upstream and producers "never emitting more events than the consumer asked for", `GenStage` being "implemented on top of a `GenServer` with a few additions", `:max_demand` and `:min_demand`, the buffer and its `:buffer_size` of 10,000 for a producer, `:buffer_keep`, `format_discarded/2`, `estimate_buffered_count/2`, the default `GenStage.DemandDispatcher` sending "batches to the highest demand", `ConsumerSupervisor` running at most `max_demand` children, the `QueueBroadcaster` example whose `sync_notify` "returns only after the event is dispatched", and the warning about buffer sizes: [GenStage's docs](https://hexdocs.pm/gen_stage/1.3.2/GenStage.html) and [GenStage.DemandDispatcher](https://hexdocs.pm/gen_stage/1.3.2/GenStage.DemandDispatcher.html). The defaults of 1,000 for `:max_demand` and half of it for `:min_demand`, which the docs don't state: [gen_stage.ex at v1.3.2](https://github.com/elixir-lang/gen_stage/blob/v1.3.2/lib/gen_stage.ex#L2608-L2610). Batches of `max_demand - min_demand` and asking for more after each one: [`split_batches` in utils.ex](https://github.com/elixir-lang/gen_stage/blob/v1.3.2/lib/gen_stage/utils.ex#L96-L130). A full buffer dropping the oldest with `:last`, and the warning logged: [buffer.ex](https://github.com/elixir-lang/gen_stage/blob/v1.3.2/lib/gen_stage/buffer.ex#L75-L92) and [gen_stage.ex](https://github.com/elixir-lang/gen_stage/blob/v1.3.2/lib/gen_stage.ex#L2449-L2476).
- Broadway being built on GenStage and getting "only ... the amount of events necessary from upstream sources": [Broadway's docs](https://hexdocs.pm/broadway/1.3.1/Broadway.html).
- `_read()`, `push()` returning `false`, buffering, the goal of limiting it, `highWaterMark` being "a threshold, not a limit", and its default of 16 in object mode: Node's [stream docs](https://nodejs.org/api/stream.html), [Buffering](https://nodejs.org/api/stream.html#buffering), [`readable._read()`](https://nodejs.org/api/stream.html#readable_readsize), and [`stream.getDefaultHighWaterMark()`](https://nodejs.org/api/stream.html#streamgetdefaulthighwatermarkobjectmode).
