---
alias: strange-leaflet-about-elixir-page-5
published_date: 2022-06-21T04:00:00+00:00
tags: elixir, livebook
publish: true
meta_description: Immutable data and why it's awesome
---

If you like there's a [Livebook version of this post](https://livebook.dev/run?url=https%3A%2F%2Fgithub.com%2Fsdball%2Flivebooks%2Fblob%2Fmain%2Fbooks%2Fstrange-leaflet-about-elixir%2Fpage5.livemd) where you can actually run code and follow along. This was written to be a Livebook first, but works well enough as a post too.

## Immutable data?

Ok Stephen, you might say, Elixir sounds really great and all but I heard it has immutable data and that doesn't make any sense to me.

Yeah hypothetical reader, it's a weird idea at first. Immutable data? How does that even work and how could it be useful?

Well first let me clear things up. You can _conceptually_ have mutable data. Of course you can. That's how systems work and change over time! The key is that data values cannot, CANNOT, be changed directly. You can be forever assured that at no point will any of your collaborators reach into your data and change something. It is flatly impossible. Impassable. It is not possible to pass.

You can have code that _looks_ like it mutates state, but I assure you no data values are ever mutated.

Elixir has one way to change data: reassign the label attached to the data. The **data** is still unchanged, but the label (i.e. the variable name) can be pointed at new data.

```elixir
iex> x = 6
6

iex> x + 7
13
```

That code outputs 13 so it might seem like the value of x is changed. But it is not. `x` is still 6. All we did is add 7 to x and the result of that calculation went nowhere.

```elixir
iex> x
6
```

If we want the variable name "x" to point to the new result, then we will have to explicitly reassign it.

```elixir
iex> x = x + 7
13
```

```elixir
iex> x
13
```

This is probably not too surprising, even for programmers who are used to mutable data.

I find that doing module level transforms is a bit more surprising to many devs. But the mechanics are the same. Functions in Elixir may output new data. But no function in Elixir can change the underlying values of any data ever. Changes are only permanent if they are explicitly assigned.

```elixir
iex> string = "hello"
"hello"

iex> String.upcase(string)
"HELLO"

iex> string
"hello"
```

List operations are perhaps even more surprising. But again the mechanics are the same. You cannot change a list unless you explicitly assign the change.

```elixir
iex> list = [1, 2, 3]
[1, 2, 3]

iex> Enum.map(list, &(&1 + 1))
[2, 3, 4]

iex> list
[1, 2, 3]
```

You also can be absolutely 100% guaranteed to be safe from functions mutating the data you pass into them. This is a critical bit. Elixir functions **cannot** permanently modify the data they are given.

Of course a function can internally change and reassign the data, sure why not? But the actual data given to the function is completely safe from alterations. Whatever the function may do, our data is not going to be changed.

```elixir
defmodule DataChanger do
  def change(value) when is_map(value) do
    value = Map.put(value, :lord, "melon")
    IO.puts("Mwahaha! I have changed the value I was given! #{inspect(value)}")
    value
  end
end
```

```elixir
iex> my_map = %{critical: "data"}
```

```elixir
iex> DataChanger.change(my_map)
Mwahaha! I have changed the value I was given! %{critical: "data", lord: "melon"}
%{critical: "data", lord: "melon"}
```

The output sure looks scary oh no! Did our data change?

```elixir
iex> my_map
%{critical: "data"}
```

No of course not. The function can do whatever it does and return whatever it wants. But unless we choose to assign the resulting value then our data is not mutated.

Even if we directly call destructive looking `Map` functions our data is safe **unless we reassign it**.

```elixir
iex> Map.delete(my_map, :critical)
%{}

iex> my_map
%{critical: "data"}
```

## The heart of immutable data

That's really the core of what immutable data means. Data that does not mutate unless you explicitly take some action to allow new data to take the place of old data.

## But I want to mutate data

Sure, we all do. State is a real thing that really needs to change at real times.

The choice Elixir makes is to ensure state only changes when you the developer explicitly decide it changes. State simply cannot change in any way all higgilty-piggilty around the system. But **you** can choose to start a process that holds a state and when that process updates its state.

That process you start to hold state can send responses to messages like "what is your state right now?" That process you start to hold state can replace (NOT mutate) its internal state in response to a message.

How does that work?

Messages!

Let's say we have a super simple process that simply holds a value.

Let's say you want to ask for the current value.

1. Send a message `:get_value`
2. The process receives the message and knows how to answer `:get_value`
3. The process has its current value in memory
4. The process sends a return message with the value

Let's say you want to update the current value.

1. Send a message `:update_value, 8` (where 8 is the new value)
2. The process again receives the message and knows how to answer `:update_value, value`
3. The process REPLACES its current value with the new value
4. The process sends an `:ok` message back

Let's see this idea in action. Elixir provides an **Agent** module as part of its standard library for exactly this kind of behavior. And **GenServer** (generic server) if we need more than the basics.

```elixir
iex> {:ok, agent} = Agent.start_link(fn -> [] end)
{:ok, #PID<0.126.0>}
```

If all goes well, the `Agent.start_link/1` function returns `:ok` and an Elixir process ID (pid). We just started a new process! That process has `[]` as its initial state and it's now an active, living, working memory of the society of our application. We have a collaborator! It's linked to our process and everything.

```elixir
iex> agent_link = Process.info(agent) |> Keyword.get(:links) |> Enum.at(0)
#PID<0.105.0>

iex> agent_link == self()
true
```

Let's see what it's doing right now.

```elixir
iex> Process.info(agent) |> Keyword.get(:current_function)
{:gen_server, :loop, 7}
```

Yeah remember how I said Elixir provides **Agent** for the basics and **GenServer** for more complex cases a few sentences ago? Well Agent is really a GenServer under the hood, it's just doing a lot of default boilerplate for us.

Let's give it some new data.

```elixir
Agent.update(agent, fn state ->
  # push 3 onto the state list
  [3 | state]
end)
```

Hold on! You may say. `[3 | state]` SURE LOOKS LIKE MUTATION!

Well it might. But it isn't. `[3 | state]` does indeed push `3` into the list. But it does not mutate the list: it returns the updated list.

In this code block note how `list` does not change after we push `3` onto it.

```elixir
iex> list = []
[]

iex> [3 | list]
[3]

iex> list
[]
```

Agent uses the return value of our `update` function to assign a new internal state. Overwriting the previous state, not updating it.

```elixir
Agent.get(agent, fn state ->
  state
end)

# => [3]
```

```elixir
iex> Agent.stop(agent)
:ok
```

I hope you've enjoyed this small sojourn into the world of immutable data. How about next time we dive back into Agents and GenServer itself? The state abstraction so nice it's survived for decades now and what enables everything from telephone calls to WhatsApp.
