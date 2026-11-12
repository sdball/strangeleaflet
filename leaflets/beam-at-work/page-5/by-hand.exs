# A server written by hand: a process that loops, holding how many tickets
# are left, and answers each request with a reply tagged with a reference.

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
