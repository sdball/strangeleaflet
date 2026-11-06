// The same code in several languages, one at a time, with a picker. A
// language can have more than one block (code, then its output).
//
//   <code-choice>
//
//   ```elixir
//   ...
//   ```
//
//   ```python
//   ...
//   ```
//
//   </code-choice>
//
// The build marks each block with data-lang and gives the element
// data-default, the post's code_language. That language shows until the reader
// picks another; their pick is remembered (on every post) and every
// <code-choice> on the page follows it. A choice without the picked language
// shows its default.
//
// Without this module (no JS) every block shows, each tagged with its language
// by theme.css. The feed has only the default's block.

const KEY = "code-language";
const NAMES = { elixir: "Elixir", javascript: "JavaScript", js: "JavaScript", python: "Python", ruby: "Ruby", go: "Go", typescript: "TypeScript", rust: "Rust" };
const langName = (lang) => NAMES[lang] ?? lang[0].toUpperCase() + lang.slice(1);

// localStorage throws when it's turned off; the choice just isn't remembered then
const remembered = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
const remember = (lang) => {
  try { localStorage.setItem(KEY, lang); } catch { /* not remembered */ }
};

document.head.insertAdjacentHTML("beforeend", `<style>
  code-choice:defined {
    display: block;
    margin: 1.75rem 0;
  }
  code-choice:defined > .highlight {
    margin: 0;
  }
  code-choice:defined > .highlight[hidden] {
    display: none;
  }
  code-choice:defined > .highlight:not([hidden]) ~ .highlight:not([hidden]) {
    margin-top: .75rem;
  }
  code-choice fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: .4rem;
    margin: 0 0 .5rem;
    padding: 0;
    border: 0;
  }
  code-choice legend {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  code-choice label {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 .85rem;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  code-choice label:has(:checked) {
    color: var(--ink);
    border-color: var(--brass);
    background: var(--tint);
  }
  code-choice label:has(:focus-visible) {
    outline: 2px solid var(--brass);
    outline-offset: 2px;
  }
  code-choice input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
</style>`);

let ids = 0;

customElements.define("code-choice", class extends HTMLElement {
  connectedCallback() {
    this.blocks = [...this.querySelectorAll(":scope > .highlight[data-lang]")];
    const langs = [...new Set(this.blocks.map((block) => block.dataset.lang))];
    if (langs.length < 2 || this.querySelector(":scope > fieldset")) return;
    const group = `code-choice-${++ids}`;
    const picker = document.createElement("fieldset");
    picker.innerHTML = `<legend>Code language</legend>` + langs
      .map((lang) => `<label><input type="radio" name="${group}" value="${lang}">${langName(lang)}</label>`)
      .join("");
    this.prepend(picker);

    picker.addEventListener("change", (event) => {
      const lang = event.target.value;
      remember(lang);
      // Blocks above change height too; keep this picker where the reader is looking
      const before = this.getBoundingClientRect().top;
      for (const choice of document.querySelectorAll("code-choice")) choice.show?.(lang);
      scrollBy(0, this.getBoundingClientRect().top - before);
    });

    this.show(remembered() ?? this.dataset.default);
  }

  show(lang) {
    const has = (l) => this.blocks.some((block) => block.dataset.lang === l);
    const pick = [lang, this.dataset.default].find(has) ?? this.blocks[0].dataset.lang;
    for (const block of this.blocks) block.hidden = block.dataset.lang !== pick;
    for (const input of this.querySelectorAll(":scope > fieldset input")) input.checked = input.value === pick;
  }
});

// Another tab picked a language
addEventListener("storage", (event) => {
  if (event.key !== KEY || !event.newValue) return;
  for (const choice of document.querySelectorAll("code-choice")) choice.show?.(event.newValue);
});
