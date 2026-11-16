# The three strategies. Each supervisor starts a, b, and c, in that order,
# then b crashes. Each child says when it starts and when it's stopped.

Logger.configure(level: :none)

defmodule Child do
  use GenServer

  def start_link(name), do: GenServer.start_link(__MODULE__, name, name: name)

  def init(name) do
    # Trapping exits, so terminate/2 runs when the supervisor stops it
    Process.flag(:trap_exit, true)
    IO.puts("  #{name} started as #{inspect(self())}")
    {:ok, name}
  end

  def handle_cast(:crash, name), do: raise("#{name} crashed")

  def terminate(:shutdown, name), do: IO.puts("  #{name} stopped by the supervisor")
  def terminate(_reason, name), do: IO.puts("  #{name} crashed")
end

children = [
  Supervisor.child_spec({Child, :a}, id: :a),
  Supervisor.child_spec({Child, :b}, id: :b),
  Supervisor.child_spec({Child, :c}, id: :c)
]

for strategy <- [:one_for_one, :one_for_all, :rest_for_one] do
  IO.puts("## #{strategy}")
  {:ok, supervisor} = Supervisor.start_link(children, strategy: strategy)
  IO.puts("b crashes:")
  GenServer.cast(:b, :crash)
  Process.sleep(100)
  IO.puts("stopping the supervisor:")
  Supervisor.stop(supervisor)
  IO.puts("")
end
