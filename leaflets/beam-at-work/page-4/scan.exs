# Fill a process's mailbox with messages it won't match, then time a
# receive that has to look past all of them. Then the same with a fresh
# reference, which lets the BEAM skip every message that was already there.
defmodule Scan do
  # The reply goes in after everything else, so receive looks at every message first
  def plain do
    send(self(), {:reply, :ok})
    receive do
      {:reply, answer} -> answer
    end
  end

  # Only messages that arrived after make_ref can contain the reference,
  # so receive starts looking from there
  def with_ref do
    ref = make_ref()
    send(self(), {ref, :ok})
    receive do
      {^ref, answer} -> answer
    end
  end
end

time = fn f ->
  {us, _} = :timer.tc(fn -> for _ <- 1..100, do: f.() end)
  us / 100
end

for n <- [0, 1_000, 10_000, 100_000] do
  for i <- 1..n//1, do: send(self(), {:other, i})
  IO.puts(
    "#{String.pad_leading("#{n}", 6)} other messages waiting:" <>
      " receive #{:erlang.float_to_binary(time.(&Scan.plain/0), decimals: 1)} µs," <>
      " with a reference #{:erlang.float_to_binary(time.(&Scan.with_ref/0), decimals: 1)} µs"
  )
  for _ <- 1..n//1, do: receive(do: ({:other, _} -> :ok))
end
