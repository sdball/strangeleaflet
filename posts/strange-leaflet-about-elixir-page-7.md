---
title: Strange Leaflet about Elixir - Page 7
slug: strange-leaflet-about-elixir-page-7
published_date: 2022-06-28T04:00:00+00:00
tags: elixir, livebook
publish: true
discoverable: true
is_page: false
meta_description: Elixir pattern matching is awesome.
---

« [back to page 6](/strange-leaflet-about-elixir-page-6) || [turn to page 8](/strange-leaflet-about-elixir-page-8) »

There's a [Livebook version of this post](https://livebook.dev/run?url=https%3A%2F%2Fgithub.com%2Fsdball%2Flivebooks%2Fblob%2Fmain%2Fbooks%2Fstrange-leaflet-about-elixir%2Fpage7.livemd) where you can actually run code and follow along directly.

## Pattern matching is civilization

You may have noticed some odd code in the previous pages if you aren't used to Elixir. Like that `PasswordSystem` that looked like this

```elixir
defmodule PasswordSystem do
  def check("my voice is my passport") do
    {:ok, :access_granted}
  end

  def check(_password) do
    Process.sleep(3000)
    {:error, :access_denied}
  end
end
```

What's up with those TWO definitions of the same function?

Well I'll tell ya. Pattern matching!

## Pattern matching function arguments

Elixir allows functions of the same name and arity (number of arguments) to overlap with different patterns to match. You can match on literal values or guard clauses such as `is_map` or `is_list` or conditional guards such as `> 0`

The functions can be declared in any order, but match from top to bottom.

If you declare functions that compete with each other such as two functions with the same pattern or a specific function following a general function then the Elixir compiler will rightfully complain.

```elixir
defmodule Patterns do
  def echo(arg) do
    IO.puts("I don't know what kind of argument that is but I got #{inspect(arg)}")
  end

  def echo(_arg) do
    IO.puts("I don't know what that is")
  end
end
```

```text
warning: this clause for echo/1 cannot match because a previous clause at line 2 always matches
```

```elixir
Patterns.echo(123)
```

```text
I don't know what kind of argument that is but I got 123
```

In this example we have a more specific function (matching the argument `123`) following a general function that ignores any argument.

```elixir
defmodule Patterns do
  def echo(arg) do
    IO.puts("I don't know what kind of argument that is but I got #{inspect(arg)}")
  end

  def echo(123) do
    IO.puts("I don't know what that is")
  end
end
```

```text
warning: this clause for echo/1 cannot match because a previous clause at line 2 always matches
```

```elixir
Patterns.echo(123)
```

```text
I don't know what kind of argument that is but I got 123
```

Here we go, declaring the more specific function BEFORE the more general function.

```elixir
defmodule Patterns do
  def echo(123) do
    IO.puts("Oh I know for certain that is 123")
  end

  def echo(arg) do
    IO.puts("I don't know what kind of argument that is but I got #{inspect(arg)}")
  end
end
```

```elixir
Patterns.echo(123)
# => Oh I know for certain that is 123

Patterns.echo("123")
# => I don't know what kind of argument that is but I got "123"
```

Let's match a bunch of things, that should help convey the idea.

```elixir
defmodule Patterns do
  def echo(123) do
    IO.puts("Oh I know for certain that's the Integer 123")
  end

  def echo(arg) when is_number(arg) and arg < 0 do
    IO.puts("Oh I know that #{inspect(arg)} is definitely a negative number")
  end

  def echo(arg) when is_number(arg) and arg > 0 do
    IO.puts("Oh I know that #{inspect(arg)} is definitely a positive number")
  end

  def echo(0) do
    IO.puts("Oh I know for certain that's the Integer 0")
  end

  def echo(arg) when is_list(arg) do
    IO.puts("Oh I know that #{inspect(arg)} is definitely a list")
  end

  def echo(arg) when is_map(arg) do
    IO.puts("Oh I know that #{inspect(arg)} is definitely a map")
  end

  def echo(arg) do
    IO.puts("I don't know what kind of argument that is but I got #{inspect(arg)}")
  end
end
```

```elixir
Patterns.echo([1, 2, 3])
# => Oh I know that [1, 2, 3] is definitely a list

Patterns.echo(%{a: 1, b: 2})
# => Oh I know that %{a: 1, b: 2} is definitely a map

Patterns.echo(-10)
# => Oh I know that -10 is definitely a negative number

Patterns.echo(0)
# => Oh I know for certain that's the Integer 0

Patterns.echo(10)
# => Oh I know that 10 is definitely a positive number

Patterns.echo(123)
# => Oh I know for certain that's the Integer 123

Patterns.echo("some string")
# => I don't know what kind of argument that is but I got "some string"
```

A great thing about pattern matching functions is that you can write clear, specific functions for a specific type or value of argument. You can avoid littering `if` checks around your code: you can write exactly what you need for exactly those arguments!

## Pattern matching return values

Pattern matching isn't only for function arguments. You can also use it to match returned values!

```elixir
defmodule Scanner do
  def scan(:gold) do
    {:ok, :gold}
  end

  def scan(:silver) do
    {:ok, :silver}
  end

  def scan(_element) do
    {:error, :unknown}
  end
end
```

That means you can use it to guarantee that your code is proceeding with a specific assertion. (Because otherwise the line of execution has already blown up.)

```elixir
element = :gold

{:ok, :gold} = Scanner.scan(element)

IO.puts("at this point we know the scanner scanned :gold")
```

```elixir
element = :copper

{:ok, :gold} = Scanner.scan(element)
# => ** (MatchError) no match of right hand side value: {:error, :unknown}
```

Another common use is the `case` statement to handle various kinds of return values.

```elixir
element = Enum.random([:copper, :silver, :gold])

case Scanner.scan(element) do
  {:ok, detected} ->
    IO.puts("The scan found a known element: #{detected}")
    detected

  {:error, _} ->
    IO.puts("unknown result")
    :unknown
end
```

## Pattern matching messages

Pattern matching messages is simply pattern matching function arguments, but the way Elixir's messages and pattern matching fit together is such an elegant design that it's nice to call out.

When writing a GenServer or other interface for processes to communicate with messages you can write short, specific functions of each callback to handle exactly the message they're meant to handle. No need to have a huge `case` statement or defensive coding. You write what you need and no more. Freedom!

In the following GenServer callbacks remember that the FIRST argument is the message being sent.

For example

```elixir
def handle_call(:increment, from, state) do
                ^^^^^^^^^^__________________ message
                            ^^^^____________ sender
                                  ^^^^^_____ current GenServer state
```

```elixir
defmodule GameServer do
  use GenServer

  def init(_arg) do
    {:ok, %{score: 0}}
  end

  def handle_call(:increment, from, state) do
    handle_call({:plus, 1}, from, state)
  end

  def handle_call({:plus, n}, _from, state = %{score: score}) do
    new_score = score + n
    {:reply, new_score, %{state | score: new_score}}
  end

  def handle_call(:score, _from, state = %{score: score}) do
    {:reply, "the current score is #{score}", state}
  end

  def handle_call(:reset, _from, state) do
    {:reply, 0, %{state | score: 0}}
  end
end
```

```elixir
{:ok, genserver} = GenServer.start_link(GameServer, [])

GenServer.call(genserver, :increment)
|> IO.inspect() # => 1

GenServer.call(genserver, :increment)
|> IO.inspect() # => 2

GenServer.call(genserver, :increment)
|> IO.inspect() # => 3

GenServer.call(genserver, {:plus, 7})
|> IO.inspect() # => 10

GenServer.call(genserver, :score)
|> IO.inspect() # => "the current score is 10"

GenServer.call(genserver, :reset)
|> IO.inspect() # => 0

GenServer.call(genserver, :score)
|> IO.inspect() # => "the current score is 0"

GenServer.stop(genserver)
```

Wonderful!

« [back to page 6](/strange-leaflet-about-elixir-page-6) || [turn to page 8](/strange-leaflet-about-elixir-page-8) »
