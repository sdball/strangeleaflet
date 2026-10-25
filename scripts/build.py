"""Build public/ from posts/, pages/, static/ and templates/.

Each post or page is Bear's export format: a `---` frontmatter block, then
markdown. It can also be HTML (`.html`), which is used as-is. A post that
lives in a directory (`posts/<slug>/index.md`) has every other file in that
directory copied beside its page, so images and scripts can be referenced by
bare filename.
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

def find_sources(folder):
    for path in sorted(folder.iterdir()):
        if path.is_dir():
            yield from (path / name for name in ("index.md", "index.html") if (path / name).exists())
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


def load(path, folder, is_page):
    text = path.read_text()
    if not text.startswith("---\n"):
        sys.exit(f"{path.relative_to(ROOT)}: missing frontmatter")
    _, head, body = text.split("---\n", 2)
    meta = {}
    for line in head.splitlines():
        if line.strip():
            key, _, value = line.partition(":")
            meta[key.strip()] = frontmatter_value(value)

    slug = meta.get("slug", "").strip("/")
    published = meta.get("published_date")
    return {
        "source": path,
        "assets": path.parent if path.parent != folder else None,
        "is_page": is_page,
        "title": meta.get("title", ""),
        "slug": slug,
        "url": f"/{slug}/" if slug else "/",
        "date": datetime.fromisoformat(published) if published else None,
        "tags": [t.strip() for t in meta.get("tags", "").split(",") if t.strip()],
        "aliases": [a.strip().strip("/") for a in meta.get("alias", "").split(",") if a.strip()],
        "publish": meta.get("publish", "true") != "false",
        "description": meta.get("meta_description", ""),
        "body": body,
        "is_html": path.suffix == ".html",
    }


# Pieces of markup shared by the pages

def esc(text):
    return html.escape(text, quote=True)


def time_tag(date):
    utc = date.astimezone(timezone.utc)
    return f'<time datetime="{utc:%Y-%m-%dT%H:%MZ}">{utc:%d %b, %Y}</time>'


def tag_href(tag):
    return f"/blog/?q={quote(tag)}"


def post_list(posts, embedded=False):
    css = "embedded blog-posts" if embedded else "blog-posts"
    items = "\n".join(
        f'<li data-tags="{esc(",".join(p["tags"]))}"><span><i>{time_tag(p["date"])}</i></span>'
        f'<a href="{p["url"]}">{esc(p["title"])}</a></li>'
        for p in posts
    )
    return f'<ul class="{css}">\n{items}\n</ul>'


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
    body = expand_embeds(entry["body"], posts) if entry["is_page"] else entry["body"]
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
    entries = []
    for p in posts[:FEED_SIZE]:
        url = SITE_URL + p["url"]
        content = absolute_urls(contents[p["url"]], p["url"])
        categories = "".join(f'\n    <category term="{esc(t)}"/>' for t in p["tags"])
        entries.append(f"""  <entry>
    <id>{url}</id>
    <title>{esc(p["title"])}</title>
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


def write_sitemap(entries):
    urls = "\n".join(f"  <url><loc>{SITE_URL}{e['url']}</loc></url>" for e in entries)
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

def main():
    entries = []
    for name, is_page in (("posts", False), ("pages", True)):
        folder = ROOT / name
        entries += [load(p, folder, is_page) for p in find_sources(folder)]
    entries = [e for e in entries if e["publish"]]

    seen = {}
    for e in entries:
        if not e["is_page"] and not e["date"]:
            # .githooks/pre-commit adds the date in the commit that publishes a post
            if os.environ.get("CI"):
                sys.exit(f"{e['source'].relative_to(ROOT)}: posts need a published_date")
            e["date"] = datetime.now(timezone.utc)
            print(f"{e['source'].relative_to(ROOT)}: no published_date yet, previewing it as now")
        for url in [e["url"]] + [f"/{a}/" for a in e["aliases"]]:
            if url in seen:
                sys.exit(f"{e['source'].relative_to(ROOT)}: {url} is also used by {seen[url].relative_to(ROOT)}")
            seen[url] = e["source"]

    posts = sorted(
        (e for e in entries if not e["is_page"]),
        key=lambda p: p["date"],
        reverse=True,
    )

    # Empty public/ rather than replacing it, so a running scripts/serve keeps serving it
    PUBLIC.mkdir(exist_ok=True)
    for path in PUBLIC.iterdir():
        shutil.rmtree(path) if path.is_dir() else path.unlink()
    shutil.copytree(ROOT / "static", PUBLIC, dirs_exist_ok=True)

    contents = {}
    for e in entries:
        content = render_content(e, posts)
        contents[e["url"]] = content
        out = Path(e["slug"]) / "index.html"

        if e["assets"]:
            shutil.copytree(e["assets"], PUBLIC / e["slug"], dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns("index.md", "index.html", ".*"))

        if e["is_page"]:
            body_class = "home" if e["url"] == "/" else e["slug"]
            main_html = content
        else:
            body_class = "post"
            tags = ""
            if e["tags"]:
                links = "\n".join(f'<a rel="nofollow" href="{esc(tag_href(t))}">#{esc(t)}</a>' for t in e["tags"])
                tags = f'\n<p class="tags">\n{links}\n</p>'
            main_html = f'<h1>{esc(e["title"])}</h1>\n<p><i>{time_tag(e["date"])}</i></p>\n{content}{tags}'

        page(
            out,
            title=SITE_TITLE if e["url"] == "/" else f"{e['title']} – {SITE_TITLE}",
            description=description_for(e, content),
            canonical=SITE_URL + e["url"],
            body_class=body_class,
            main=main_html,
            og_type="website" if e["is_page"] else "article",
        )

        for alias in e["aliases"]:
            write_alias(alias, e["url"])

    page(
        "404.html",
        title=f"Not found – {SITE_TITLE}",
        description=SITE_DESCRIPTION,
        canonical=SITE_URL + "/404.html",
        body_class="not-found",
        main='<h1>Not found</h1>\n<p>There\'s no page here. The <a href="/blog/">blog</a> lists every post.</p>',
    )

    write_feed(posts, contents)
    write_sitemap(entries)
    print(f"Built {len(posts)} posts and {len(entries) - len(posts)} other pages into public/")


if __name__ == "__main__":
    main()
