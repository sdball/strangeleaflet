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
