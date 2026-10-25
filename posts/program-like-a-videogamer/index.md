---
title: Program Like a Videogamer
slug: program-like-a-videogamer
published_date: 2013-02-06T05:00:00+00:00
tags: programming
publish: true
meta_description: Feedback loops are the foundation of learning videogames and learning to program
---

![Videogames are cool](videogame.webp)

I see a lot of you out there worried about the next step in your programming career. Or even worried about the next step when learning a new framework or language. Today let me try to assuage some of that fear by describing my approach.

# What button is jump?

Programming is an amazing job. It can also be extremely stressful. There are few industries that move as quickly and completely as programming, especially web programming. Were you using Rails five years ago, ten years ago, fifteen years ago? Five years ago Ruby web devs still had to choose between merb and Rails 2. Ten years ago Rails wasn't even publicly available. Fifteen years ago and I don't think it was even a glint in DHH's eye: we were all coding Java and mod_perl in caves and wielding blunt objects.

The pace isn't slowing down. Rails 4 will be out soon, and there are plenty of other frameworks that you could be keeping up with to mine for implementation ideas if nothing else. Thanks to the advent of mobile platforms there are now _more_ browsers to target, not less.

Even within the Rails framework there's a lot to keep up with. The latest in cutting edge domain modeling. Two Rails stacks, using plain old Ruby objects, the service layer, testing testing testing.

To both experienced and new programmers it's hard to even know where to begin. Programming news can be a source of stress and anxiety. That's no fun. I want you to have fun, so here's what works for me. Let's start at the beginning: how I learn.

# Embrace failure as a means to learn

Videogamers embrace failure as a requirement for progress. No matter how easy the videogame is you will fail at some point before you reach the end. In a videogame, failure is the primary mechanism for learning. Learning how a game "works" and what it expects. The same method can be used to learn a new programming language, framework, or technique.

When there's a new technique I want to try, or a new gem I saw on Railscasts, or I want to explore a programming idea I heard I'll just create a blank directory. Usually I won't even give it a proper name, because naming is hard. Then I make it my mission to write bad code. I don't just ignore or disregard mistakes, I set out with the goal to _make_ mistakes. Once I've done it all wrong, then I can spiral in towards actually understanding what's going on.

Want to know Rails? Break it. Break it to pieces. Delete all of application.rb and see what happens. Create controllers that pull data from files instead of databases. Create views that initialize variables and contain huge swaths of business logic. Create models that contruct HTML and JavaScript. Tie it all together with duct tape and CoffeeScript. Test nothing, test everything. Build models that only contain one field. Build a model that houses every piece of data your application could possibly need.

I find that if I think too much about how to best approach even a simple learning experiment I'll start overanalyzing every little thing: will this directory/application name make sense in six months? Am I coding X in the best possible way? etc. This is a trap!

![Admiral Ackbar: He knows when something is a trap.](ackbar.webp)

It's a trap in that you'll waste _all_ of your time worrying about never making a mistake instead of actually learning something useful. We programmers have an interesting and amazing field. We are a lot of very smart people arguing very heatedly about how to best make our jobs easier. This is awesome. But it can also be intimidating. Oh no! You're using factory_girl, that's so passé! Don't worry about it.

Think about a fighting game. Street Fighter II, Mortal Kombat, Soul Calibur, whatever. Is there one character that's _correct_? Well, yes and the answer is Chun Li. But any of the characters have viable playing strategies.

Many heated arguments about languages, frameworks, and/or process fail to recognize that. They had a bad time trying to play as Voldo for a startup this one time and so they've come away from that with the certain knowledge that Voldo sucks and no one should ever play as him/her/it whatever. The same goes for minitest/rspec or delayed job/resque/beanstalkd. All of these tools were written to scratch a specific itch. If you don't like one, then that doesn't mean that no one does or that no useful work can come out of them.

Ok? Ok.

# Play that game!

Stomping one Goomba isn't the end.

![Super Mario Bros World 1-1](mario-1-1.webp)

I also make time to practice fundamentals. That is, code up a Rails application that I've coded up dozens of times. Maybe I'll vary things or take a slightly different approach, but not usually. I like to say that even Jordan practiced free throws.

I'll also periodically go through all the cool sites we have now that go through Ruby fundamentals. Ruby Monks for example, really cool stuff. Benjamin Fleischer compiled a list of resource for learning Ruby and general programming in an epic github repo: [bf4/learning](https://github.com/bf4/learning)

Going through one Rails tutorial is like one level of a videogame. You've made progress, but Bowser is still out there. Hmm, what's Bowser in Rails? Maybe splitting a complex app into a few focused Rails engines? I should think these analogies through more.

# New games? Yay! New games!

Having a solid grasp of the fundamentals goes a long way towards feeling confident, at least for me, when trying to keep up with the news. Once you've learned a few frameworks or langauges (or beaten a few videogames) you get excited to learn about a new one on the horizon or released on github. I had a blast playing with meteor one afternoon, for example.

How do you know which tool or method to try out? It doesn't matter, just pick one that interests you. You aren't buying a lifetime stake in your experiment, you're just experimenting.

You can choose to bring in some rigor and approach the framework with a fundamental project, follow their given tutorials, or just mess around and guess how things work. If it's a completely unfamiliar framework or language you'll probably have to stick to the tutorials (e.g. playing a new videogame genre for the first time) but if you're in familiar territory (e.g. a new version of one of your languages) then it's fun to poke around for a while for surprises.

# Have fun!

If you aren't having fun and your job is programming then you need to rethink things or find a better place to work. I dread the time when the other shoe drops and the rest of the world realizes that we programmers get to play all day and call it work. :-)
