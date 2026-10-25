# Strange Leaflet

The blog at https://strangeleaflet.com: markdown posts built into a static site by
`scripts/build.py` and deployed to GitHub Pages by `.github/workflows/pages.yml`
on every push to `main`. Only `public/` is published, and it's generated, never
edited. The README covers layout, frontmatter, and widgets; this file is what
isn't obvious from it.

## Running and checking

```sh
scripts/serve            # build, then serve public/ at http://localhost:8000/
scripts/build            # rebuild while serve keeps running
scripts/check-links      # after a build
git config core.hooksPath .githooks   # once per clone
```

There's no test suite. `scripts/check-links` (also run by the deploy) fails on
internal links, images, or #anchors that go nowhere; links to other sites aren't
fetched. After changing the build, the template, or a post's markup, also look
at the pages it affects in a browser, in both light and dark, and at phone width.

## Rules

- **URLs never change.** A post's URL is `/<slug>/`, a leaflet page's is
  `/leaflets/<name>/page-N/` from its folders, and the feed's entry ids are
  those URLs. Renaming a slug or moving a page needs an `alias:` for the old
  path, or readers and feed subscribers break; a page that was already in the
  feed also needs `feed_id:` with its old path.
- **Don't write `published_date` on a new post or leaflet page.** The pre-commit
  hook stamps it in the commit that publishes it (`publish: true` or no
  `publish` line). Leaflet covers have no date; theirs is their pages' range.
  Drafts are `publish: false` and are committed publicly; that's fine.
- **The page markup mirrors Bear's** (`header > a.title > h1`, `nav p`, `main`,
  `ul.blog-posts` with `time`, `p.tags`, Pygments' `div.highlight`) because
  `static/theme.css` was written against it. Change the markup and the theme
  together. `static/theme.css` is the only copy of the theme; the old
  `strangeleaflet-theme` repo was for pasting it into Bear and is retired.
- **LF line endings** (`.gitattributes` enforces it). Bear's export was CRLF.

## Markdown gotchas (mistune)

- Tables need a `| --- |` separator row after the header, or they render as
  text. Bear tolerated missing ones; two posts had them.
- Raw HTML passes through. A tag alone on a line starts an HTML block, and a
  blank line ends it, so markdown between an opening and closing tag on their
  own lines still renders. `<x-y></x-y>` on one line is inline and gets wrapped
  in a `<p>`.
- `$...$` isn't math. The one `$\TeX$` was replaced with Bear's MathML.

## Widgets

Interactive parts of a post are custom elements in a module beside the post
(`posts/<slug>/thing.js`, loaded with `<script type="module" src="thing.js">`).
Follow the existing ones (`penguin-walker.js`, `bitfields.js`):

- Put a static fallback inside the element (a screenshot, code blocks). Feed
  readers and no-JS visitors see only that.
- Style with the theme's custom properties (`--ink`, `--line`, `--brass`,
  `--code-*`, `--type`, `--radius`) so light and dark both work, and scope rules
  under the element's tag with `:defined`.
- Load assets with `new URL("file", import.meta.url)` so another post can reuse
  the module by absolute path.
- Respect `prefers-reduced-motion`, keep tap targets 40–44px, label inputs.
- No frameworks or CDNs.

## The feed

`/feed/` is `public/feed/index.xml` (GitHub Pages serves `index.xml` as a
directory index with `application/xml`; verified). It holds the latest 10
posts with full content, matching what Bear served; that size was a deliberate
choice. `/feed.xml` is the same file.

## Related repos and links

- `../strangeleaflet-curious`: curious.strangeleaflet.com, standalone curios.
  The Conway post links to `/conway-life/` there ahead of that curio existing;
  that link 404s on purpose until it does.
- `../strange_leaflet`: the old Phoenix version, still running at
  strangeleaflet.fly.dev. A few posts link to its `/widgets` and games.
- The repo's git history before the Bear export holds the SvelteKit version,
  including the original Svelte widgets and images.
