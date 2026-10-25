---
title: A simple language spec isn't a feature when you're building applications
slug: a-simple-language-spec-isnt-a-feature-when-youre-building-applications
published_date: 2020-10-11T04:00:00+00:00
tags: go, programming
publish: true
discoverable: true
is_page: false
meta_description: Go famously has a small, simple language spec. That isn't always a good thing.
---

Go famously gushes about its [simple and readable language specification](https://golang.org/ref/spec). On one hand kudos to Go for having a written specification and kudos for rigorously keeping the language syntax simple.

But on the other, more pragmatic, hand a simple language spec means the language itself has fewer affordances out of the box. Programmers will be left to spin up their own designs for everything else. And, as we see in JavaScript, that's a problem if you want to encourage a shared language community.

Everyone comes up with their own patterns, patterns which may not be obvious even as they are made up of the common components from the language spec.

## A little copying

Go actively encourages this way of programming with the idiom "a little copying is better than a little dependency." Here they are actively avoiding one of the major pitfalls of NodeJS. But at what cost?

## A lot of places

I say the cost is higher than the blithe quote indicates. A little copying from one place leads to an accumulation of a lot of copying from many places. Because the copying isn't named, versioned, or isolated it is peppered throughout the resulting program. And _that_ means if you find a flaw you have many places to fix. And, worse, if someone else finds a flaw you have no idea unless you come across and recognize the improved version of that little copy.

## Go is for systems not applications

Now, to be clear, I don't think this is a flaw for Go's supposed primary purpose: a systems programming language. Systems programming should be short, simple, sharp tools to perform high quality work with a strong performance story. You don't want to burden your systems with huge, complex, dull, and ill-performing tools. Excel is wonderful, Excel is not a systems tool. Excel is an application.

But many programmers out there are building, or trying to build, the equivalent to Excel in Go. To write not sharp tools but large applications in Go because Go has become their hammer and everything is a nail even if it's a skyscraper.
