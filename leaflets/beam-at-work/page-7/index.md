---
title: Changing code while it runs
tags: elixir, beam, nodejs
publish: false
meta_description: The BEAM can load a new version of a module into a running system. Processes move to it at their next call, keeping what they hold, and nothing stops. Node starts a new process. And why most Elixir teams restart anyway.
---

Every page so far has been about the BEAM keeping a running system running: through a busy loop, a garbage collection, a crash, a lost connection. This one is about something most systems stop for: new code.

Here are three tickers, each keeping its count in memory, and a fourth process waiting for a message. Deploy a new version of their code, then another, and watch the ticks and the counts.

<new-version>

![The simulation after two deploys, side by side. On the BEAM side, loading the new code into the running system, the longest gap between ticks is none: each ticker's strip has ticks in version 1's colour, then version 2's after the first deploy line, then version 3's after the second, and each count is at 16. The waiter's line, in version 1's colour, ends in red at the second deploy, marked killed: Version 3 removed version 1, and killed the waiter, still in it. On the Node side, starting a new process, the longest gap between ticks is 234 ms: each strip has a gap after each deploy line, the counts are back at 3, and the waiter's line starts again after each one. The old process stopped, then the new one started: a gap, and every count back to 1.](new-version.webp)

*The live version of this needs JavaScript. In it, you can deploy two new versions to the BEAM and to Node side by side, and have Node start the new process before stopping the old one.*

</new-version>

<script type="module" src="new-version.js"></script>

In Node, a new version is a new process. Stop the old one and start the new one, and the ticks stop for a moment and every count starts again from 1, because the counts were in the old process's memory. Start the new one first and the gap shrinks, but the counts still start again. In the BEAM, the new version was loaded into the running system. Each ticker finished the tick it was in, then carried on in the new code, still counting. Deploy a third version, though, and the waiter is killed. The rest of this page is about why, and why most Elixir teams deploy by restarting anyway.

## Two versions of a module

Code in the BEAM is loaded a module at a time, and a module can have two versions loaded at once. Erlang's reference manual: "The code of a module can exist in two variants in a system: _current_ and _old_." Loading a new version makes the current one old and the new one current, and "Both old and current code is valid, and can be evaluated concurrently."

Which one a process runs depends on how it calls. "Fully qualified function calls always refer to current code." A fully qualified call names the module, `Ticker.loop(...)`. A call without one, `loop(...)` from inside the module, stays in whatever version it's already in.

Here are the tickers for real. The module is compiled from a string so the script can load three versions of it, each printing its own version number. Each ticker's loop sleeps 100 ms, prints a tick, and calls itself with `Ticker.loop`, fully qualified, with the count one higher. The waiter sits in a `receive` that nothing ever matches, and if anything did, it would call `wait()`, not `Ticker.wait()` ([hot.exs](hot.exs)):

```elixir
Code.put_compiler_option(:ignore_module_conflict, true)

version = fn v ->
  Code.compile_string("""
  defmodule Ticker do
    def loop(log, name, n) do
      Process.sleep(100)
      log.("\#{name} tick \#{n}, version #{v}")
      Ticker.loop(log, name, n + 1)
    end

    def wait do
      receive do
        :again -> wait()
      end
    end
  end
  """)
end

# ...start, and log, which prints a message with the time since start

version.(1)
log.("loaded version 1")
for name <- ["a", "b", "c"], do: spawn(fn -> Ticker.loop(log, name, 1) end)
{waiter, ref} = spawn_monitor(fn -> Ticker.wait() end)

Process.sleep(350)
version.(2)
log.("loaded version 2; the waiter is in old code: #{:erlang.check_process_code(waiter, Ticker)}")

Process.sleep(350)
version.(3)
log.("loaded version 3")

receive do
  {:DOWN, ^ref, :process, _, reason} -> log.("the waiter is gone: #{inspect(reason)}")
after
  200 -> log.("the waiter is still alive")
end
```

(`ignore_module_conflict` stops Elixir warning that `Ticker` is being redefined, which is the point here.)

```text
$ elixir hot.exs
   30 ms  loaded version 1
  131 ms  a tick 1, version 1
  131 ms  b tick 1, version 1
  131 ms  c tick 1, version 1
  232 ms  a tick 2, version 1
  232 ms  b tick 2, version 1
  232 ms  c tick 2, version 1
  333 ms  a tick 3, version 1
  333 ms  b tick 3, version 1
  333 ms  c tick 3, version 1
  387 ms  loaded version 2; the waiter is in old code: true
  434 ms  a tick 4, version 1
  434 ms  b tick 4, version 1
  434 ms  c tick 4, version 1
  535 ms  a tick 5, version 2
  535 ms  b tick 5, version 2
  535 ms  c tick 5, version 2
  636 ms  a tick 6, version 2
  636 ms  b tick 6, version 2
  636 ms  c tick 6, version 2
  737 ms  a tick 7, version 2
  737 ms  b tick 7, version 2
  737 ms  c tick 7, version 2
  749 ms  loaded version 3
  753 ms  the waiter is gone: :killed
  838 ms  a tick 8, version 2
  838 ms  b tick 8, version 2
  838 ms  c tick 8, version 2
```

Version 2 loaded at 387 ms, while every ticker was in the middle of version 1's `loop`, sleeping. Tick 4 still said version 1: that was version 1's code finishing what it had started. Then each ticker called `Ticker.loop`, which meant version 2 now, and tick 5 said version 2. The ticks kept their 100 ms beat, and the counts went on from 4 to 5. The processes didn't change, only their code. The count survived because it's an argument to the loop, carried from one call to the next, and the new version took it from the old.

The waiter never makes a fully qualified call, so it stayed in version 1. `:erlang.check_process_code(waiter, Ticker)` says so: it's in old code.

## A third version

A module can only have two versions. The manual again: "If a third instance of the module is loaded, the code server removes (purges) the old code and any processes lingering in it is terminated." Version 3 made version 2 old, so version 1 had to go, and the waiter went with it, killed 4 ms later.

The tickers were in version 2 by then, so they survived. Had version 3 come within a tick of version 2, while they were still sleeping in version 1's `loop`, they would have been killed too. (The simulation above does that if you deploy twice quickly.)

So a process that's going to be around for a while has to be written to move: to make a fully qualified call now and then, as the tickers do, so it's never left behind in old code. OTP's processes, like a GenServer, can be sent a system message that "Tells the process to change code", and GenServer has a callback, `code_change`, "Invoked to change the state of the `GenServer` when a different version of a module is loaded". The [`code` module](https://www.erlang.org/doc/apps/kernel/code.html) also has a gentler purge, `:code.soft_purge`, which leaves the old code alone if any process is still in it.

## And in Node?

A Node process can't swap the code it's running. A new version means a new process, and Node's own watch mode, for development, works that way: "When in watch mode, changes in the watched files cause the Node.js process to restart."

Here are the three tickers in Node, one process with all three counts in its memory, and a parent that replaces it with version 2, two ways: stop version 1 and then start version 2, or start version 2, wait until it's up, and then stop version 1 ([restart.mjs](restart.mjs)):

```javascript
if (process.argv[2] === "child") {
  // The ticker: three counters in this process's memory
  const version = process.argv[3];
  const counts = { a: 0, b: 0, c: 0 };
  console.log("up");
  setInterval(() => {
    for (const name of Object.keys(counts)) {
      counts[name] += 1;
      console.log(`${name} tick ${counts[name]}, version ${version}`);
    }
  }, 100);
} else {
  // ...run(version) starts a child, logs its output with the time, and
  // resolves once the child prints "up"
  log(`node ${process.version}, mode: ${mode}`);
  const one = await run("1");
  await new Promise((resolve) => setTimeout(resolve, 350));
  if (mode === "restart") {
    one.kill();
    log("stopped version 1");
    await run("2");
  } else {
    await run("2");
    one.kill();
    log("stopped version 1");
  }
  setTimeout(() => process.exit(), 350);
}
```

Only `a`'s ticks are logged; `b` and `c` tick with it:

```text
$ node restart.mjs restart; node restart.mjs overlap
    0 ms  node v25.9.0, mode: restart
   39 ms  version 1 is up
  139 ms  a tick 1, version 1
  241 ms  a tick 2, version 1
  341 ms  a tick 3, version 1
  390 ms  stopped version 1
  426 ms  version 2 is up
  528 ms  a tick 1, version 2
  629 ms  a tick 2, version 2
  730 ms  a tick 3, version 2
    0 ms  node v25.9.0, mode: overlap
   38 ms  version 1 is up
  140 ms  a tick 1, version 1
  241 ms  a tick 2, version 1
  343 ms  a tick 3, version 1
  445 ms  a tick 4, version 1
  462 ms  version 2 is up
  462 ms  stopped version 1
  564 ms  a tick 1, version 2
  666 ms  a tick 2, version 2
  766 ms  a tick 3, version 2
```

Stopping first left 187 ms between version 1's last tick and version 2's first, where the beat is 100. Starting version 2 first got that down to 119. Either way the count started again at 1, because the count was in version 1's process, and that process is gone. Anything a Node program wants to keep across a deploy has to live outside it: in a database, a cache server, a file.

That's not peculiar to Node. Elixir's own docs name the usual ways to deploy, blue/green, canary, and rolling deployments, and each of them starts new processes with the new code rather than changing the code of running ones. Which brings us to the BEAM's catch.

## Tradeoffs

Elixir's own release tool doesn't do hot upgrades, and its docs say why: "Erlang and Elixir are sometimes known for the capability of upgrading a node that is running in production without shutting down that node. However, this feature is not supported out of the box by Elixir releases." Then: "they are very complicated to perform in practice, as they require careful coding of your processes and applications as well as extensive testing. Given most teams can use other techniques that are language agnostic to upgrade their systems, such as Blue/Green deployments, Canary deployments, Rolling deployments, and others, hot upgrades are rarely a viable option."

The tickers here were easy: their state is a number, and versions 2 and 3 used it the same way. The docs' example is a counter whose new version keeps its state as a pair instead of a number. Loaded as is, the new code would crash on the old state, and the old kind of message might still be waiting in the mailbox, so the new code has to handle both. Doing it properly takes a `code_change` callback for each process whose state changes, a recipe for each application that changed (an `.appup` file) "telling exactly how the application changed between versions", and, in the docs' words, "extensive testing".

What's always there, though, is the mechanism this page used: load a module into a running node. The `code` module's docs give the example of loading one "on a remote node in a distributed system", and with distribution, that's a fix you can put into a running system without restarting it, carefully.

## Sources

- The scripts and their runs: [hot.exs](hot.exs) and [restart.mjs](restart.mjs), run 2026-11-19 on an Apple M1 (8 cores) with Elixir 1.19.5 on Erlang/OTP 28.4.2 (erts 16.3.1) and Node v25.9.0. Each ran more than once: hot.exs's second run had the same shape (the waiter killed 5 ms after version 3), and restart.mjs left gaps of 187 and 218 ms stopping first and 119 and 120 starting first.
- Code replacement, the current and old versions, fully qualified calls referring to current code, a third version purging the old and terminating processes lingering in it, and switching by a fully qualified call: the Erlang reference manual, [Compilation and Code Loading, Code Replacement](https://www.erlang.org/doc/system/code_loading.html#code-replacement), at OTP-28.4.2.
- `code:purge/1` killing processes that "still linger in the old code" before removing it, `code:soft_purge/1` purging "only if no processes linger in it", and loading a module "on a remote node in a distributed system": the [`code` module](https://www.erlang.org/doc/apps/kernel/code.html) ([code.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/kernel/src/code.erl)). Whether a process is in old code: [`erlang:check_process_code/2`](https://www.erlang.org/doc/apps/erts/erlang.html#check_process_code/2).
- Elixir loading a compiled module with `code:load_binary`: `elixir_module.erl` at [v1.19.5](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/elixir/src/elixir_module.erl#L232). `ignore_module_conflict`: [Code.put_compiler_option/2](https://hexdocs.pm/elixir/1.19.5/Code.html#put_compiler_option/2).
- Hot code upgrades not supported out of the box by Elixir releases, why, the counter example, `code_change`, and `.appup` files: Mix's [release docs, Hot Code Upgrades](https://hexdocs.pm/mix/1.19.5/Mix.Tasks.Release.html#module-hot-code-upgrades) ([release.ex at v1.19.5](https://github.com/elixir-lang/elixir/blob/v1.19.5/lib/mix/lib/mix/tasks/release.ex#L897-L1025)).
- A system message that "Tells the process to change code": [`sys:change_code/4`](https://www.erlang.org/doc/apps/stdlib/sys.html#change_code/4) ([sys.erl at OTP-28.4.2](https://github.com/erlang/otp/blob/OTP-28.4.2/lib/stdlib/src/sys.erl#L528-L535)). GenServer's `code_change`: [GenServer docs](https://hexdocs.pm/elixir/1.19.5/GenServer.html#c:code_change/3).
- Node's watch mode restarting the process: [`--watch`](https://nodejs.org/api/cli.html#--watch) in Node's command line docs (v25.9.0).
