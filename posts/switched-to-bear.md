---
title: Switched to Bear
slug: switched-to-bear
published_date: 2025-09-14T13:56:00+00:00
publish: true
discoverable: true
is_page: false
---

I was browsing around the [Kagi small web](https://kagi.com/smallweb) and found that I was on a blog powered by Bear. A couple things caught my eye.

The blog was nice, readable, and fast enough to be a fine human experience.

The little bear unicode logo at the bottom was adorable.

I've been feeling more of a spark of annoyance than a spark of joy maintaining my own stack of blogging lately. While I love having the capability to add games like [LiveView Life](https://strangeleaflet.fly.dev/games/life) and [a world-wide multiplayer minesweeper clone](https://strangeleaflet.fly.dev/games/mowing-wide-multi). The blog writing experience wasn't it.

The major stumbling block is that to write and publish a blog post required that I had to stack together a chain of tooling starting from writing a post an on arbitrary device to getting those words committed to my repo to publishing to fly.io. I've been contemplating writing an actual in-app editing stack but that would mean dealing with authentication and whatever data stacks e.g. probably storing the posts in Tigris.

Static site generators are an option but that's already what I'd written for Strange Leaflet using the excellent [Nimble Publisher](https://github.com/dashbitco/nimble_publisher). I don't want a static site generator I just want to write words and share code snippets.

[blot.im](https://blot.im/) is a nice in-between a hosted option and a static site generator that I used before my journey into SvelteKit and then Nimble Publisher. Blot is joyfully scoped but I kept running into friction with its dropbox/git interface. I never found a writing experience that I enjoyed that also supported the mechanics of writing markdown files to Dropbox or committing files to a Git repo.

With a hosted blogging experience I get to leave more of my day job behind when I'm writing for my blog. Here are my words: please put them on the Internet in some kind of way.

Over my years of blogging I've had pretty good but not great experiences from many hosted blogging platforms.

I was writing with and writing plugins for Wordpress more than a decade ago. It is a supremely capable platform but it's also just that: a platform. Wordpress offers hundreds and hundreds of integrations and extensions and customizations. There's also the drama of .org vs .com and I don't really care.

That issue of hosted platforms trying to be appealing platforms for many uses is at the core of my hesitance towards going back to any of them. I'm not a writing team. I don't need editor/publisher roles. I don't need to integrate with single sign-on systems.

That left me wanting to find something but not really with any sense of urgency. So when I spotted that "Powered by [Bear ʕ•ᴥ•ʔ](https://bearblog.dev/)" I was primed to click and see whatever the deal was. And what I found is exactly what I wanted and more!

> A privacy-first, no-nonsense, super-fast blogging platform
>
> No trackers, no javascript, no stylesheets. Just your words.

YES. And then I found the [Bear Manifesto](https://herman.bearblog.dev/manifesto/).

> Bear won't shut down.
>
> Bear won't sell.
>
> Bear won't show ads.
>
> Built to last

It's beautiful. Even further I found that [Bear is source-available](https://herman.bearblog.dev/license/) with a switch away from the MIT liecnse as of September 1, 2025. I am a huge fan of this approach.

> This new license is almost identical to the MIT license but with the stipulation that the software cannot be provided as a hosted or managed service. Everything else is still permitted.
>
> …
>
> We're entering a new age of AI powered coding, where creating a competing product only involves typing "Create a fork of this repo and change its name to something cool and deploy it on an EC2 instance".

I am more than happy to support human programming and explicitly human programming that is focused on human use.

While migrating to Bear I also found that I appreciated [its approach to content migration](https://docs.bearblog.dev/migrate/) as well.

> The easiest way to move existing content to Bear is to create new posts and copy the text content from your existing web pages one at a time.

Yeah! We aren't trying to seamlessly integrate writing and metadata from dozens of arbitrary systems. Get your words together and put them into Bear or don't.

I did.
