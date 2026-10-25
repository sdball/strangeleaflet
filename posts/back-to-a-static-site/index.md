---
title: Back to a static site
slug: back-to-a-static-site
published_date: 2026-10-25T12:00:00+00:00
tags: blog, tools
publish: false
discoverable: true
is_page: false
meta_description: Strange Leaflet moves off Bear and back to a static site on GitHub Pages, built by a small custom generator that Claude wrote.
---

A year ago I [switched to Bear](/switched-to-bear/) and I still think Bear is great. If you want to write words and have them show up on the Internet, go use Bear. It's fast, it's honest, and it gets out of your way.

But I've been building [the Cabinet of Curios](/introducing-curiousstrangeleafletcom-and-a-new-theme/) and it reminded me how nice it is to have a site that's just files. Push some HTML to GitHub, GitHub Pages serves it, done. And the more curios I made the more I missed being able to drop interactive things right into a blog post like I could back in my SvelteKit days.

Bear is very intentionally not that. No JavaScript, just your words. That's a feature! It's just not the feature I want anymore.

So Strange Leaflet is a static site again.

## What I gave up

- A web UI to write and edit posts. Posts are markdown files in a git repo again.
- Bear's upvotes ("toasts"), visibility toggles, and analytics.
- An RSS feed that I never had to think about.

## What I got

Every post is its own HTML page that I fully control. Here's the walking penguin from my [SvelteKit reboot post](/rebooting-this-blog-in-svelte-and-sveltekit/), back from being a screenshot on Bear:

<penguin-walker walk>

![screenshot of an animated cartoon walking penguin](/rebooting-this-blog-in-svelte-and-sveltekit/19am.webp)

</penguin-walker>

The [bitfields post](/shrink-your-data-into-bitfields-and-out-again/) has its interactive explorers back too.

Those used to be Svelte components. Now they're plain JavaScript custom elements that live in the same directory as their post. No framework, no bundler. Each one wraps the static version that was on Bear (a screenshot, some code blocks) so feed readers and anyone without JavaScript still see something sensible.

## A custom generator, written by Claude

I've been down the static site generator road before. I don't want to learn another generator's opinions about templates and themes and plugins. I wanted exactly one thing: take the markdown that Bear exported and turn it into the same HTML Bear was making, so my theme just keeps working.

So I asked Claude (Claude Code, specifically) whether that was feasible. It looked at the export, my Bear theme, and my other static sites, said yes, and then built it with me.

The whole generator is [one Python file](https://github.com/sdball/strangeleaflet/blob/main/scripts/build.py) of about 370 lines using [mistune](https://github.com/lepture/mistune) for markdown and [Pygments](https://pygments.org/) for syntax highlighting. It makes:

- a page for every post, at the same URLs Bear used
- the home page and the blog list, including Bear's `?q=tag` filtering
- an Atom feed at the same `/feed/` URL with the same entry ids, so existing subscribers shouldn't notice a thing
- redirects for old URLs from earlier versions of this blog
- a sitemap and a 404 page

Pushing to main builds the site with GitHub Actions and deploys it to GitHub Pages.

The part I appreciated most was the checking. Claude fetched every page of the live Bear blog and compared it against what the new generator produced. That turned up a couple of tables that were missing their header rows, which Bear had been quietly rendering wrong, and a dozen links and images that had been broken since earlier migrations. It copied my images off Bear's CDN, dug the missing ones out of this repo's git history, and fixed the links.

## Wrap up

Bear was the right move a year ago and this is the right move now. I get my words in plain markdown files, my theme, and the freedom to make any post as weird and interactive as I want.

<script type="module" src="/rebooting-this-blog-in-svelte-and-sveltekit/penguin-walker.js"></script>
