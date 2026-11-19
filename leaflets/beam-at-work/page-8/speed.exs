# How long fib(40) takes in Elixir, and as the C NIF from fib_nif.c, three
# times each. (Run nif.exs first: it builds fib_nif.so.)

defmodule Fib do
  @on_load :load
  def load, do: :erlang.load_nif(~c"./fib_nif", 0)
  def fib(_n), do: :erlang.nif_error(:not_loaded)
  def dirty_fib(_n), do: :erlang.nif_error(:not_loaded)
end

defmodule Slow do
  def fib(n) when n < 2, do: n
  def fib(n), do: fib(n - 1) + fib(n - 2)
end

time = fn f ->
  {us, _} = :timer.tc(f)
  "#{div(us, 1000)} ms"
end

for _ <- 1..3 do
  IO.puts("fib(40): Elixir #{time.(fn -> Slow.fib(40) end)}, C NIF #{time.(fn -> Fib.fib(40) end)}, dirty C NIF #{time.(fn -> Fib.dirty_fib(40) end)}")
end
