---
published_date: 2025-09-14T13:09:00+00:00
tags: curated, programming, videos
publish: true
meta_description: The Soul of Erlang and Elixir
feed_id: /programming-videos/
---

<iframe width="560" height="315" src="https://www.youtube.com/embed/JvBT4XBdoUE?si=cy2cFvmYHJ6D9Qko" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

If you only watch one programming video, watch this one.

Don't write Erlang or Elixir? It doesn't matter. You should watch this talk and at least understand the kinds of systems that are possible. This is not a talk trying to sell anything except an understanding of the reliability and failure tolerance guarantees that the BEAM can provide.

Saša Jurić starts with an introduction into the basics of Erlang and Elixir's OTP system and its performance and reliability guarantees. He then dives into a demo system that is running 10000 successful jobs per second as a baseline.

While Elixir by default would run one scheduler per CPU core, Saša limits the demo to a single scheduler to show how Elixir performs and provides concurrency guarantees when it's forced to be a lone single-threaded OS process.

The real cool parts of the talk is exploring the behavior of failure in the system. What if a job generates a runtime error? What if a job takes 100% CPU for a few seconds? What if a job runs forever taking 100% CPU? How does the BEAM continue to provide reliability and availability guarantees?

[The video itself](https://youtu.be/JvBT4XBdoUE)

[Companion code repo](https://github.com/sasa1977/soul_of_erlang_and_elixir)
