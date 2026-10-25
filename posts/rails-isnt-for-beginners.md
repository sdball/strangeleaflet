---
title: Rails isn't for beginners
slug: rails-isnt-for-beginners
published_date: 2012-04-03T04:00:00+00:00
tags: rails
publish: true
meta_description: Rails was never meant to simply be a beginner's introduction to web programming.
---

There's been some talk online about how Rails is losing its focus on beginners or that it's getting too complex for its own good. I have a different take: Rails was never written for beginners.

Let's go through a bit of Rails history and philosophy.

Rails was written to be a set of opinions that alleviate the pain of working on web applications and allow us to write them in Ruby. Check out DHH's announcement of Rails from way back in 2004.

> After almost a year of incognito development, I've released Rails in its entirety. It's aimed as a step up for PHP programmers and a release of pain for the Java/C# crowd. Oh, and it's all done in Ruby.
>
> — DHH [Ruby on Rails: Fully stacked web-app framework](http://www.artima.com/weblogs/viewpost.jsp?thread=62974)

Think back to 2001 web applications. Whether you used Java, mod\*perl, or PHP you had to make a **ton** of decisions about your applications before you even started them. Where do the stylesheets live? Where do the backend pieces live? Do you even separate the business logic from the presentation layer? Which JavaScript framework should you use, if any? Should you use an HTML template language? Which one? How should you talk to a database? How should you develop your web application? Where and how should you attach testing and what should you test?

With Rails, you get decisions made for every one of those questions. That's what it's for. Rails wasn't created to make things so easy even an absolute beginner could code it. It was created to make lots of decisions out of the box so you could get to the fun part of building web applications right away. That's the meaning of "convention over configuration". Even better, none of the conventions are set in stone.

Don't like ERB? Ok, use HAML. (Although ERB is awesome.)

Don't like jQuery? Sure use … something else.

Don't like test unit? Sure use RSpec.

jQuery became the default in Rails 3.1 (replacing prototype) and that highlights one of the best things about Rails: the conventions will always be a guide to good practices. I, for one, didn't really even have CoffeeScript on my radar until I saw it become the default in Rails. That made me actually sit up and pay attention to the language, and I'm glad I did.

To get a bit poetic: Rails is a well-travelled path through the scary woods of web development. "But wait, Stephen.", you might say, "A path through the woods sounds an awful lot like Rails is helping out beginners." Well you'd be technically correct (the best kind of correct). By helping out everyone who wants to program a web application Rails is helping out beginners. But Rails isn't _for_ beginners. Rails is the path not the destination.

Learning to program is all about learning mental abstractions. A beginner will have no conceptualization of what a web application can or should do. Where an experienced web programmer from any language will hear requirements and immediately (and almost unconsciously) start building up a mental model of the problem domain, the beginner will still be struggling with how the system itself works. That will be true in any web development framework, because there's simply no way for any framework to think through the problem for you.

Rails isn't a hayride. You, the web programmer, are still required to make many decisions about your web application. The great, awesome thing about Rails is that you get to skip right to the fun decisions and the actual programming.
