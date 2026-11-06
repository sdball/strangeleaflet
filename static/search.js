// Search every post and leaflet page, on /blog/ above the full list.
//
//   <post-search></post-search>
//   <script type="module" src="/search.js"></script>
//
// The build writes /search.json: each post, leaflet cover, and leaflet page
// with its title, tags, description, and text. It's fetched the first time
// the box gets focus (or right away for a /blog/?search= link). Every word
// typed must appear somewhere in an entry; matches in the title rank above
// tags and the description, and those above the text and code. An excerpt
// shows where it matched, from the prose when it can. While there's a
// search, its results take the place of the list (and of a ?q= tag filter,
// which comes back when the search is cleared).
//
// Without this module (no JS, feed readers) the element is empty: no box
// that can't search.

const INDEX = "/search.json";
const PARAM = "search";

document.head.insertAdjacentHTML("beforeend", `<style>
  post-search:defined {
    display: block;
    margin: 1.5rem 0 0;
  }
  post-search:defined label {
    display: block;
    margin-bottom: .35rem;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  post-search:defined input {
    width: 100%;
    min-height: 44px;
    padding: .4rem .75rem;
    font-family: var(--type);
    color: var(--ink);
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
  }
  post-search:defined input:focus-visible {
    border-color: var(--brass);
    outline-offset: 0;
  }
  post-search:defined .search-status {
    min-height: 1.65em;
    margin: .5rem 0 0;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  post-search:defined .search-results li > p {
    flex: 1 1 100%;
    margin: .2rem 0 0;
    font-size: .9rem;
    line-height: 1.5;
    color: var(--muted);
  }
  @media (min-width: 600px) {
    post-search:defined .search-results li > p {
      padding-left: 8.5rem;
    }
  }
  post-search:defined .search-results li > span small {
    display: block;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  post-search:defined mark:not(.draft) {
    color: inherit;
    background: var(--selection);
    border-radius: 2px;
  }
  .searching .blog-posts:not(.search-results),
  .searching .tag-filter {
    display: none !important;
  }
</style>`);

// Words typed, each matched at the start of a word: "art" finds "artist", not "start"
const words = (query) => [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
const escape = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matcher = (terms, flags = "") => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${terms.map(escape).join("|")})`, "u" + flags);

function prepare(entry) {
  return { ...entry, tagText: entry.tags.join(" ") };
}

function count(text, term) {
  return Math.min(5, (text.match(matcher([term], "gi")) || []).length);
}

// Every word somewhere, or no score
function score(entry, terms) {
  let total = 0;
  for (const term of terms) {
    const word = matcher([term], "i");
    const s =
      (word.test(entry.title) ? 10 : 0) +
      (entry.tags.some((t) => t.toLowerCase() === term) ? 6 : word.test(entry.tagText) ? 3 : 0) +
      (word.test(entry.description) ? 3 : 0) +
      count(entry.text, term) +
      count(entry.code, term);
    if (!s) return 0;
    total += s;
  }
  return total;
}

// A stretch around the first word found, from the prose if it's there, cut at spaces
function excerpt(entry, terms) {
  const found = matcher(terms, "i");
  const text = [entry.text, entry.code].find((t) => found.test(t));
  if (!text) return entry.description || entry.text.slice(0, 160);
  const at = text.search(found);
  let start = Math.max(0, at - 60);
  let end = Math.min(text.length, at + 140);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(" ", end) > at ? text.lastIndexOf(" ", end) : end;
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

// The text with each word marked, as nodes (never as HTML)
function highlighted(text, terms) {
  const parts = text.split(new RegExp(`(${matcher(terms).source})`, "giu"));
  return parts.map((part, i) => {
    if (i % 2 === 0) return document.createTextNode(part);
    const mark = document.createElement("mark");
    mark.textContent = part;
    return mark;
  });
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

class PostSearch extends HTMLElement {
  connectedCallback() {
    if (this.input) return;
    this.input = el("input", { type: "search", id: "post-search", name: PARAM, autocomplete: "off", spellcheck: false });
    this.status = el("p", { className: "search-status" });
    this.status.setAttribute("role", "status");
    this.results = el("ul", { className: "blog-posts search-results", hidden: true });
    this.append(
      el("form", { role: "search", onsubmit: (e) => e.preventDefault() },
        el("label", { htmlFor: "post-search" }, "Search posts and leaflets"),
        this.input),
      this.status,
      this.results,
    );
    this.input.addEventListener("focus", () => this.load(), { once: true });
    this.input.addEventListener("input", () => this.run());

    const query = new URLSearchParams(location.search).get(PARAM);
    if (query) {
      this.input.value = query;
      this.run();
    }
  }

  load() {
    this.entries ??= fetch(INDEX)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((all) => all.map(prepare))
      .catch(() => {
        this.status.textContent = "Search couldn't load. The list below still has every post.";
        this.entries = null;
        document.body.classList.remove("searching");
        this.results.hidden = true;
        return null;
      });
    return this.entries;
  }

  async run() {
    const query = this.input.value.trim();
    const url = new URL(location.href);
    query ? url.searchParams.set(PARAM, query) : url.searchParams.delete(PARAM);
    history.replaceState(history.state, "", url);

    const terms = words(query);
    document.body.classList.toggle("searching", terms.length > 0);
    if (!terms.length) {
      this.results.hidden = true;
      this.status.textContent = "";
      return;
    }

    if (!Array.isArray(this.entries)) this.status.textContent = "Loading…";
    const entries = await this.load();
    if (!entries || this.input.value.trim() !== query) return; // failed, or the reader kept typing
    this.entries = entries;

    const found = entries
      .map((entry) => ({ entry, score: score(entry, terms) }))
      .filter((f) => f.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date));

    this.results.replaceChildren(...found.map(({ entry }) => {
      const time = el("time", { dateTime: entry.date }, entry.day);
      const when = el("span", {}, el("i", {}, time));
      if (entry.kind !== "post") when.append(el("small", {}, entry.kind));
      const li = el("li", {},
        when,
        el("a", { href: entry.url }, ...highlighted(entry.title, terms)));
      if (entry.draft) li.append(" ", el("mark", { className: "draft" }, "draft"));
      li.append(el("p", {}, ...highlighted(excerpt(entry, terms), terms)));
      return li;
    }));
    this.results.hidden = found.length === 0;
    const n = found.length;
    this.status.textContent = n === 0 ? `Nothing matches “${query}”.` : `${n} ${n === 1 ? "match" : "matches"} for “${query}”`;
  }
}

customElements.define("post-search", PostSearch);
