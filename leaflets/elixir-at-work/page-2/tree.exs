# A supervisor of supervisors. The top supervisor starts a counter and a
# second supervisor, which starts x and y. Then x crashes four times in quick
# succession: too many for its supervisor, which gives up, and the top
# supervisor restarts it.

Logger.configure(level: :none)

defmodule Child do
  use GenServer

  def start_link(name), do: GenServer.start_link(__MODULE__, name, name: name)

  def init(name) do
    IO.puts("  #{name} started as #{inspect(self())}")
    {:ok, name}
  end

  def handle_cast(:crash, name), do: raise("#{name} crashed")
end

defmodule Pair do
  use Supervisor

  def start_link(_), do: Supervisor.start_link(__MODULE__, nil, name: Pair)

  def init(nil) do
    IO.puts("  Pair started as #{inspect(self())}")
    children = [
      Supervisor.child_spec({Child, :x}, id: :x),
      Supervisor.child_spec({Child, :y}, id: :y)
    ]
    Supervisor.init(children, strategy: :one_for_one)
  end
end

children = [
  Supervisor.child_spec({Child, :counter}, id: :counter),
  Pair
]

{:ok, _top} = Supervisor.start_link(children, strategy: :one_for_one)

for n <- 1..4 do
  Process.sleep(100)
  IO.puts("x crashes (#{n}):")
  GenServer.cast(:x, :crash)
end

Process.sleep(100)
IO.puts("after:")
for name <- [:counter, Pair, :x, :y] do
  IO.puts("  #{inspect(name)} is #{inspect(Process.whereis(name))}")
end
