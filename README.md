# Strange Leaflet

The blog at https://strangeleaflet.com. Posts are markdown files, one small
Python script turns them into a static site in `public/`, and pushing to
`main` builds and deploys it to GitHub Pages.

```
posts/<slug>.md          a post
posts/<slug>/index.md    a post with its own files (images, scripts) beside it
pages/                   index.md (home), blog.md, about-me.md
templates/layout.html    the page around every post and page
static/theme.css         the theme, from github.com/sdball/strangeleaflet-theme
scripts/build            builds public/ (sets up .venv the first time)
scripts/serve            builds, then serves public/ at http://localhost:8000/
```

## Run it locally

```sh
scripts/serve        # http://localhost:8000/
scripts/serve 9000   # or pick a port
scripts/build        # rebuild while serve keeps running, then refresh
```

It needs Python 3 and installs `mistune` and `Pygments` from
`requirements.txt` into `.venv`.

## Writing a post

Add `posts/<slug>.md`. The frontmatter is the format Bear exported:

```yaml
---
title: From awk to a Dockerized Ruby Script
slug: from-awk-to-a-dockerized-ruby-script
published_date: 2021-08-08T04:00:00+00:00
tags: awk, docker, ruby, shell
meta_description: Taking a script and wrapping it up into a Docker image that can easily run anywhere!
---
```

- `slug` is the URL: `/from-awk-to-a-dockerized-ruby-script/`.
- `publish: false` leaves the post out of the build entirely (a draft).
- `discoverable: false` builds the page but leaves it off the lists, the feed and the sitemap.
- `alias: blog/old-path` adds a redirect from an old URL. Separate several with commas.
- `meta_description` is optional; without it the description is the start of the post.

Fenced code blocks are highlighted by Pygments with the language after the
backticks (` ```elixir `), and `theme.css` colors them.

## Widgets

Markdown passes raw HTML through, so a post can carry its own interactive
parts the way the curios do. Make the post a directory and put the code beside
it:

```
posts/my-post/index.md
posts/my-post/widget.js
```

```html
<div id="widget"></div>
<script type="module">
  import { start } from "./widget.js";
  start(document.getElementById("widget"));
</script>
```

Every file in the directory is copied next to the page, so `./widget.js` and
`![a picture](picture.webp)` resolve. A post can also be `index.html` (or
`<slug>.html`) with the same frontmatter, and its body is used as-is inside the
layout.

## Pages

`pages/` holds pages that aren't posts. They can use Bear's embeds, each on a
line of its own:

- `{{ posts }}` lists every post, filtered by `?q=<tag>` like Bear's tag links
- `{{ posts limit:5 }}` lists the latest five
- `{{ tags }}` lists every tag

## What the build makes

- a page for every post and page, at `/<slug>/`
- `/feed/` (`feed/index.xml`) and `/feed.xml`: an Atom feed of the latest 10 posts, with the same entry ids Bear used
- `/sitemap.xml` and `/robots.txt`
- `/404.html`
- a redirect page at each alias

Every page includes the GoatCounter snippet from the layout, and the deploy
checks for it.
