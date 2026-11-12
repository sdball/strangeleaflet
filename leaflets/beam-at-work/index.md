---
title: The BEAM at Work
tags: elixir, beam, nodejs
publish: false
meta_description: How the Erlang VM runs Elixir, one page at a time, with the machinery on screen and Node.js beside it for contrast.
---

Most language comparisons are about syntax: Python or Ruby, braces or `end`. Elixir's best ideas aren't in its syntax at all. They're in the BEAM, the virtual machine it shares with Erlang, and they're hard to show in a code sample because they're about what happens while the code runs.

So each page here puts the machinery on screen, in a simulation you can poke at in your browser. No Elixir to install. You'll watch schedulers hand out slices of work, start a few thousand processes, crash one on purpose, and see what Node.js does in the same spot.

If you'd rather start with the language itself, the [Strange Leaflet about Elixir](/leaflets/about-elixir/) covers processes, immutable data, and pattern matching.
