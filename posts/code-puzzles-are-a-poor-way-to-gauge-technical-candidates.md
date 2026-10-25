---
title: Code puzzles are a poor way to gauge technical candidates
slug: code-puzzles-are-a-poor-way-to-gauge-technical-candidates
published_date: 2019-10-24T04:00:00+00:00
tags: interviews, programming
publish: true
discoverable: true
is_page: false
meta_description: Technical interviews aren't great, and they're worse if they actively try and trick the interviewee.
---

The tech industry is a long way from having a common good interview process. There are many problems, but today I'm going to write about one in particular. One that does the most damage to a company's hiring pipeline, the quality of the candidates they select, and to the resulting diversity of their engineering workforce. The Code Puzzle.

# What's a code puzzle?

A code puzzle is some timed unit of toy work that a candidate is expected to do while being evaluated by one or more interviewers. None of that is representative of actual programming work which _should_ immediately be the end of our consideration of code puzzles as a viable approach for gauging future job performance. Why are code puzzles so pervasive?

Think about the problem of hiring good technical candidates. What do they know? Do they know things? Let's find out! Code puzzles can seem like an irresistibly effective approach: see if the candidate can code by having them, well, code! It's foolproof! What could possible be wrong with that?

# What's wrong with code puzzles?

They're terrible.

## Puzzles aren't the job

The actual job of programming is not represented by code puzzles. Coming up with a correct algorithm for solving a toy puzzle might _seem_ like programming work but the similarity is merely superficial. Yes they both involve some typing of code, but actual programming work includes all the effort around the code. It's talking with stakeholders to suss out the actual code that needs (or doesn't need!) to be written. It's planning the shape of the code to fit into the existing application alongside parallel work. It's choosing the right pieces from dozens of related answers on Stack Overflow. It's learning and applying different levels of the tech stack to their greatest effect.

Code puzzles… they're only the code part. Relatively that's the _easy_ part of programming work! It's like choosing a carpenter by their ability to drive nails. Or choosing a doctor by their typing ability. Yes those are important parts of their work but poor representations of the actual job.

## Treating a proxy as the signal

Even if we narrow our vision and assume that coding is all that we care about for a programming hire: code puzzles aren't the job. They are a toy version of the job. That means they are a proxy for the actual work of actual programming. But coding puzzle interviews treat the code puzzle as though it's the actual signal and not the proxy!

Let me explain further. A code puzzle is a representation of programming. It should have some associated rubric to identify the actual signals coming from a good programmer working on the code puzzle. The code puzzle itself shouldn't be the goal but how the code puzzle is approached. But, invariably, interviews with code puzzles treat the puzzle as the only goal that matters. Did the candidate solve the puzzle in the expected way and did they do it fast enough?

## Arbitrary outcomes

Code puzzles may seem like a great way to reduce bias. The candidate either solves the puzzle correctly or they don't. No bias can sneak in right? Wrong.

Consider that "did the solve the puzzle in the expected way" from the previous section. There's a huge amount of wiggle room for bias to sneak in! If an interviewer likes a candidate then they will be more generous with the leeway they grant and more open with leading questions. They will assume the best of the candidate and downplay any shortcomings. Conversely if an interviewer doesn't like a candidate then they will be stricter with their criteria and avoid leading questions. They will assume the worst of the candidate and give greater weight to any shortcomings.

Consider these comments on code quality and how much bias they reveal about the interviewer.

- "candidate asked too many questions"
- "code was unclear"
- "used recursion to solve the problem"
- "did not use recursion to solve the problem"
- "spent too much time on tests"
- "too talkative"

None of those are objective points. They are all signals of bias in the interview process.

## Diversity

Diversity. This is the biggest problem. Diversity is the hiring keyword that all companies say they want, some companies actively word towards, and few companies actually have.

Code puzzles actively select against having a diverse programming workforce. As already stated, code puzzles are not the actual job. Actually doing programming work is _not_ an effective way to practice for code puzzle interview questions. That means if you require good performance on code puzzles you're selecting for people who have had the resources (time, money, equipment) to play with code puzzles. That is emphatically not a diverse pool of candidates.

Women and minorities survive in tech by being better than the majority at the _actual_ job. Which means in their free time they are working hard on leveling up their directly relevant technical skills: not practicing looking for tricks to better jump through the arbitrary hoops of a coding puzzle interview.

# Stop. Step back. Restate criteria.

1. You want to find technical candidates that will perform well at the actual work required.
2. You want some mechanism to predict how a candidate is likely to perform at the actual work required.
3. The mechanism must provide much faster and cheaper feedback than actually hiring them to find out how they perform at the actual work.
4. The mechanism must provide understandable and actionable feedback that is as correct as possible. We could easily come up with mechanisms that meet the first three criteria for a technical interview feedback mechanism that aren't remotely correct.

# What are some alternatives?

There are many better ways to predict future performance in the tech industry!

## Actual work

Actually working with the candidate is, not surprisingly, a very effective way to find out how they might do at actual work. Pair up with them and genuinely attempt to collaborate on a problem. If you only have Super Secret Snowflake Production Code then using a representation of something _like_ your actual code is acceptable. The key is that the pairing interview session is not a challenge/response session. There is no goal that the candidate must meet in order to pass. Rather the one or two (at the most) interviewers and candidate will form a short-lived team to genuinely work on _something_.

"But wait!" you might say, "How can we know if they passed if they don't have some arbitrary and contrived goal?" Great question. You can know that they passed if the interviewers and candidate formed a good team. Did they work well together? Did they have a good time digging into the problem? Did they collaborate and feel like everyone was contributing as a peer?

## Talking

Sitting down with candidates and talking with them about their previous technical work is perhaps the most effective way to find out if they will do well. If they can walk someone through their previous technical work and explain the decisions, tradeoffs, considerations, and ramifications then they are demonstrating a wide range of skills beyond mere coding that are required to be a good programmer.

## Async Coding Exercises

Take home exercises that represent _something_ like the actual work your company needs can be very effective. But many companies are scared to trust that a candidate's take home work is truly their own work. You can assuage that fear by combining take home work with an interview where the candidate walks interviewers through their code for the take home exercise.

An essential component of using coding exercises for interviews is a blind, objective evaluation system. Exercise review should not be an arbitrary "Hey is this good code?" question left up to the reviewer. The criteria for judging the exercise should be developed along with the exercise itself and all points should be objectively measurable. Think "Encapsulated the problem domain in clearly named classes or functions" and not "Wrote clear code".

# Companies that are doing better already

## Hiring Without Whiteboards

It's not all bad out there! This GitHub project is a great list of companies that don't have a broken hiring process.

> The companies and teams listed here use interview techniques and  questions that resemble day-to-day work. For example, pairing on a real  world problem or a paid/unpaid take home exercise.

[Hiring Without Whiteboards](https://github.com/poteto/hiring-without-whiteboards)

## Programming Puzzles Are Not The Answer

If you want more inspiration for your design process, Spreedly put out an excellent post on their approach a few years ago.

[Programming Puzzles Are Not the Answer](https://engineering.spreedly.com/blog/programming-puzzles-are-not-the-answer-how-spreedly-does-work-samples.html)

## Key Values

[Key Values](https://www.keyvalues.com/) allows you to find companies that share your values! Want to find a company with a diverse team, that actively practices inclusion, contributes to open source, has high employee retention, and has remote work? You can do that!
