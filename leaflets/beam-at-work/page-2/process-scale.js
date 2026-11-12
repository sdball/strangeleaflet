// <process-scale>: page 2's scale bar. An idle operating system process and a
// new BEAM process drawn to the same scale, split into their parts, with the
// real sizes measured on the page: vmmap's dirty memory for `sleep` (memory
// that process wrote to, its own), and :erlang.process_info/2 for the BEAM
// process. Pick a part to see it on the bar and read what it is. A second
// scale zooms in until the BEAM process fills the width.
//
// It holds a static fallback (what feed readers and no-JS visitors see) and
// replaces it once this module runs. Nothing moves except the bars' widths
// when the scale changes, and not that for readers who prefer reduced motion.

const KB = 1024;

// vmmap -summary on an idle /bin/sleep, the DIRTY column, grouped.
const OS_PARTS = [
  {
    id: "os-stack", name: "Stack", bytes: 32 * KB, color: "--code-function",
    about: "The main thread's stack. The system reserves 8 MB of address space for it, but `sleep` has only written to 32 KB.",
  },
  {
    id: "os-heap", name: "Heap", bytes: (208 + 16 + 32 + 32) * KB, color: "--code-string",
    about: "Memory the C library's allocator hands out, and the allocator's own bookkeeping. Most of this (208 KB) is the bookkeeping.",
  },
  {
    id: "os-libs", name: "Libraries' data", bytes: (37 + 131 + 61 + 27 + 32) * KB + 1104, color: "--code-number",
    about: "The writable data of the shared libraries every program loads, copied for this process as it changes. The libraries' code is shared with every other program, so it isn't counted here.",
  },
  {
    id: "os-pages", name: "Kernel's page tables", bytes: 161 * KB, color: "--code-keyword",
    about: "The operating system's map of the memory this process may touch, which the CPU checks on every access. This is the wall from the table above, and it costs memory too.",
  },
  {
    id: "os-other", name: "Other", bytes: (32 + 16 + 16) * KB, color: "--code-comment",
    about: "Smaller pieces: a region of shared memory (32 KB), the dynamic loader's own memory (16 KB), and a kernel allocation (16 KB).",
  },
];

// :erlang.process_info/2 on a new process: memory 2616 bytes, heap_size 233
// words (the heap includes the stack), stack_size 1 word. 8-byte words.
const BEAM_PARTS = [
  {
    id: "beam-heap", name: "Heap and stack", bytes: 233 * 8, color: "--code-string",
    about: "233 words where the process keeps its data. The stack shares the same block, and a new process's stack is 1 word. Both grow when the process needs more (page 3).",
  },
  {
    id: "beam-record", name: "The BEAM's record of it", bytes: 94 * 8, color: "--code-keyword",
    about: "The other 94 words: what process_info calls the process's internal structures, the BEAM's own record of it. The BEAM's version of the operating system's bookkeeping, at a fraction of the size.",
  },
];

const total = (parts) => parts.reduce((sum, p) => sum + p.bytes, 0);
const OS_TOTAL = total(OS_PARTS);
const BEAM_TOTAL = total(BEAM_PARTS);
const RATIO = Math.floor(OS_TOTAL / BEAM_TOTAL);

const number = (n) => n.toLocaleString("en-US");
const size = (bytes) => (bytes >= KB * 10 ? `${number(Math.round(bytes / KB))} KB` : `${number(bytes)} bytes`);
const code = (text) => text.replace(/`([^`]+)`/g, "<code>$1</code>");

document.head.insertAdjacentHTML("beforeend", `<style>
  process-scale:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }
  process-scale .choices {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .35rem;
    margin: 0 0 1rem;
    padding: 0;
    border: 0;
  }
  process-scale .choices legend {
    float: left;
    margin-right: .25rem;
    padding: 0;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  process-scale .choices label,
  process-scale .part {
    font: inherit;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--ink);
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  process-scale .choices label {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: .35rem .8rem;
  }
  process-scale .choices label:has(:checked) {
    border-color: var(--brass);
    background: var(--tint);
  }
  process-scale .choices input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
  }
  process-scale .choices label:has(:focus-visible),
  process-scale .part:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  process-scale .row + .row {
    margin-top: 1.5rem;
  }
  process-scale .row-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 1rem;
    margin-bottom: .3rem;
    font-family: var(--type);
    font-size: .9rem;
  }
  process-scale .row-head b {
    font-weight: 700;
  }
  process-scale .track {
    position: relative;
    height: 2.25rem;
    overflow: hidden;
    border-radius: 3px;
    background: repeating-linear-gradient(-45deg, transparent 0 6px, var(--tint) 6px 12px);
  }
  process-scale .bar {
    display: flex;
    height: 100%;
    min-width: 3px;
    transition: width .5s ease;
  }
  process-scale .seg {
    height: 100%;
    background: var(--c);
    transition: opacity .2s;
  }
  process-scale .seg + .seg {
    box-shadow: inset 1.5px 0 0 var(--bg);
  }
  process-scale[data-picked] .seg:not(.picked) {
    opacity: .3;
  }
  process-scale .runs-on {
    position: absolute;
    top: 50%;
    right: .5rem;
    transform: translateY(-50%);
    padding: .1rem .4rem;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--ink);
    background: var(--bg);
    border-radius: 3px;
  }
  process-scale .pointer {
    margin: .3rem 0 0;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  process-scale .parts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: .5rem;
    margin: .75rem 0 0;
    padding: 0;
    list-style: none;
  }
  process-scale .parts li {
    margin: 0;
  }
  process-scale .part {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0 .5rem;
    align-items: baseline;
    width: 100%;
    min-height: 44px;
    padding: .45rem .65rem;
    text-align: left;
  }
  process-scale .part[aria-pressed="true"] {
    border-color: var(--brass);
    background: var(--tint);
  }
  process-scale .swatch {
    width: .8rem;
    height: .8rem;
    border-radius: 2px;
    background: var(--c);
  }
  process-scale .part small {
    grid-column: 2;
    color: var(--muted);
  }
  process-scale .caption {
    min-height: 3em;
    margin: 1rem 0 0;
  }
  @media (prefers-reduced-motion: reduce) {
    process-scale .bar,
    process-scale .seg {
      transition: none;
    }
  }
</style>`);

customElements.define("process-scale", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const swatch = (p) => `style="--c: var(${p.color})"`;
    const segs = (parts) => parts.map((p) => `<span class="seg" data-part="${p.id}" ${swatch(p)}></span>`).join("");
    const buttons = (parts) => parts.map((p) => `
      <li><button type="button" class="part" data-part="${p.id}" aria-pressed="false">
        <span class="swatch" ${swatch(p)}></span><span>${p.name}</span><small>${size(p.bytes)}</small>
      </button></li>`).join("");

    this.innerHTML = `
      <fieldset class="choices">
        <legend>Scale</legend>
        <label><input type="radio" name="scale" value="same" checked> Same scale</label>
        <label><input type="radio" name="scale" value="zoom"> Zoomed in ${RATIO}×</label>
      </fieldset>
      <div class="row">
        <div class="row-head"><span>An idle operating system process (<code>sleep</code>)</span><b>${size(OS_TOTAL)}</b></div>
        <div class="track"><div class="bar os" role="img">${segs(OS_PARTS)}</div><span class="runs-on" hidden></span></div>
        <ul class="parts" aria-label="Parts of the operating system process">${buttons(OS_PARTS)}</ul>
      </div>
      <div class="row">
        <div class="row-head"><span>A new BEAM process</span><b>${number(BEAM_TOTAL)} bytes</b></div>
        <div class="track"><div class="bar beam" role="img">${segs(BEAM_PARTS)}</div></div>
        <p class="pointer"></p>
        <ul class="parts" aria-label="Parts of the BEAM process">${buttons(BEAM_PARTS)}</ul>
      </div>
      <p class="caption" aria-live="polite"></p>`;

    this.osBar = this.querySelector(".bar.os");
    this.beamBar = this.querySelector(".bar.beam");
    this.runsOn = this.querySelector(".runs-on");
    this.pointer = this.querySelector(".pointer");
    this.caption = this.querySelector(".caption");

    for (const [bar, parts] of [[this.osBar, OS_PARTS], [this.beamBar, BEAM_PARTS]]) {
      const sum = total(parts);
      for (const p of parts) bar.querySelector(`[data-part="${p.id}"]`).style.width = `${(p.bytes / sum) * 100}%`;
    }

    const group = `scale-${Math.random().toString(36).slice(2)}`;
    this.querySelectorAll("input[name=scale]").forEach((input) => {
      input.name = group;
      input.addEventListener("change", () => this.scale(input.value));
    });
    this.querySelectorAll(".part").forEach((button) => {
      button.addEventListener("click", () => this.pick(button.dataset.part));
    });
    this.scale("same");
    this.pick(null);
  }

  scale(mode) {
    const zoom = mode === "zoom";
    // Zoomed, the operating system process runs RATIO widths off the edge, so
    // only the start of its stack shows.
    this.osBar.style.width = zoom ? `${(OS_TOTAL / BEAM_TOTAL) * 100}%` : "100%";
    this.beamBar.style.width = zoom ? "100%" : `${(BEAM_TOTAL / OS_TOTAL) * 100}%`;
    this.runsOn.hidden = !zoom;
    this.runsOn.textContent = `and on, ${RATIO} times this width`;
    this.osBar.setAttribute("aria-label", zoom
      ? `The operating system process, far wider than the view: ${RATIO} times the BEAM process`
      : `The operating system process, ${size(OS_TOTAL)}, the full width`);
    this.beamBar.setAttribute("aria-label", zoom
      ? `The BEAM process, ${number(BEAM_TOTAL)} bytes, the full width`
      : `The BEAM process, ${number(BEAM_TOTAL)} bytes, a sliver`);
    this.pointer.textContent = zoom
      ? "Now the BEAM process fills the width. At this scale, all you can see of the operating system process is the start of its stack."
      : `That sliver is it. The operating system process's memory would hold ${RATIO} of them.`;
  }

  pick(id) {
    const all = [...OS_PARTS, ...BEAM_PARTS];
    const part = all.find((p) => p.id === id && p.id !== this.picked);
    this.picked = part?.id;
    this.toggleAttribute("data-picked", Boolean(part));
    this.querySelectorAll(".part").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.part === this.picked)));
    this.querySelectorAll(".seg").forEach((s) => s.classList.toggle("picked", s.dataset.part === this.picked));
    if (!part) {
      this.caption.textContent = "Pick a part to see where it sits and what it is.";
      return;
    }
    const whose = OS_PARTS.includes(part) ? "the operating system process" : "the BEAM process";
    this.caption.innerHTML = `<b>${part.name}</b>, ${size(part.bytes)} of ${whose}. ${code(part.about)}`;
  }
});
