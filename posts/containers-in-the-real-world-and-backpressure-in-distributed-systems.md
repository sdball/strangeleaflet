---
title: Containers in the real world and backpressure in distributed systems
slug: containers-in-the-real-world-and-backpressure-in-distributed-systems
published_date: 2021-10-27T04:00:00+00:00
tags: systems architecture
publish: true
meta_description: A real world example of backpressure and unintended ramifications.
---

Did you ever think that a city's zoning laws could potentially affect the entire global economy? This fascinating Twitter thread goes into details about container shipping and how container stacking limits can prevent an entire port from operating.

https://twitter.com/typesfast/status/1451543776992845834 [xcancel link](https://xcancel.com/typesfast/status/1451543776992845834)

If you've ever worked with distributed systems you probably recognize this breakdown as very similar to what happens when a system is overloaded without any capacity to apply **backpressure**.

If you don't recognize this as a problem that can develop in distributed systems then Ted Kaminski has an excellent post on exactly that! [Backpressure at tedinski.com](https://www.tedinski.com/2019/03/05/backpressure.html)
