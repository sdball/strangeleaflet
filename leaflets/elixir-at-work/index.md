---
title: Elixir at Work
tags: elixir, otp, nodejs
publish: false
meta_description: What Elixir programs build on the BEAM, with Node.js beside them for contrast.
---

[The BEAM at Work](/leaflets/beam-at-work/) was about the virtual machine: preemptive schedulers, cheap processes, a heap for each one, messages, and crashes that stay where they happen. This leaflet is about what Elixir programs build from those pieces.

Most of that is OTP, the libraries that come with Erlang, which Elixir wraps in modules of its own: `GenServer` for a process that keeps state and answers requests, and `Supervisor` for one that restarts the processes it started. Some of it is Elixir's own, like `Task`.

If you'd rather start with the language itself, the [Strange Leaflet about Elixir](/leaflets/about-elixir/) covers processes, immutable data, and pattern matching.
