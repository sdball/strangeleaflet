---
title: A History Degree Is A Programming Superpower in the Age of AI
slug: a-history-degree-is-a-programming-superpower-in-the-age-of-ai
published_date: 2026-05-06T16:21:00+00:00
publish: true
---

A history degree was always a cheat code for being a high level software engineer, but large language models have turned it into even more of a superpower.

## The original case: programming is mostly narrative

Most people think programming is about writing code. After a few years in the industry, you realize programming is mostly about figuring out what’s going on. A bug report says one thing. The Slack thread says another. The commit history tells a third story. The person who wrote the original system left two years ago, and the design doc was already out of date before the feature even shipped.

Your job, before you write a single line of code, is to reconstruct what happened from incomplete and contradictory evidence. Then you have to tell the story back to your team in a way that lets them act on it.

This is what historians are trained to do. Sift sources of varying reliability. Notice the gap between what someone claimed at the time and what they actually did. Reconcile accounts that disagree. Build a narrative that holds up to scrutiny and lets the reader follow your reasoning back to the evidence. Swap “primary source” for “repo history” and the muscle is identical.

Engineers with humanities backgrounds tend to be unusually good at the messy, ambiguous middle of a project — the part where you’re not yet sure what you’re building or why the existing thing is broken. They’ve been training that exact skill since their first undergraduate seminar.

## What LLMs change

Now add LLMs to the picture. Suddenly, generating plausible-looking code, prose, and explanations is essentially free. The bottleneck shifts. The scarce skill is no longer “can you produce text that compiles or reads well.” It’s “can you tell whether what you’re looking at is actually true.”

This is exactly the part of historical training that doesn’t get talked about much in the “history teaches you to write” pitch. Historians are trained to be suspicious. Where did this claim come from? Who is making it, and what’s their incentive? Is this a primary source or someone summarizing a summary of a summary? Does this document say what people remember it saying, or has the meaning drifted through retelling?

An LLM is, structurally, the worst possible source by these standards. It’s a confident narrator with no citations, no incentives you can audit, and a tendency to smooth over gaps with fluent invention. It is, in historian terms, a chronicler writing centuries after the fact who has heard a lot of stories and can’t always remember which ones were true.

If your instinct when reading any text is “where’s this coming from and how would I verify it,” you are dramatically better equipped to use these tools than someone whose instinct is “this sounds right, ship it.” The historian’s reflex — cross-reference, check the footnote, find the original — is the same reflex that catches a hallucinated API method before it makes it into production.

## Writing things down, but more so

The other classic history-major skill is writing clearly. This was already useful in software, where most of the work product that matters long-term is documentation, design docs, and post-mortems. Code rots. Prose rots more slowly.

LLMs raise the stakes here too, in two directions.

First, the quality of what you get out of these models is downstream of the quality of what you put in. Vague, ambiguous prompts produce vague, ambiguous output.

Engineers who can specify a problem precisely in prose get dramatically better results than engineers who can’t. Writing clear paragraphs describing the system, its constraints, its desired behavior, and its edge cases has a huge payoff.

Prompting is a writing skill that wears a programming costume.

Second, as more code gets generated rather than hand-written, the comments, commit messages, and architecture docs become the actual record of human intent. The code shows what the machine produced. The prose shows what the humans were trying to do. 

Future engineers and future LLMs reading the codebase will rely on that prose far more than they used to. Being a person on the team who writes it well is a compounding advantage.

## Caveats

None of this means a history degree replaces learning to code. You still have to learn to code.

The argument is about which adjacent skills give you leverage on top of that, and how those skills are revalued in a world where generation is cheap and judgment is scarce.

It’s also not really about the degree itself but the habits the degree is supposed to instill. Plenty of CS majors have those habits, and plenty of history majors don’t. The point is that the training is well-matched to what software work actually demands now in a way that wasn’t obvious five years ago and is becoming more obvious every month.

## The advantage

Software engineering has always rewarded people who can extract a clean story from a messy pile of evidence and write it down so others can act on it. LLMs make generating plausible stories trivial, which makes verifying them and writing them more clearly the bottleneck.

That bottleneck is the historian’s expertise.