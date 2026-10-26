"""Build public/ from posts/, pages/, static/ and templates/.

Each post or page is Bear's export format: a `---` frontmatter block, then
markdown. It can also be HTML (`.html`), which is used as-is. A post that
lives in a directory (`posts/<slug>/index.md`) has every other file in that
directory copied beside its page, so images and scripts can be referenced by
bare filename.

`--drafts` builds drafts (publish: false) too, marked as drafts, for
scripts/serve. The deploy builds without it.
"""

import html
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from string import Template
from urllib.parse import quote

import mistune
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.lexers.special import TextLexer
from pygments.util import ClassNotFound

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

SITE_TITLE = "Strange Leaflet"
SITE_URL = "https://strangeleaflet.com"
SITE_DESCRIPTION = "A nerdy blog by Stephen Ball focusing on Elixir, Go, TypeScript, shell scripts, and other cool weird stuff."
AUTHOR = "Stephen Ball"
FEED_SIZE = 10
LEAFLETS_INTRO = "Opening the small mailbox reveals some leaflets. Each has a cover and pages to turn, one after another."

LAYOUT = Template((ROOT / "templates" / "layout.html").read_text())


# Markdown, rendered the way Bear does: Pygments for code, ids on headings,
# raw HTML passed through.

FORMATTER = HtmlFormatter()


def slugify(text):
    text = html.unescape(re.sub(r"<[^>]+>", "", text)).lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


class Renderer(mistune.HTMLRenderer):
    def block_code(self, code, info=None):
        lang = info.split()[0] if info else ""
        try:
            lexer = get_lexer_by_name(lang) if lang else TextLexer()
        except ClassNotFound:
            lexer = TextLexer()
        return highlight(code, lexer, FORMATTER)

    def heading(self, text, level, **attrs):
        # A repeated heading gets -1, -2, ... so every anchor on the page is unique
        base = slug = slugify(text)
        n = 0
        while slug in self.heading_ids:
            n += 1
            slug = f"{base}-{n}"
        self.heading_ids.add(slug)
        return f'<h{level} id="{slug}">{text}</h{level}>\n'


renderer = Renderer(escape=False)
markdown = mistune.create_markdown(
    renderer=renderer,
    plugins=["strikethrough", "footnotes", "table", "url"],
)


# Sources

def index_source(folder):
    return next((folder / name for name in ("index.md", "index.html") if (folder / name).exists()), None)


def find_sources(folder):
    for path in sorted(folder.iterdir()):
        if path.is_dir():
            if index_source(path):
                yield index_source(path)
        elif path.suffix in (".md", ".html"):
            yield path


def frontmatter_value(raw):
    raw = raw.strip()
    if raw.startswith('"') and raw.endswith('"'):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return raw[1:-1]
    return raw


def load(path, folder, kind, url=None):
    """Kind is post, page, cover, or leaflet page. Leaflets pass a url; the rest come from slug."""
    text = path.read_text()
    if not text.startswith("---\n"):
        sys.exit(f"{path.relative_to(ROOT)}: missing frontmatter")
    _, head, body = text.split("---\n", 2)
    meta = {}
    for line in head.splitlines():
        if line.strip():
            key, _, value = line.partition(":")
            meta[key.strip()] = frontmatter_value(value)

    if url is None:
        slug = meta.get("slug", "").strip("/")
        url = f"/{slug}/" if slug else "/"
    published = meta.get("published_date")
    return {
        "source": path,
        "assets": path.parent if path.parent != folder else None,
        "kind": kind,
        "title": meta.get("title", ""),
        "url": url,
        "date": datetime.fromisoformat(published) if published else None,
        "tags": [t.strip() for t in meta.get("tags", "").split(",") if t.strip()],
        "aliases": [a.strip().strip("/") for a in meta.get("alias", "").split(",") if a.strip()],
        "publish": meta.get("publish", "true") != "false",
        "description": meta.get("meta_description", ""),
        "feed_id": meta.get("feed_id", "").strip(),
        "body": body,
        "is_html": path.suffix == ".html",
    }


LEAFLET_PAGE = re.compile(r"^page-(\d+)(\.md|\.html)?$")


def load_leaflets(folder, drafts=False):
    """Each leaflets/<name>/ has a cover (index.md) and pages (page-N/index.md or page-N.md).

    A cover gets "pages", its published pages in order, and each page gets
    "leaflet" (its cover) and "number". A leaflet with no published pages is
    left out. With drafts, unpublished covers and pages count as published.
    """
    leaflets = []
    for home in sorted(p for p in folder.iterdir() if p.is_dir()):
        url = f"/leaflets/{home.name}/"
        if not index_source(home):
            sys.exit(f"{home.relative_to(ROOT)}: a leaflet needs a cover, index.md")
        cover = load(index_source(home), folder, "cover", url)
        pages = []
        for path in home.iterdir():
            match = LEAFLET_PAGE.match(path.name)
            source = index_source(path) if path.is_dir() else path
            if not match or not source:
                continue
            n = int(match.group(1))
            page = load(source, home, "leaflet page", f"{url}page-{n}/")
            page.update(leaflet=cover, number=n, title=f"{cover['title']}, page {n}")
            pages.append(page)
        cover["pages"] = sorted((p for p in pages if p["publish"] or drafts), key=lambda p: p["number"])
        if (cover["publish"] or drafts) and cover["pages"]:
            leaflets.append(cover)
        elif cover["publish"] or drafts:
            print(f"{cover['source'].relative_to(ROOT)}: no published pages yet, leaving it out")
    return leaflets


# Pieces of markup shared by the pages

def esc(text):
    return html.escape(text, quote=True)


def time_tag(date):
    utc = date.astimezone(timezone.utc)
    return f'<time datetime="{utc:%Y-%m-%dT%H:%MZ}">{utc:%d %b, %Y}</time>'


# Only a --drafts build has drafts in it
DRAFT = '<mark class="draft">draft</mark>'
DRAFT_NOTE = f'<p>{DRAFT} Only scripts/serve shows this. It isn\'t published.</p>\n'


def draft_mark(entry):
    return "" if entry["publish"] else " " + DRAFT


def tag_href(tag):
    return f"/blog/?q={quote(tag)}"


def post_list(posts, embedded=False):
    css = "embedded blog-posts" if embedded else "blog-posts"
    items = "\n".join(
        f'<li data-tags="{esc(",".join(p["tags"]))}"><span><i>{time_tag(p["date"])}</i></span>'
        f'<a href="{p["url"]}">{esc(p["title"])}</a>{draft_mark(p)}</li>'
        for p in posts
    )
    return f'<ul class="{css}">\n{items}\n</ul>'


def tag_links(tags):
    links = "\n".join(f'<a rel="nofollow" href="{esc(tag_href(t))}">#{esc(t)}</a>' for t in tags)
    return f'\n<p class="tags">\n{links}\n</p>' if tags else ""


def tag_cloud(posts):
    tags = sorted({t for p in posts for t in p["tags"]})
    links = "\n".join(f'<a rel="nofollow" href="{esc(tag_href(t))}">#{esc(t)}</a>' for t in tags)
    return f'<small>\n<div class="tags">\n{links}\n</div>\n</small>'


# /blog/?q=tag shows only the posts with that tag, like Bear's tag links
TAG_FILTER_NOTE = '<p class="tag-filter" hidden><i>Posts tagged <b></b></i> · <a href="/blog/">all posts</a></p>'
TAG_FILTER = """<style>.blog-posts li[hidden] { display: none; }</style>
<script>
  (() => {
    const tag = new URLSearchParams(location.search).get("q");
    if (!tag) return;
    const want = tag.toLowerCase();
    for (const li of document.querySelectorAll(".blog-posts li")) {
      li.hidden = !li.dataset.tags.toLowerCase().split(",").includes(want);
    }
    const note = document.querySelector(".tag-filter");
    note.querySelector("b").textContent = "#" + tag;
    note.hidden = false;
  })();
</script>"""


# Leaflets: a cover with a contents list, and pages strung on eyelets with a page turn at the foot

def page_count(cover):
    n = len(cover["pages"])
    return f"{n} page" if n == 1 else f"{n} pages"


def leaflet_dates(cover):
    first, last = cover["pages"][0]["date"], cover["pages"][-1]["date"]
    if f"{first:%Y%m%d}" == f"{last:%Y%m%d}":
        return time_tag(first)
    return f"{time_tag(first)} – {time_tag(last)}"


def leaflet_months(cover):
    """June–July 2022, or September 2025–March 2026."""
    first, last = cover["pages"][0]["date"], cover["pages"][-1]["date"]
    if (first.year, first.month) == (last.year, last.month):
        return f"{first:%B %Y}"
    if first.year == last.year:
        return f"{first:%B}–{last:%B %Y}"
    return f"{first:%B %Y}–{last:%B %Y}"


def cover_main(cover, content):
    first = cover["pages"][0]
    items = "\n".join(
        f'<li><span>page {p["number"]}</span><a href="{p["url"]}">{esc(p["description"] or p["title"])}</a>{draft_mark(p)}</li>'
        for p in cover["pages"]
    )
    return (
        f'<h1>{esc(cover["title"])}</h1>\n'
        f'<p class="leaflet-meta">{leaflet_dates(cover)} · {page_count(cover)}</p>\n'
        f'{content}'
        f'<h2 id="contents">Contents</h2>\n'
        f'<ul class="blog-posts leaflet-pages">\n{items}\n</ul>\n'
        f'<p><a class="open-leaflet" href="{first["url"]}">turn to page {first["number"]} »</a></p>'
        f'{tag_links(cover["tags"])}'
    )


def leaflet_page_main(page, content):
    cover = page["leaflet"]
    pages = cover["pages"]
    eyelets = []
    for p in pages:
        current = ' aria-current="page"' if p is page else ""
        eyelets.append(f'    <li><a href="{p["url"]}"{current} title="{esc(p["description"])}"><span>{p["number"]}</span></a></li>')
    eyelets = "\n".join(eyelets)
    head = (
        f'<div class="leaflet-head">\n'
        f'  <a href="{cover["url"]}">{esc(cover["title"])}</a>\n'
        f'  <ol class="eyelets" aria-label="Pages">\n{eyelets}\n  </ol>\n'
        f'</div>'
    )

    # Page 1 turns back to the cover, and the last page closes the leaflet
    i = pages.index(page)
    if i > 0:
        back = (pages[i - 1]["url"], f'« back to page {pages[i - 1]["number"]}', pages[i - 1]["description"])
    else:
        back = (cover["url"], "« back to the cover", cover["title"])
    if i < len(pages) - 1:
        ahead = (pages[i + 1]["url"], f'turn to page {pages[i + 1]["number"]} »', pages[i + 1]["description"])
    else:
        ahead = (cover["url"], "close the leaflet »", "Back to the cover")
    turn = "\n".join(
        f'  <a class="{css}" href="{href}"><span class="dir">{esc(direction)}</span><span class="what">{esc(what)}</span></a>'
        for css, (href, direction, what) in (("prev", back), ("next", ahead))
    )

    dek = f'<p class="dek">{esc(page["description"])}</p>\n' if page["description"] else ""
    return (
        f'{head}\n<h1>Page {page["number"]}</h1>\n{dek}<p><i>{time_tag(page["date"])}</i></p>\n{content}'
        f'<nav class="page-turn" aria-label="Turn the page">\n{turn}\n</nav>'
    )


def leaflets_main(leaflets, contents):
    articles = []
    for cover in leaflets:
        picture = ""
        img = re.search(r'<img [^>]*src="([^"]+)"', contents[cover["url"]])
        if img:
            src = img.group(1)
            if not re.match(r"^([a-z][a-z0-9+.-]*:|/)", src, re.I):
                src = cover["url"] + src
            # The title beside it is the same link, so this one stays out of the tab order
            picture = f'  <a href="{cover["url"]}" tabindex="-1" aria-hidden="true"><img src="{esc(src)}" alt=""></a>\n'
        about = f'\n    <p>{esc(cover["description"])}</p>' if cover["description"] else ""
        articles.append(
            f'<article class="leaflet-entry">\n{picture}'
            f'  <div>\n'
            f'    <h2><a href="{cover["url"]}">{esc(cover["title"])}</a></h2>\n'
            f'    <p class="leaflet-meta">{page_count(cover)} · {leaflet_months(cover)}</p>{about}\n'
            f'  </div>\n'
            f'</article>'
        )
    return f'<h1>Leaflets</h1>\n<p>{esc(LEAFLETS_INTRO)}</p>\n' + "\n".join(articles)


def expand_embeds(body, posts):
    """Bear's {{ posts }}, {{ posts limit:N }} and {{ tags }}, each on its own line."""

    def embed(match):
        name, limit = match.group(1), match.group(2)
        if name == "tags":
            return tag_cloud(posts)
        if limit:
            return post_list(posts[: int(limit)], embedded=True)
        return TAG_FILTER_NOTE + "\n" + post_list(posts) + "\n" + TAG_FILTER

    return re.sub(r"^\{\{ *(posts|tags)(?: +limit: *(\d+))? *\}\}$", embed, body, flags=re.M)


def absolute_urls(content, base):
    """Make src and href values absolute, for content read outside the site (the feed)."""

    def fix(match):
        attr, quote_char, value = match.groups()
        if re.match(r"^([a-z][a-z0-9+.-]*:|#|//)", value, re.I):
            return match.group(0)
        url = SITE_URL + value if value.startswith("/") else SITE_URL + base + value
        return f"{attr}={quote_char}{url}{quote_char}"

    return re.sub(r"""\b(src|href)=(["'])(.*?)\2""", fix, content)


def render_content(entry, posts):
    if entry["is_html"]:
        return entry["body"]
    body = expand_embeds(entry["body"], posts) if entry["kind"] == "page" else entry["body"]
    renderer.heading_ids = set()
    return markdown(body)


def description_for(entry, content):
    if entry["description"]:
        return entry["description"]
    text = html.unescape(re.sub(r"<[^>]+>", " ", content))
    text = " ".join(text.split())
    return text[:157] + "..." if len(text) > 160 else text


def page(path, *, title, description, canonical, body_class, main, og_type="website"):
    out = PUBLIC / path
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(LAYOUT.substitute(
        title=esc(title),
        description=esc(description),
        canonical=esc(canonical),
        og_type=og_type,
        body_class=body_class,
        main=main,
    ))


# Feed, sitemap, aliases

def atom_date(date):
    return date.astimezone(timezone.utc).isoformat()


def write_feed(posts, contents):
    """Posts and leaflet pages, newest first."""
    entries = []
    for p in posts[:FEED_SIZE]:
        url = SITE_URL + p["url"]
        # A page that moved keeps the id it was first in the feed with, so readers don't see it twice
        entry_id = SITE_URL + p["feed_id"] if p["feed_id"] else url
        title = p["title"]
        if p["kind"] == "leaflet page" and p["description"]:
            title += ": " + p["description"]
        content = absolute_urls(contents[p["url"]], p["url"])
        categories = "".join(f'\n    <category term="{esc(t)}"/>' for t in p["tags"])
        entries.append(f"""  <entry>
    <id>{entry_id}</id>
    <title>{esc(title)}</title>
    <link href="{url}"/>
    <published>{atom_date(p["date"])}</published>
    <updated>{atom_date(p["date"])}</updated>{categories}
    <content type="html">{esc(content)}</content>
  </entry>""")

    updated = atom_date(posts[0]["date"]) if posts else atom_date(datetime.now(timezone.utc))
    feed = f"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>{SITE_URL}</id>
  <title>{SITE_TITLE}</title>
  <subtitle>{esc(SITE_DESCRIPTION)}</subtitle>
  <updated>{updated}</updated>
  <author>
    <name>{AUTHOR}</name>
  </author>
  <link href="{SITE_URL}/" rel="alternate"/>
  <link href="{SITE_URL}/feed/" rel="self"/>
{chr(10).join(entries)}
</feed>
"""
    # /feed/ is where Bear served it and where readers are subscribed
    (PUBLIC / "feed").mkdir(exist_ok=True)
    (PUBLIC / "feed" / "index.xml").write_text(feed)
    (PUBLIC / "feed.xml").write_text(feed)


def write_sitemap(urls):
    urls = "\n".join(f"  <url><loc>{SITE_URL}{url}</loc></url>" for url in urls)
    (PUBLIC / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="utf-8"?>\n'
        f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n'
    )
    (PUBLIC / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n")


def write_alias(alias, target):
    out = PUBLIC / alias / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(f"""<!doctype html>
<meta charset="utf-8">
<title>Moved</title>
<link rel="canonical" href="{SITE_URL}{target}">
<meta http-equiv="refresh" content="0; url={target}">
<meta name="robots" content="noindex">
<p>This page moved to <a href="{target}">{SITE_URL}{target}</a>.</p>
""")


# Build

def main(drafts=False):
    entries = []
    for name, kind in (("posts", "post"), ("pages", "page")):
        folder = ROOT / name
        entries += [load(p, folder, kind) for p in find_sources(folder)]
    entries = [e for e in entries if e["publish"] or drafts]
    leaflets = load_leaflets(ROOT / "leaflets", drafts)
    for cover in leaflets:
        entries += [cover] + cover["pages"]

    seen = {"/leaflets/": ROOT / "leaflets"}
    for e in entries:
        if e["kind"] in ("post", "leaflet page") and not e["date"]:
            # .githooks/pre-commit adds the date in the commit that publishes a post or leaflet page
            if os.environ.get("CI"):
                sys.exit(f"{e['source'].relative_to(ROOT)}: posts and leaflet pages need a published_date")
            e["date"] = datetime.now(timezone.utc)
            print(f"{e['source'].relative_to(ROOT)}: no published_date yet, previewing it as now")
        for url in [e["url"]] + [f"/{a}/" for a in e["aliases"]]:
            if url in seen:
                sys.exit(f"{e['source'].relative_to(ROOT)}: {url} is also used by {seen[url].relative_to(ROOT)}")
            seen[url] = e["source"]

    def newest_first(kinds):
        return sorted((e for e in entries if e["kind"] in kinds), key=lambda e: e["date"], reverse=True)

    # Leaflet pages stay out of the blog list, but the feed has them
    posts = newest_first({"post"})
    leaflets.sort(key=lambda cover: cover["pages"][-1]["date"], reverse=True)

    # Empty public/ rather than replacing it, so a running scripts/serve keeps serving it
    PUBLIC.mkdir(exist_ok=True)
    for path in PUBLIC.iterdir():
        shutil.rmtree(path) if path.is_dir() else path.unlink()
    shutil.copytree(ROOT / "static", PUBLIC, dirs_exist_ok=True)

    contents = {}
    for e in entries:
        content = render_content(e, posts)
        contents[e["url"]] = content
        path = e["url"].strip("/")

        if e["assets"]:
            def ignore(folder, names):
                skip = {n for n in names if n in ("index.md", "index.html") or n.startswith(".")}
                if e["kind"] == "cover" and Path(folder) == e["assets"]:
                    skip |= {n for n in names if LEAFLET_PAGE.match(n)}  # the pages copy their own
                return skip
            shutil.copytree(e["assets"], PUBLIC / path, dirs_exist_ok=True, ignore=ignore)

        if e["kind"] == "page":
            body_class = "home" if e["url"] == "/" else path
            main_html = content
        elif e["kind"] == "cover":
            body_class = "leaflet-cover"
            main_html = cover_main(e, content)
        elif e["kind"] == "leaflet page":
            body_class = "leaflet-page"
            main_html = leaflet_page_main(e, content)
        else:
            body_class = "post"
            main_html = f'<h1>{esc(e["title"])}</h1>\n<p><i>{time_tag(e["date"])}</i></p>\n{content}{tag_links(e["tags"])}'
        if not e["publish"]:
            main_html = DRAFT_NOTE + main_html

        page(
            Path(path) / "index.html",
            title=SITE_TITLE if e["url"] == "/" else f"{e['title']} – {SITE_TITLE}",
            description=description_for(e, content),
            canonical=SITE_URL + e["url"],
            body_class=body_class,
            main=main_html,
            og_type="article" if e["kind"] in ("post", "leaflet page") else "website",
        )

        for alias in e["aliases"]:
            write_alias(alias, e["url"])

    page(
        "leaflets/index.html",
        title=f"Leaflets – {SITE_TITLE}",
        description=LEAFLETS_INTRO,
        canonical=SITE_URL + "/leaflets/",
        body_class="leaflets",
        main=leaflets_main(leaflets, contents),
    )

    page(
        "404.html",
        title=f"Not found – {SITE_TITLE}",
        description=SITE_DESCRIPTION,
        canonical=SITE_URL + "/404.html",
        body_class="not-found",
        main='<h1>Not found</h1>\n<p>There\'s no page here. The <a href="/blog/">blog</a> lists every post.</p>',
    )

    write_feed(newest_first({"post", "leaflet page"}), contents)
    write_sitemap([e["url"] for e in entries] + ["/leaflets/"])
    leaflet_pages = sum(len(cover["pages"]) for cover in leaflets)
    others = len(entries) - len(posts) - len(leaflets) - leaflet_pages
    unpublished = sum(not e["publish"] for e in entries)
    with_drafts = f", with {unpublished} draft{'s' * (unpublished != 1)}," if drafts else ""
    print(f"Built {len(posts)} posts, {len(leaflets)} leaflets ({leaflet_pages} pages), and {others} other pages{with_drafts} into public/")


if __name__ == "__main__":
    try:
        main(drafts="--drafts" in sys.argv[1:])
    except KeyboardInterrupt:
        sys.exit(130)  # Ctrl-C, from scripts/serve: no traceback
