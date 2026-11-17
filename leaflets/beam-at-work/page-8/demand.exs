# A producer that counts, and a consumer that takes 100 ms over each
# event, asking for at most 10 at a time. Both print what they do, so the
# demand going up and the events coming down show in order.
Mix.install([{:gen_stage, "1.3.2"}])

defmodule Clock do
  def start, do: :persistent_term.put(:t0, System.monotonic_time(:millisecond))
  def now, do: String.pad_leading("#{System.monotonic_time(:millisecond) - :persistent_term.get(:t0)}", 5) <> " ms"
end

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

Clock.start()
{:ok, counter} = GenStage.start_link(Counter, 1)
{:ok, _slow} = GenStage.start_link(Slow, counter)
Process.sleep(2100)
