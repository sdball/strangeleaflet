// <short-lived>: page 3's second widget, for "Most processes never collect
// at all". Spawns a batch of short-lived processes, after die-young.exs: each
// sums a list of 50 numbers (100 words, plus a little) in its first heap of
// 233 words and exits before the heap fills, so it never collects. This one
// is drawn, not replayed: die-young.exs and children-gcs.exs are the runs.
//
// It holds a static fallback (what feed readers and no-JS visitors see) and
// replaces it once this module runs. Readers who prefer reduced motion get
// the heaps filled at once, without the animation.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const FIRST_HEAP = 233; // words
const BATCH = 12;
const USED = 110; // words, about
const LIFE = 900; // ms on screen, not to scale: really a few µs

const number = (n) => n.toLocaleString("en-US");

document.head.insertAdjacentHTML("beforeend", `<style>
  short-lived:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }
  short-lived .title {
    margin: 0;
    font-family: var(--type);
    font-size: 1.1rem;
    font-weight: 700;
  }
  short-lived .note {
    margin: .3rem 0 .75rem;
    font-size: .95rem;
  }
  short-lived button {
    min-height: 44px;
    padding: .35rem .8rem;
    font: inherit;
    font-family: var(--type);
    font-size: .9rem;
    font-weight: 700;
    color: var(--ink);
    background: var(--bg);
    border: 1.5px solid var(--brass);
    border-radius: var(--radius);
    cursor: pointer;
  }
  short-lived button:disabled {
    cursor: default;
    opacity: .5;
  }
  short-lived button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  /* A batch is always two rows of six, at any width, so the box is two
     rows tall whether it's filled or not */
  short-lived .tiles {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 3.6rem));
    grid-auto-rows: 2.4rem;
    gap: .35rem;
    height: calc(2 * 2.4rem + .35rem);
    margin-top: .75rem;
  }
  short-lived .tile {
    padding: .2rem;
    font-family: var(--code);
    font-size: .7rem;
    line-height: 1.3;
    text-align: center;
    border: 1.5px solid var(--line);
    border-radius: 4px;
    transition: opacity .3s;
  }
  short-lived .tile.gone {
    opacity: 0;
  }
  short-lived .bar {
    position: relative;
    display: block;
    height: .5rem;
    margin-top: .15rem;
    border: 1.5px solid var(--line);
    border-radius: 3px;
    overflow: hidden;
  }
  short-lived .bar i {
    position: absolute;
    inset: 0 auto 0 0;
    width: 0;
    background: var(--code-string);
  }
  short-lived .count {
    margin: .4rem 0 0;
    font-family: var(--type);
    font-size: .85rem;
  }
  @media (prefers-reduced-motion: reduce) {
    short-lived .tile {
      transition: none;
    }
  }
</style>`);

customElements.define("short-lived", class extends HTMLElement {
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    this.innerHTML = `
      <p class="title">Processes that never collect</p>
      <p class="note">Each one sums a list of 50 numbers, which fits in a new process's first heap of 233 words, and exits before the heap fills. The bar is its heap. Not to scale: each really lives a few microseconds.</p>
      <button type="button">Spawn ${BATCH} short-lived processes</button>
      <div class="tiles" aria-hidden="true"></div>
      <p class="count" aria-live="polite"></p>`;
    this.done = 0;
    this.next = 1;
    this.querySelector("button").addEventListener("click", () => this.spawn());
    this.render();
  }

  // A batch at a time. A finished tile fades but keeps its place until the
  // whole batch is done, so the others don't shift.
  spawn() {
    const tiles = this.querySelector(".tiles");
    const button = this.querySelector("button");
    const instant = reducedMotion.matches;
    const width = `${(USED / FIRST_HEAP) * 100}%`;
    button.disabled = true;
    let left = BATCH;
    for (let i = 0; i < BATCH; i++) {
      const tile = document.createElement("span");
      tile.className = "tile";
      tile.innerHTML = `P${number(this.next++)}<span class="bar"><i></i></span>`;
      tiles.append(tile);
      const fill = tile.querySelector("i");
      const finish = () => {
        tile.classList.add("gone");
        this.done++;
        this.render();
        if (--left === 0) {
          setTimeout(() => {
            tiles.replaceChildren();
            button.disabled = false;
          }, instant ? 0 : 300);
        }
      };
      if (instant) {
        fill.style.width = width;
        setTimeout(finish, 600);
      } else {
        const delay = i * 60;
        fill.animate([{ width: "0%" }, { width }], { duration: LIFE * 0.7, delay, fill: "forwards", easing: "linear" });
        setTimeout(finish, delay + LIFE);
      }
    }
  }

  render() {
    const text = `Finished: ${number(this.done)}. Garbage collections: 0. Each heap is freed whole when its process ends.`;
    const count = this.querySelector(".count");
    if (count.textContent !== text) count.textContent = text;
  }
});
