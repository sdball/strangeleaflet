---
title: Maintainable Code
slug: maintainable-code
published_date: 2022-11-15T05:00:00+00:00
tags: programming
publish: true
is_page: false
meta_description: How to write code that is easy to understand and well documented so it is easy to maintain.
---

When we say "maintainable code" what does that mean?

I say that it means code that is easy to change in order to accommodate new
features or dependency updates.

What does it mean for code to be easy to change?

I say code that is easy to change is code that is easy to understand.

What does it mean for code to be easy to understand?

I say code that is easy to understand has fast feedback loops.

And fast feedback loops are where we can differentiate.

In short: if I had to pick one property of maintainable code I would say that
the code has fast feedback loops.

## Fast Feedback Loops

A fast feedback loop can be code that has comprehensive unit tests that run as
fast as unit tests should (hundreds or thousands per second). In this form the
fast feedback loop is mechanical: the tests themselves guide future change and
help ensure correctness. If the tests are well written, comprehensive, and fast
then the production code can be allowed to be opaque with necessary complexity.

A fast feedback loop can be code that has well organized and consistent
abstractions in the production code. That means you won't see high level code
wrapping CSV output right next to code using string manipulation to build HTML
output. In this form the fast feedback loop is mental: you the programmer can
quickly parse and understand the code directly without being guided by tests.

A fast feedback loop can be clearly written and understandable documentation
that guides the programmer through different areas of the codebase. In this
form major responsibilities and considerations of the code are listed directly
along with their past issues, present circumstances, and future warnings. The
fast feedback loop comes from quickly being able to identify areas of the code
that need to change and how to see effects of those changes. In this form the
fast feedback loop can be both mechanical and mental. The documentation may
explain specifics such as how to manually exercise areas of code or may explain
the logic flow clearly enough that a programmer new to the code will be able to
mentally follow along.

### How do you know if you have fast feedback loops?

For mechanical feedback loops consider the amount of time between changing a
line of code and seeing the effects. Consider the complexity of setting up an
environment in which to see code changes reflected in a running system. The
time between changing a line of code and seeing its effects in some way is the
speed of your feedback loops.

For mental feedback loops consider the amount of domain knowledge a programmer
needs to have in order to follow along with the code. Consider the chain of
responsibility when traced from code entry to code exit. Every jump from one
abstraction to another slows down the mental feedback loop of someone tracing
through the code.

If your codebase doesn't have any of the above feedback loops then nothing is
more helpful to future developers than working on bringing one or more of those
feedback loops to your codebase. Documentation, tests, well organized code:
pick all three if you can. Pick at least one if you can't. If you don't know
what to pick then documentation is applicable to any codebase.

## Documentation

### What should you document?

- List every major responsibility of the code
- Describe the lifecycles of the code and its abstractions
  - Does it run indefinitely like a web application with child abstractions
    used during some requests?
  - Does it run for a set unit of work like the `ls` command that runs, lists
    files, and exits?
- List all the files or at least the directories and their responsibilities
- List problematic areas of the code
- List areas of the code with pending improvements
- How do the mechanical feedback loops work? How do you run the tests? How do
  you see effects of code changes?
- What are the collaborators of the codebase? (i.e. what other systems does it rely on and how?)

In short: write down everything you know about the code even going as far as
having every programmer in the code writing their own `docs/name.md` file with
running documentation and commentary

## Architecture

A well architected and organized codebase guides new developers to effective
contributions following clearly established patterns.

If your code changes frequently sprawl over unanticipated files and side
effects then you do not have a maintainable codebase.

If you find several (re)implementations of the same abstraction throughout your
codebase then you essentially have the antithesis of maintainable code.

## Logging, metrics, telemetry

Is the codebase getting faster or slower? Is it using more or less memory?

You cannot effectively maintain code if you don't know what it is doing.
