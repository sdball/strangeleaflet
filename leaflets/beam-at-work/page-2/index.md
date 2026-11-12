---
tags: elixir, beam, nodejs
publish: false
meta_description: What a BEAM process is (not an operating system process), what one costs, and how the schedulers share thousands of them out
---

Page 1 had two processes, a ticker and a busy loop. Real Elixir programs run thousands. Cowboy, a web server Erlang and Elixir apps use, starts a process for every connection and another for every request. That only works if a process costs next to nothing. This page is about how little, and why.

## Not that kind of process

First, the word. To most programmers a process is what `ps` or Activity Monitor lists: a running program with its own process id, its own memory that the operating system keeps other programs out of, and the operating system deciding when it gets a core.

A BEAM process isn't one of those. The whole BEAM is one operating system process. Its schedulers, from page 1, are threads inside that process, one per logical processor. BEAM processes live inside the BEAM, in its memory, and the schedulers take turns running them. The operating system never hears about them.

You don't have to take my word for it. This script starts 100,000 BEAM processes and asks the operating system what changed:

```elixir
# Start 100,000 BEAM processes and ask the operating system what changed.
os_pid = System.pid()

threads = fn ->
  {out, 0} = System.cmd("ps", ["-M", "-p", os_pid])
  length(String.split(out, "\n", trim: true)) - 1
end

children = fn ->
  {out, 0} = System.cmd("ps", ["-ax", "-o", "ppid=,pid=,comm="])
  for line <- String.split(out, "\n", trim: true),
      [ppid, pid, comm] = String.split(line, " ", trim: true, parts: 3),
      ppid == os_pid,
      comm != "ps",
      do: "#{pid} #{Path.basename(comm)}"
end

report = fn label ->
  IO.puts(label)
  IO.puts("  BEAM processes:      #{length(Process.list())}")
  IO.puts("  OS process id:       #{os_pid}")
  IO.puts("  its OS threads:      #{threads.()}")
  IO.puts("  its OS children:     #{Enum.join(children.(), ", ")}")
end

report.("before")
pids = for _ <- 1..100_000, do: spawn(fn -> receive do: (:stop -> :ok) end)
report.("after spawning 100,000")
Enum.each(pids, &send(&1, :stop))
```

```text
$ elixir os-view.exs
before
  BEAM processes:      59
  OS process id:       77690
  its OS threads:      32
  its OS children:     77703 erl_child_setup
after spawning 100,000
  BEAM processes:      100059
  OS process id:       77690
  its OS threads:      32
  its OS children:     77703 erl_child_setup
```

A hundred thousand new processes, and the operating system saw nothing new. Same process id, same 32 threads, same one child.

The 59 processes before we started are the BEAM's own, and Elixir's: the code server, the logger, the processes that read your keyboard and write to your terminal. They're ordinary BEAM processes too. (`Process.registered()` lists the ones with names, like `:code_server`, `:logger`, and `:user_drv_reader`.)

The 32 threads are the 8 schedulers, plus 8 dirty CPU schedulers and 10 dirty I/O schedulers, plus a few helpers. Dirty schedulers run work that can't be counted in reductions, like long calls into native code. Page 8 comes back to them. And the one child, `erl_child_setup`, is a small program the BEAM starts when it boots. Whenever Elixir runs an outside program, like the `ps` calls in this script, `erl_child_setup` is the one that launches it.

So there are two layers of scheduling. The operating system decides which cores the BEAM's scheduler threads run on, and each scheduler decides which BEAM process runs on it. The operating system only ever sees the threads.

## So why call them processes?

Because they act like operating system processes in the ways that matter for writing programs. *The BEAM Book* puts it this way: "Conceptually, Erlang processes are similar to most OS processes". Then: "In practice, there is a huge difference in that Erlang processes are much more lightweight than most OS processes."

|  | Operating system process | BEAM process |
| --- | --- | --- |
| Has an id | `77690` | `#PID<0.115.0>` |
| Its own memory | yes | yes, its own heap and stack |
| What keeps others out | the operating system: it maps out what each process may touch, and the CPU checks every memory access against that map | the language: nothing in Elixir or Erlang can point at another process's memory |
| Talks to others by | pipes, sockets, signals | messages (page 4) |
| Who decides when it runs | the operating system, preemptively | a BEAM scheduler, preemptively, by counting reductions (page 1) |
| When it crashes | it ends, and its parent process can find out | it ends, and processes watching it are notified (page 5) |
| Cost to start, on my M1 | about 1.4 ms and 830 KB | about 1 µs and 2.6 KB |

BEAM processes aren't threads either. The book again: "Erlang processes are not like threads — they have no shared memory to modify, they can only communicate via messages". Threads in most languages share their memory with each other, so any thread can change data another thread is using. Data sent from one BEAM process to another is copied, so neither can change what the other is using.

That's what makes page 1's preemption safe in the BEAM. In languages like Java or C++, threads get preempted too, and a thread paused halfway through changing shared data leaves it half-changed for every other thread to see. That's why threads that share memory need locks, in any language. But when a BEAM process runs out of reductions any of its half-changed work is only its own data that no other process can see. The BEAM scheduler can pause any process at any function call, and, in the book's words, "Erlang programs do not need locking or protected sections."

## How cheap is cheap?

Here's a script spawning N processes that each sit waiting for a message, which is what most processes in a real program spend their time doing:

```elixir
# Spawn N processes that each wait for a message, then measure.
n = String.to_integer(List.first(System.argv()) || "100000")

:erlang.garbage_collect()
memory_before = :erlang.memory(:processes)
start = System.monotonic_time(:microsecond)

pids = for _ <- 1..n, do: spawn(fn -> receive do: (:stop -> :ok) end)

microseconds = System.monotonic_time(:microsecond) - start
bytes = :erlang.memory(:processes) - memory_before

IO.puts("#{n} processes: " <>
        "#{:erlang.float_to_binary(microseconds / n, decimals: 2)} µs each to spawn, " <>
        "#{round(bytes / n)} bytes each, " <>
        "#{:erlang.float_to_binary(bytes / 1_048_576, decimals: 1)} MB in all")

Enum.each(pids, &send(&1, :stop))
```

```text
$ for n in 1000 10000 100000 1000000; do elixir spawn.exs $n; done
1000 processes: 0.46 µs each to spawn, 2764 bytes each, 2.6 MB in all
10000 processes: 0.59 µs each to spawn, 2674 bytes each, 25.5 MB in all
100000 processes: 0.62 µs each to spawn, 2650 bytes each, 252.7 MB in all
1000000 processes: 0.97 µs each to spawn, 2641 bytes each, 2518.2 MB in all
```

A million processes in under a second, in about 2.5 GB. The BEAM's default limit is 1,048,576 processes, so a million just fits. (You can raise the limit with the `+P` flag.)

A brand-new process is 2,616 bytes: 327 words of 8 bytes, which is what the Erlang efficiency guide says to expect. 233 of those words are its heap, where its data lives. The rest is the BEAM's own record of the process. The heap starts small on purpose, so a system can hold millions of processes, and grows when a process needs more. So 2.6 KB is the floor. A process that's holding real data is bigger.

Here's what 2.6 KB looks like next to an operating system process. The top bar is an idle `sleep`, broken down by `vmmap`, the macOS tool that lists a process's memory. It counts only memory the process has written to, which is its own; the code of the libraries it loads is shared with every other program, so it's left out. The bottom bar is a new BEAM process, from `:erlang.process_info/2`. Both are drawn to the same scale.

<process-scale>

```text
An idle operating system process (sleep), 834 KB
  Stack                     32 KB
  Heap                     288 KB
  Libraries' data          289 KB
  Kernel's page tables     161 KB
  Other                     64 KB

A new BEAM process, 2,616 bytes
  Heap and stack         1,864 bytes
  The BEAM's record of it  752 bytes

The operating system process's memory would hold 326 new BEAM processes.
```

*The live version of this needs JavaScript. In it, the two are drawn as bars to the same scale, and you can pick a part to read what it is.*

</process-scale>

<script type="module" src="process-scale.js"></script>

## And in Node?

What's the closest thing in Node? It depends which part of a BEAM process you want.

If you want something that runs on its own and can't be held up by a busy loop elsewhere, that's a worker thread. Worker threads are real threads, scheduled preemptively by the operating system, and page 9 uses them to fix page 1's ticker. They're not cheap. Starting 8 idle ones on the same M1 ([worker-cost.mjs](worker-cost.mjs)), each took 6 to 8 ms and about 9.3 MB.

If you want something that waits cheaply for a message, that's an async function paused on a promise. It's the shape a Node server's request handlers take while they wait on a database or the network. And it's cheaper than a BEAM process ([pending.mjs](pending.mjs)):

```text
$ for n in 1000 10000 100000 1000000; do node --expose-gc pending.mjs $n; done
1000 pending async functions: 0.28 µs each to start, 675 bytes each of V8 heap
10000 pending async functions: 0.42 µs each to start, 571 bytes each of V8 heap
100000 pending async functions: 0.65 µs each to start, 563 bytes each of V8 heap
1000000 pending async functions: 0.50 µs each to start, 565 bytes each of V8 heap
```

About as fast to start, and a fifth of the memory. But a paused async function isn't a process. They all share one thread and one heap, and when one of them wakes up it runs until it pauses again or returns, however long that takes. Page 1 showed where that leads. A BEAM process costs a few hundred bytes more and gets its own heap (page 3 shows why that matters for garbage collection), its own turn in a run queue, preemption, and a crash that's its own.

These numbers come from three different measures: the BEAM's count of its process memory, V8's heap, and the operating system's view of resident memory for the worker threads. So read them as orders of magnitude, not exact ratios. For an operating system process, starting `/usr/bin/true` a thousand times from a shell took 1.4 ms each, and an idle `sleep` had about 830 KB of memory of its own (the scale bar above).

## Where a new BEAM process runs

When a BEAM process spawns another, the new one goes on the back of the run queue of the scheduler its parent is running on. So a BEAM process that spawns sixteen more puts all sixteen in one line.

The BEAM evens that out in two ways. One is page 1's: a scheduler with an empty run queue can pick up a process from another scheduler's queue. The other is migration. Every 8 million reductions or so (2,000 turns' worth), the schedulers compare their run queue lengths. Schedulers with longer queues than average hand processes over to ones with shorter queues.

Here's a parent spawning sixteen busy processes ([spread.exs](spread.exs)). It counts the processes waiting in each scheduler's run queue just before and just after spawning, and again half a second later. Each new process reports which scheduler it first ran on, then spins for a second:

```elixir
defmodule Busy do
  def spin(until) do
    if System.monotonic_time(:millisecond) < until, do: spin(until), else: :ok
  end
end

row = fn numbers -> Enum.map_join(numbers, " ", &String.pad_leading("#{&1}", 2)) end
per_scheduler = fn what -> Enum.take(:erlang.statistics(what), System.schedulers_online()) end

me = self()
IO.puts("parent is on scheduler #{:erlang.system_info(:scheduler_id)}")
before = per_scheduler.(:run_queue_lengths)

for i <- 1..16 do
  spawn(fn ->
    send(me, {i, :erlang.system_info(:scheduler_id)})
    Busy.spin(System.monotonic_time(:millisecond) + 1000)
  end)
end

just_after = per_scheduler.(:run_queue_lengths)
Process.sleep(500)
later = per_scheduler.(:active_tasks)
first = for _ <- 1..16, do: (receive do: ({i, s} -> {i, s}))

IO.puts("")
IO.puts("scheduler:              " <> row.(1..System.schedulers_online()))
IO.puts("waiting before:         " <> row.(before))
IO.puts("waiting after spawning: " <> row.(just_after))
IO.puts("half a second later:    " <> row.(later) <> "  (running or waiting)")
IO.puts("")
IO.puts("process:       " <> row.(Enum.map(Enum.sort(first), &elem(&1, 0))))
IO.puts("first ran on:  " <> row.(Enum.map(Enum.sort(first), &elem(&1, 1))))
```

```text
$ elixir spread.exs
parent is on scheduler 1

scheduler:               1  2  3  4  5  6  7  8
waiting before:          1  0  0  0  0  0  0  0
waiting after spawning: 17  0  0  0  0  0  0  0
half a second later:     4  2  2  1  2  2  2  3  (running or waiting)

process:        1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16
first ran on:   1  1  8  7  7  6  5  8  8  8  1  1  1  1  1  1
```

Right after spawning, all sixteen were waiting in scheduler 1's queue, the parent's. (The seventeenth was already there before.) But schedulers 5 through 8 had nothing to do, so they took eight of them before those had even run once. That's the "first ran on" row: processes 3 to 10 first ran somewhere other than scheduler 1. Half a second later, every scheduler had work. Not perfectly even, but nobody wrote any code to spread it out. The exact numbers change from run to run, but the shape doesn't.

## Watch it happen

<!-- The widget goes here: a spawn control, a memory figure from the measurements above, and the schedulers sharing processes out, with stealing and migration. -->

## Sources

- The scripts and their runs: [os-view.exs](os-view.exs), [spawn.exs](spawn.exs), [spread.exs](spread.exs), [pending.mjs](pending.mjs), and [worker-cost.mjs](worker-cost.mjs), run 2026-11-12 on an Apple M1 (8 cores) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1) and Node v25.9.0. The operating system process figures: `for i in {1..1000}; do /usr/bin/true; done` under `time` in zsh (1.43 to 1.44 seconds in three runs), and `vmmap -summary` on a running `sleep 60`, its DIRTY column grouped for the scale bar (the same in two runs; macOS 26.3.1).
- Schedulers running in "separate OS threads", the BEAM using "several OS threads to indirectly execute Erlang processes", and the operating system deciding which cores those threads run on: *The BEAM Book*, [Scheduling](https://blog.stenmans.org/theBeamBook/#_scheduling), [Concurrency, Parallelism, and Preemptive Multitasking](https://blog.stenmans.org/theBeamBook/#_concurrency_parallelism_and_preemptive_multitasking), and [Load Balancing](https://blog.stenmans.org/theBeamBook/#_load_balancing).
- Scheduler, dirty CPU scheduler, and dirty I/O scheduler threads, and their defaults: the [erl command docs](https://www.erlang.org/doc/apps/erts/erl_cmd.html#+S) for `+S`, [`+SDcpu`](https://www.erlang.org/doc/apps/erts/erl_cmd.html#+SDcpu), and [`+SDio`](https://www.erlang.org/doc/apps/erts/erl_cmd.html#+SDio). The default process limit of 1,048,576 and the `+P` flag: [`+P`](https://www.erlang.org/doc/apps/erts/erl_cmd.html#+P).
- The heap including the stack, and a process's memory including "call stack, heap, and internal structures": `heap_size` and `memory` in [`erlang:process_info/2`](https://www.erlang.org/doc/apps/erts/erlang.html#process_info/2).
- What `erl_child_setup` is for: the comment at the top of [erl_child_setup.c](https://github.com/erlang/otp/blob/OTP-28.4.2/erts/emulator/sys/unix/erl_child_setup.c#L23-L51).
- "Conceptually, Erlang processes are similar to most OS processes" and "much more lightweight": *The BEAM Book*, [Erlang](https://blog.stenmans.org/theBeamBook/#_erlang) in the preface. "Erlang processes are not like threads — they have no shared memory to modify" and "Erlang programs do not need locking or protected sections": [Processes](https://blog.stenmans.org/theBeamBook/#_processes). The book doesn't tie that to preemption itself; the paragraph connecting them is my reasoning from it and page 1's sources.
- BEAM processes costing orders of magnitude less than operating system processes and threads, from the designer: "Our language based processes are much lighter-weight than conventional OS processes. Creating a new process in our language is a highly efficient operation, some orders of magnitude faster than process creation in most operating systems, and orders of magnitude faster than thread creation in most programming languages." Joe Armstrong, [*Making reliable distributed systems in the presence of software errors*](https://erlang.org/download/armstrong_thesis_2003.pdf) (2003), page 18, section 2.3.
- 327 words at spawn, a 233-word starting heap kept small for systems with millions of processes, and message data being copied: the Erlang efficiency guide, [Creating an Erlang Process](https://www.erlang.org/doc/system/eff_guide_processes.html#creating-an-erlang-process), [Initial Heap Size](https://www.erlang.org/doc/system/eff_guide_processes.html#initial-heap-size), and [Sending Messages](https://www.erlang.org/doc/system/eff_guide_processes.html#sending-messages). Processes growing and shrinking: the Erlang reference manual, [Processes](https://www.erlang.org/doc/system/ref_man_processes.html#processes).
- Cowboy's process per connection and per request: [Cowboy's guide, Flow diagram](https://github.com/ninenines/cowboy/blob/2.21.0/doc/src/guide/flow_diagram.asciidoc#number-of-processes-per-connection).
- Counting each scheduler's waiting processes (`:run_queue_lengths`) and its running or waiting ones (`:active_tasks`): [`erlang:statistics/1`](https://www.erlang.org/doc/apps/erts/erlang.html#statistics/1).
- A new process going on its parent's run queue: `erl_create_process` in [erl_process.c at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/erts/emulator/beam/erl_process.c#L12527-L12535).
- Stealing and migration, including migration paths worked out every `2000*CONTEXT_REDS` reductions by comparing run queue lengths: *The BEAM Book*, [Task Stealing](https://blog.stenmans.org/theBeamBook/#_task_stealing) and [Migration](https://blog.stenmans.org/theBeamBook/#_migration). `CONTEXT_REDS` is 4,000 (page 1's sources).
