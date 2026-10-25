---
title: Add more OTP implementation of Speed Daemon - sdball/protohackers
slug: add-more-otp-implementation-of-speed-daemon-new
published_date: 2023-02-12T23:49:00+00:00
tags: elixir, git blog, protohackers
publish: true
---

Thanks again to [@whatyouhide](https://github.com/whatyouhide) for the example code. I added it to this
repo by retyping (and somewhat tweaking) the reference implementation.

I learned a lot of tricks about using kernel functions like `update_in`
and `put_in` to handle updating nested state.

The approach to have the binary protocol functions in their own
module was very nice. I learned some good tricks for more idiomatically
matching binary messages as well.

e.g.

```elixir
<<@dispatcher, roads_count::8, roads::binary-size(roads_count * 2), rest::binary>>
```

vs

```elixir
def client_message(<<@dispatcher, roads_count::8, rest::binary>>) do
  case rest do
    <<roads::binary-size(roads_count * 2), rest::binary>> ->
      Logger.info("SLS.ClientMessage.dispatcher roads=#{inspect(roads)}")
      {:ok, dispatcher: Dispatcher.new(roads), rest: rest}

    _incomplete ->
      :partial
  end
end
```

That is, using `roads_count` to further match within the same binary
pattern instead of having a secondary pattern match like I was doing
originally.

It's always a good idea to consider (and implement!) alternatives
but I do prefer some aspects of my original approach to handling the
generation of tickets from observations.

- A MapSet is a nice way to ensure uniqueness for ticketed plates by
  day.
- I didn't generate any new tickets if a ticket was already generated
  for the given days covered by a new violation.
- I also didn't regenerate all tickets for a given observation's
  road and plate but only checked the observations before and after the
  new observation to potentially generate 0, 1, or 2 new tickets from
  potential violations.

Happily, like for MITM, my existing integration tests for the Speed
Daemon server worked against this new implementation as well. Hooray!

---

This blog post was generated from commit [dd3e8553403083e6b8b83bf53ca3b1b0de76e6fe on sdball/protohackers](https://github.com/sdball/protohackers/commit/dd3e8553403083e6b8b83bf53ca3b1b0de76e6fe)
