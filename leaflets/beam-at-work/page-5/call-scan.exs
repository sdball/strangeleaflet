# How long a GenServer.call takes from a process whose mailbox is full of
# messages it doesn't want, as scan.exs did on page 4 for a plain receive.

defmodule Echo do
  use GenServer

  @impl true
  def init(:ok), do: {:ok, nil}

  @impl true
  def handle_call(:ping, _from, state), do: {:reply, :pong, state}
end

{:ok, server} = GenServer.start(Echo, :ok)

for n <- [0, 1_000, 10_000, 100_000] do
  for i <- 1..n//1, do: send(self(), {:other, i})

  # The fastest of 100 calls with that many messages waiting.
  us =
    Enum.min(
      for _ <- 1..100 do
        {us, :pong} = :timer.tc(fn -> GenServer.call(server, :ping) end, :nanosecond)
        us / 1000
      end
    )

  IO.puts("#{String.pad_leading(to_string(n), 6)} other messages waiting: call #{:erlang.float_to_binary(us, decimals: 1)} µs")
  for _ <- 1..n//1, do: receive(do: ({:other, _} -> :ok))
end
