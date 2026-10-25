---
title: The Problem of State
slug: the-problem-of-state
published_date: 2021-05-01T04:00:00+00:00
tags: programming
publish: true
is_page: false
meta_description: State is a hard problem to deal with. I say functional languages make it easier to handle because they force you to deal with it deliberately rather than have it happen accidentally.
---

Among all the problems we create for ourselves when programming systems state is perhaps the most troublesome to deal with. Decisions made about the state of the system and its lifecycle with the application have far reaching consequences that can be extrememly difficult to unravel.

Not making deliberate decisions about the lifecycle of state within an application guarantees an application that will inevitably difficult to work on and changes will become slower and slower. At that point you must either live with the slow/difficult to change application, heavily refactor the system to organize the state, or throw out the whole thing and write an entirely new application.

## Pure Functions

First let's talk pure functions. These functions are living the dream! The darlings of unit testing tutorials everywhere.

What's a pure function?

A **pure function** always produces the same output from the same input. A pure function has no side effects. No HTTP requests, no database queries, no looking up the time from the system clock, not even printing text or logging to a file.

```elixir
add = fn(a, b) -> a + b end

add.(2,3) #=> 5
```

```clojure
=>(defn add [a,b] (+ a b))
#'user/add

=>(add 2 3)
5
```

```ruby
def add(a, b)
  a + b
end

add(2,3) #=> 5
```

```javascript
const add = (a, b) => a + b;

add(2, 3); //=> 5
```

Input comes in, output goes out. When you're dealing with pure functions you can definitively, absolutely know everything that function is taking in and that the same arguments will always produce the same output.

You can see why unit testing tutorials absolutely love pure functions. Testing pure functions is almost so easy that it might seem almost unnecessary if you're only concerned with proving correctness.

Of course pure functions can be complex but they will **always** return the same output for the same inputs. Pure functions cannot sneak in extra data from a database query, or from an HTTP call, or refer to some state in memory.

Calculating bowling scores is a relatively famous pure data problem that turns out to be surprisingly complex. You can make the score calculation a large and complex pure function. To make it understandable you'd probably want to break it down into smaller functions. As long as all the functions are pure then the top level coordinating function is considered pure as well (same output, no side effects).

Testing pure functions is a dream because you only need to determine the shape of the input data and then describe how it relates to the output data and confirm that the expectations are met.

When I give the "add" function two numbers the output is the sum of those two numbers. Every time.

When I give the "calculate bowling score" function a game's score card the output is the score of that game. Every time.

## Adding State

When we add state to the mix we suddenly have a lot more power but also more problems. We can write to the database! We can log to a file! And, critically for this discussion, we can hold data in memory.

We can hold the ongoing bowling game in memory and modify the score based on the latest frame e.g. "bowlingGame.recordFrame(3, 7)". We can add more and more numbers to some growing overall number system "numberTotal.plus(2)".

That data in memory is state. And while it does give us flexibility and power it costs more than we may expect.

When we modify a function to have side effects such as reading data that wasn't explicitly given or writing data elsewhere we call it an impure function.

## The Problem of State

State isn't the exclusive source of bugs by any means, but I argue it's the source of the most complex bugs to track down and fix. When you're dealing with state suddenly your function's inputs are not absolutely knowable. And that's a real problem!

We can call something like `bowlingGame.recordFrame(3, 7)` and not know how many frames have already been recorded. That's not good because a bowling game has a fixed number of frames by definition.

What happens to our system if we accidentally record too many frames? Will the extra frames be rejected? Will the score be added beyond the defined limits of a bowling game? Or, insidiously, will the system _seem_ to work for a while until we call the `bowlingGame.printResult()` function and it explodes with exceptions due to the unexpected extra data?

The separation of input from its unexpected side effects makes debugging applications with state so intrinsically difficult. We have to mentally hold not only the function we think we're working on, but also all of the function calls that preceded our call, and all of the effects that those previous calls have had on the state of the system.

Even when we've figured it all out and we know the problematic state if we want to test the problem then we have to further figure out how to stage the bad state in testing. For that "bowlingGame" example we'd need to build a testing setup that adds too many frames and then triggers the buggy behavior of "printResult" and ensure that printResult doesn't explode if there are too many frames.

But later we, or some other ill-fated programmer, followup on that work and realize that `printResult` wasn't the problem. The actual problem was `recordFrame` allowing too many frames! Fix the `recordFrame` code and job done! We could even write tests around the `recordFrame` code to assert the correct behavior.

But then running the entire test suite suddenly has failing tests for "printResult"? How could that be related? We have to dig into those tests (the production code is fine!) and hopefully recognize that it was the testing setup that intentionally adds too many frames in order to test that printResult doesn't explode with exceptions in that state.

Even in this simple contrived example can easily cause those "our test suite is buggy and unreliable" symptoms! We can thank state for that kind of behavior.

If you've ever had to track down a memory leak well that's state that isn't cleaning up after itself. State that's lingering and accumulating after its request has long since completed. More and more requests build up more and more bits of lingering state and the memory utilization chart goes up and to the right over time.

State gives our systems a LOT of flexibility and power. But it's not without cost. When we don't carefully, intentionally manage state it will become a nightmare for future development work. In fact I claim that overgrown state is one of the major anchors that drags down engineering work on an application over time.

State is powerful and any reasonably complex application will need at least some state. But carefully and deliberately handle it. Be explicit about when and how you use it as much as possible.

## Elixir and state

As a quick final note I'll say that Elixir has my favorite approach for handling state. There is no ambient state. When you need to have state within an Elixir application then you have to write a "server" to hold the state and respond to calls to update or return that state. The implementation functions of that server take the state as an argument. I cannot overstate that point enough: that means you can test those functions using the state as pure functions.

But wait, you may say, all the callers have to hold and pass the state to the server? No! The server holds the state. Callers interact with the server using the server API and the server API then calls the implementation functions with the arguments from the API and the current state.

Even better? The implementation functions return the state as part of their returned data! The server API holds the state for itself (to pass to the next call to the server) and passes the explicitly declared return data back to the original caller. That's all assuming the function call was even synchronous in the first place because the server API has explicitly named functions for making asynchronous ("cast") vs synchronous ("call") requests to the server.

# More reading

- [https://medium.com/@jamesjefferyuk/javascript-what-are-pure-functions-4d4d5392d49c](https://medium.com/@jamesjefferyuk/javascript-what-are-pure-functions-4d4d5392d49c)
- [https://medium.com/javascript-scene/master-the-javascript-interview-what-is-a-pure-function-d1c076bec976](https://medium.com/javascript-scene/master-the-javascript-interview-what-is-a-pure-function-d1c076bec976)
- [https://hexdocs.pm/elixir/GenServer.html](https://hexdocs.pm/elixir/GenServer.html)
