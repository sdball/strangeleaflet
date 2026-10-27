# Strange Leaflet

The blog at https://strangeleaflet.com. Posts are markdown files, one small
Python script turns them into a static site in `public/`, and pushing to
`main` builds and deploys it to GitHub Pages.

```
posts/<slug>.md          a post
posts/<slug>/index.md    a post with its own files (images, scripts) beside it
leaflets/<name>/         a leaflet: a cover (index.md) and its pages (page-N/index.md)
pages/                   index.md (home), blog.md, about-me.md
templates/layout.html    the page around every post and page
static/theme.css         the theme (light and dark), copied to public/
scripts/build            builds public/ (sets up .venv the first time)
scripts/serve            builds with drafts, serves public/ at http://localhost:8000/, rebuilds on changes
scripts/check-links      checks every internal link and image in public/
scripts/drafts           picks a draft with gum and opens it in $EDITOR
```

## Run it locally

```sh
scripts/serve        # http://localhost:8000/
scripts/serve 9000   # or pick a port
scripts/serve --list # Python servers still running, with their pids
scripts/build        # build without drafts, the way the deploy does
scripts/check-links  # after a build: any links or images that go nowhere?
scripts/drafts       # pick a draft to open in $EDITOR (--list to just list them)
```

While `scripts/serve` runs, saving anything in `posts/`, `pages/`,
`leaflets/`, `static/`, or `templates/` rebuilds the site, and open pages
reload themselves. It includes drafts, each marked as one. Ctrl-C stops it.

It needs Python 3 and installs `mistune` and `Pygments` from
`requirements.txt` into `.venv`.

After cloning, turn on the pre-commit hook once, so publishing a post stamps
its date:

```sh
git config core.hooksPath .githooks
```

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
- `publish: false` makes it a draft: left out of the site, but shown (marked
  as a draft) by `scripts/serve`.
- `published_date` is filled in for you. Leave it out of a draft, and the
  commit that publishes the post (with `publish: true`, or no `publish` line)
  adds the current time. A local build previews an undated post as "now"; the
  deploy refuses to build one.
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
`![a picture](picture.webp)` resolve.

The existing widgets are custom elements (`<penguin-walker>` in
`rebooting-this-blog-in-svelte-and-sveltekit/`, `<bitfield-steps>` and friends
in `shrink-your-data-into-bitfields-and-out-again/`). Put the opening and
closing tags on lines of their own, and anything between them, separated by
blank lines, is still rendered as markdown. That content is the fallback that
feed readers and visitors without JavaScript see, and the element replaces it:

```markdown
<penguin-walker walk>

![screenshot of the walking penguin](penguin.webp)

</penguin-walker>

<script type="module" src="penguin-walker.js"></script>
``` A post can also be `index.html` (or
`<slug>.html`) with the same frontmatter, and its body is used as-is inside the
layout.

## Leaflets

A leaflet is a piece told over several pages, with a cover. Leaflets live at
`/leaflets/`, which the build generates and the nav links to.

```
leaflets/<name>/index.md          the cover, at /leaflets/<name>/
leaflets/<name>/page-1/index.md   page 1, at /leaflets/<name>/page-1/, with its files beside it
leaflets/<name>/page-2.md         or a page with no files of its own
```

The cover has a `title`, a `meta_description` (shown on `/leaflets/`), `tags`,
and any `alias`, and no `published_date`. Its body is the introduction; the
build adds the dates, the page count, and a contents list. The first image on
a cover is its picture on `/leaflets/`. A cover can reference its pages' files
(`page-1/picture.webp`).

A page needs no `title` or `slug`: its number comes from its folder, and its
`meta_description` is the line under "Page N", its entry in the contents, and
the end of its feed title ("Programming Videos, page 2: …"). It gets a
`published_date` the same way a post does. The build adds the running head
(the leaflet's name and its pages) and the page turn at the foot, so don't
write those by hand.

Leaflet pages aren't in the `/blog/` list or its tag filter, but they are in
the feed, by date, so a new page reaches subscribers. A page that moved after
it was already in the feed keeps its old entry id with `feed_id: /old-path/`,
so readers don't see it twice.

## Pages

`pages/` holds pages that aren't posts. They can use Bear's embeds, each on a
line of its own:

- `{{ posts }}` lists every post, filtered by `?q=<tag>` like Bear's tag links
- `{{ posts limit:5 }}` lists the latest five
- `{{ tags }}` lists every tag

## What the build makes

- a page for every post and page, at `/<slug>/`
- `/leaflets/`, and each leaflet's cover and pages under it
- `/feed/` (`feed/index.xml`) and `/feed.xml`: an Atom feed of the latest 10 posts and leaflet pages, with the same entry ids Bear used
- `/sitemap.xml` and `/robots.txt`
- `/404.html`
- a redirect page at each alias

Every page includes the GoatCounter snippet from the layout, and the deploy
checks for it.
