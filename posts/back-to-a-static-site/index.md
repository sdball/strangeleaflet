---
title: Back to a static site
slug: back-to-a-static-site
published_date: 2026-10-25T16:12:23+00:00
tags: blog, tools
publish: true
meta_description: Strange Leaflet moves off Bear and back to a static site on GitHub Pages, built by a small custom generator that Claude wrote.
---

A year ago I [switched to Bear](/switched-to-bear/) and I still think Bear is great. If you want to simply write words and have them show up on the Internet, go use Bear. It's fast, it's human, it's delightful, and it gets out of your way.

But recently I've been building [the Cabinet of Curios](/introducing-curiousstrangeleafletcom-and-a-new-theme/) and working on [FurtherFrom](https://furtherfrom.com) with Claude. Working on both sites has reminded me how nice it is to have a site that's just files. Way back in the early 1990s I hand edited HTML files as my blog originally hosted from the user hosting account of our ISP, Interpath. Back when publishing was `ftp`.

I'm getting that same kind of vibe with GitHub Pages which I'd always kind of relegated to either Jekyll things or simple single page HTML. With Claude I've found that it's really quite nice to get back to self-contained HTML files. Push some HTML to GitHub, GitHub Pages serves it, done. And the more curios I made with Claude the more I missed being able to drop interactive things right into blog posts like I could back when this blog was running in SvelteKit.

Bear is very intentionally not that. No JavaScript, just words. That's a feature! But it's just not the feature I want anymore.

Strange Leaflet is a static site again!

So let's walk through some blogging history as best I can remember it. My blogging has changed domains and hosting and frameworks several times.

- 1990s: something like `interpath.com/~ballfam` because no one else really cared to put files into our user account. This was purely handwritten HTML files wow.
- 1990s: At UNC we also got a user hosted space so it was something like `web.unc.edu/~sdball`?
- 2000s: I ran a livejournal for some time
- 2000s: There was an iBlog in there too which was a macOS app to compile posts into static HTML
- 2010s: I spun up a Ruby/Rails blog at rakeroutes.com which was variously a mephisto blog, jekyll, comfortable mexican sofa, WordPress, and ghost blog
- 2020s: I started up strangeleaflet and it's been jekyll, blot.im, SvelteKit, Phoenix, and bearblog.

And now back to plain HTML files but now with a light build script and help from Claude which is turning out to be super fun. Going from idea to self-contained HTML file is a great flow and we've been able to extract out my old SvelteKit widgets back into self-contained JavaScript within the posts. Woo!


## What I gave up

- A web UI to write and edit posts. Posts are markdown files in a git repo again.
- Bear's upvotes ("toasts"), visibility toggles, and analytics.
- An RSS feed that I never had to think about.

## What I got

Every post is its own HTML page that Claude and I fully control. Here's the walking penguin from my [SvelteKit reboot post](/rebooting-this-blog-in-svelte-and-sveltekit/), back from being a screenshot on Bear:

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

## How the widgets work

The penguin up above is just a tag in this post's markdown:

```markdown
<penguin-walker walk>

![screenshot of an animated cartoon walking penguin](/rebooting-this-blog-in-svelte-and-sveltekit/19am.webp)

</penguin-walker>

<script type="module" src="/rebooting-this-blog-in-svelte-and-sveltekit/penguin-walker.js"></script>
```

Any HTML tag with a hyphen in its name is a valid [custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements) name. The markdown renderer sees `<penguin-walker walk>` alone on a line, treats it as raw HTML, and passes it straight through. The blank line after it ends the raw HTML, so the screenshot inside is still rendered as regular markdown.

Until the script runs, the browser has no idea what a `<penguin-walker>` is, so it just shows what's inside: the screenshot. That's also all that a feed reader or a browser without JavaScript will see.

Then the script defines the element:

```javascript
customElements.define("penguin-walker", class extends HTMLElement {
  connectedCallback() {
    // read attributes like walk, insight, speed="80", and controls
    // swap the screenshot for a real penguin and start it walking
  }
});
```

The browser finds every `<penguin-walker>` already on the page and runs `connectedCallback()` on each one. Each penguin reads its own attributes, replaces its screenshot with the live version, and starts walking.

The script and the penguin GIFs live in the reboot post's directory, and the build copies them next to that post's page. The script finds its GIFs relative to itself (`new URL("penguin.gif", import.meta.url)`) rather than relative to the page, which is how this post can borrow the penguin from another post without copying anything.

So making a new widget is: drop a `.js` file into a post's directory, define an element with a hyphenated name, put the tag in the markdown with something sensible inside it, and add the `<script>` line.

## Wrap up

Bear was the right move a year ago and this is the right move now. I get my words in plain markdown files, my theme, and the freedom to make any post as weird and interactive as I want.

<script type="module" src="/rebooting-this-blog-in-svelte-and-sveltekit/penguin-walker.js"></script>

This site is also now on a public repo: enjoy! <a href="https://github.com/sdball/strangeleaflet">github.com sdball/strangeleaflet</a>.

