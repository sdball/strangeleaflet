# Three processes count, once every 100 ms. One of them crashes. The others
# carry on, and nothing tells them.

defmodule Counter do
  def start(name, crash_at), do: spawn(fn -> count(name, crash_at, 1) end)

  defp count(name, crash_at, n) do
    Process.sleep(100)
    if n == crash_at, do: raise("#{name} crashed at #{n}")
    IO.puts("#{name}: #{n}")
    count(name, crash_at, n + 1)
  end
end

a = Counter.start("a", nil)
b = Counter.start("b", 3)
c = Counter.start("c", nil)

Process.sleep(550)
IO.puts("a alive? #{Process.alive?(a)}, b alive? #{Process.alive?(b)}, c alive? #{Process.alive?(c)}")
