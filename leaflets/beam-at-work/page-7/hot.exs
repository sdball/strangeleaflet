# Three tickers run version 1 of a module. Version 2 is loaded while they
# run, then version 3. A fourth process waits in a receive and never makes a
# fully qualified call, so it never leaves version 1's code.

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

start = System.monotonic_time(:millisecond)
log = fn message ->
  ms = System.monotonic_time(:millisecond) - start
  IO.puts("#{String.pad_leading("#{ms}", 5)} ms  #{message}")
end

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

Process.sleep(100)
