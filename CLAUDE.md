# Strange Leaflet

The blog at https://strangeleaflet.com: markdown posts built into a static site by
`scripts/build.py` and deployed to GitHub Pages by `.github/workflows/pages.yml`
on every push to `main`. Only `public/` is published, and it's generated, never
edited. The README covers layout, frontmatter, and widgets; this file is what
isn't obvious from it.

## Running and checking

```sh
scripts/serve            # build with drafts, serve at http://localhost:8000/, rebuild and reload on save
scripts/serve --list     # Python servers still running, with their pids
scripts/build            # build without drafts, as the deploy does
scripts/check-links      # after a build
scripts/drafts           # pick a draft (publish: false) to open in $EDITOR; --list
git config core.hooksPath .githooks   # once per clone
direnv allow                          # once per clone: .envrc puts scripts/ on PATH
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

## Code in several languages

A `<code-choice>` holds the same code as fenced blocks in several languages,
and `static/code-choice.js` shows one with a picker (shared, like `loops.js`;
end the post with `<script type="module" src="/code-choice.js"></script>`).
The bitfields post is the example.

- The post needs `code_language:`, and every choice a block in it: that's the
  default, and the only one the feed keeps. The build stops otherwise.
- Output that differs by language goes inside the choice as another block
  fenced with that language, after its code.
- Run every translation and paste real output into its `# =>` comments.
- Only general code gets a choice. Code about one language's feature (Elixir
  binary pattern matching) stays in that language.

## Clips

Short looping captures (gameplay, a moment from a movie) are MP4s, not GIFs: a
GIF is 5–10× bigger and plays even when the reader prefers reduced motion.

- Encode with `ffmpeg … -c:v libx264 -pix_fmt yuv420p -crf 24 -preset slow
  -movflags +faststart -an clip.mp4`, from the original video when there is one
  (sharper than going through a GIF). Pull a representative frame as `clip.jpg`.
- Markup, as in the ElixirConf clips post: `<video loop muted playsinline controls
  preload="metadata" poster="clip.jpg" width=… height=… aria-label="…">` holding
  a `<source>` and the poster as an `<img alt="…">` fallback, then the
  `<small>` caption. End the post with `<script type="module"
  src="/loops.js"></script>` (`static/loops.js`, shared by every post that
  has clips, so it's published even while a post using it is a draft), which
  plays them like GIFs unless the reader prefers reduced motion; without
  it (no JS, feed readers) they're posters with controls.
- Skip stretches with full-screen flashing (Star Raiders' red alert).
- Clips with sound that matters (the Robin Hood speech in `we-take-it-back`)
  aren't loops: plain `controls` videos with a captions track.

## The feed

`/feed/` is `public/feed/index.xml` (GitHub Pages serves `index.xml` as a
directory index with `application/xml`; verified). It holds the latest 10
posts with full content, matching what Bear served; that size was a deliberate
choice. `/feed.xml` is the same file.

## Related repos and links

- `../strangeleaflet-curious`: curious.strangeleaflet.com, standalone curios.
  The Conway post describes its `/conway-life/` curio, so a change to the
  curio's stations may need the post's wording updated too.
- `../strange_leaflet`: the old Phoenix version, still running at
  strangeleaflet.fly.dev. A few posts link to its `/widgets` and games.
- The repo's git history before the Bear export holds the SvelteKit version,
  including the original Svelte widgets and images.
