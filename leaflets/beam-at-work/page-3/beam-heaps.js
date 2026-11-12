// <beam-heaps>: page 3's widget. A slowed-down replay of two real runs,
// record-gc.exs and record-gc.mjs: one builder keeping a list of 10 million
// pairs, and three tickers that tick every 10 ms and make a little garbage
// each time, like small requests. Nothing here is simulated except the
// short-lived processes at the bottom: every tick, every collection, and
// every heap size is from the recordings (beam-run.json, node-run.json).
//
// The BEAM side shows each process's own heap: the young heap and the old
// heap, each bar the size of its own block, and its collections. A
// collection with 128K words or more to go through ran on a dirty CPU
// scheduler (erl_gc.c, check_for_possibly_long_gc), so the tickers' own
// scheduler went on running them. The Node side shows V8's one heap, its
// young and old generations sampled during the run, and the stretches when
// it was collecting. Each ticker gets a strip: its ticks over the last
// stretch of the run, with how long each late one waited.
//
// It holds a static fallback (what feed readers and no-JS visitors see) and
// replaces it once this module runs. Readers who prefer reduced motion get
// it paused, with a time slider and Step.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const DATA = {
  beam: new URL("beam-run.json", import.meta.url),
  node: new URL("node-run.json", import.meta.url),
};

const WORD = 8;
const DIRTY_WORDS = 128 * 1024; // ERTS_POTENTIALLY_LONG_GC_HSIZE
const FIRST_HEAP = 233; // words
const WINDOW = 400_000; // µs of the run on a strip
const LATE = 2_000; // µs late before a tick counts as late
const LOGGED_GC = 5_000; // µs: collections at least this long get a log line
// Microseconds of the run per millisecond of watching
const SPEEDS = { "1/40": 25, "1/10": 100, "1/4": 250 };
const STEP = 5_000; // µs per press of Step
const LOG_LINES = 7; // tall enough for a few wrapped lines

// The short-lived processes, after die-young.exs: each sums a list of 50
// numbers (100 words, plus a little) in its 233-word heap and exits.
const SHORT_BATCH = 12;
const SHORT_USED = 110; // words, about
const SHORT_LIFE = 900; // ms on screen, not to scale: really a few µs

const number = (n) => n.toLocaleString("en-US");
// "1.2 / 4.8 KB": used and size in the size's unit, KB at the least
const UNITS = [["MB", 1048576], ["KB", 1024]];
const amount = (bytes, unit) => {
  const n = bytes / unit;
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 1 : 0 });
};
const usedOf = (used, total) => {
  const [name, unit] = UNITS.find(([, u]) => total >= u) ?? UNITS[1];
  return `${amount(used, unit)} / ${amount(total, unit)} ${name}`;
};
const ms = (us) => number(Math.round(us / 1000));
const size = (bytes) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString("en-US", { maximumFractionDigits: bytes >= 10485760 ? 0 : 1 })} MB`
  : bytes >= 10240 ? `${number(Math.round(bytes / 1024))} KB`
  : `${number(bytes)} bytes`;

let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  beam-heaps:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: beam-heaps / inline-size;
  }
  beam-heaps .controls,
  beam-heaps .settings {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
  }
  beam-heaps .settings {
    margin-top: .75rem;
  }
  beam-heaps button,
  beam-heaps .choices label {
    min-height: 44px;
    padding: .35rem .8rem;
    font: inherit;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--ink);
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  beam-heaps button.play {
    min-width: 5.5rem;
    border-color: var(--brass);
    font-weight: 700;
  }
  beam-heaps button:disabled {
    cursor: default;
    opacity: .5;
  }
  beam-heaps button:focus-visible,
  beam-heaps .choices label:has(:focus-visible),
  beam-heaps input[type=range]:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  beam-heaps .choices {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .35rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  beam-heaps .choices legend {
    float: left;
    margin-right: .25rem;
    padding: 0;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  beam-heaps .choices label {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-width: 44px;
    justify-content: center;
  }
  beam-heaps .choices label:has(:checked) {
    border-color: var(--brass);
    background: var(--tint);
  }
  beam-heaps .choices input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
  }
  beam-heaps .time {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: .6rem;
    margin-top: .75rem;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  beam-heaps .time input {
    width: 100%;
    min-height: 44px;
    margin: 0;
    accent-color: var(--brass);
  }
  beam-heaps .time output {
    min-width: 5.5em;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  beam-heaps .note {
    margin: .6rem 0 0;
    font-size: .9rem;
    color: var(--muted);
  }
  beam-heaps .side {
    margin-top: 1.25rem;
    padding-top: .75rem;
    border-top: 1.5px solid var(--line);
  }
  /* Wide enough: the two runs side by side, to watch at once */
  @container beam-heaps (min-width: 38rem) {
    beam-heaps .sides {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem;
    }
  }
  beam-heaps .side-title {
    margin: 0;
    font-family: var(--type);
    font-size: 1rem;
    font-weight: 700;
  }
  beam-heaps .side-note {
    margin: .15rem 0 .5rem;
    font-size: .85rem;
    color: var(--muted);
  }
  /* A fixed sentence with a badge that lights up while a collection runs.
     Only the badge changes, so nothing around it moves. */
  beam-heaps .banner {
    margin: 0 0 .4rem;
    font-family: var(--type);
    font-size: .85rem;
  }
  beam-heaps .badge {
    display: inline-block;
    margin-right: .35rem;
    padding: 0 .35rem;
    font-size: .75rem;
    font-weight: 700;
    letter-spacing: .03em;
    text-transform: uppercase;
    color: var(--muted);
    border: 1.5px solid var(--line);
    border-radius: 3px;
    opacity: .55;
    transition: opacity .15s, background-color .15s, color .15s, border-color .15s;
  }
  beam-heaps .badge.on {
    color: var(--bg);
    background: var(--brass);
    border-color: var(--brass);
    opacity: 1;
  }
  /* Every word a status can be, stacked in one spot sized to the longest,
     so changing it never moves anything */
  beam-heaps .states {
    display: inline-grid;
  }
  beam-heaps .states > span {
    grid-area: 1 / 1;
    opacity: 0;
    transition: opacity .15s;
  }
  beam-heaps .states > span.on {
    opacity: 1;
  }
  beam-heaps .states > span.busy {
    color: var(--brass);
    font-weight: 700;
  }
  beam-heaps .who {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: .15rem .6rem;
    align-items: center;
    padding: .4rem 0;
    border-top: 1px solid var(--line);
  }
  beam-heaps .who:first-of-type {
    border-top: 0;
  }
  beam-heaps .name {
    font-family: var(--code);
    font-size: .8rem;
    font-weight: 700;
  }
  beam-heaps .status {
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
    min-width: 0;
  }
  beam-heaps .heap {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 2.4rem 1fr 6.6rem;
    align-items: center;
    gap: .1rem .4rem;
    font-family: var(--type);
    font-size: .75rem;
    color: var(--muted);
  }
  beam-heaps .heap .of {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  beam-heaps .bar {
    position: relative;
    height: .8rem;
    border: 1.5px solid var(--line);
    border-radius: 3px;
    overflow: hidden;
  }
  beam-heaps .bar.none {
    border-style: dashed;
  }
  beam-heaps .bar i {
    position: absolute;
    inset: 0 auto 0 0;
    width: calc(var(--used, 0) * 100%);
    background: var(--fill);
  }
  beam-heaps .bar.young {
    --fill: var(--code-string);
  }
  beam-heaps .bar.old {
    --fill: var(--code-number);
  }
  beam-heaps .collecting .bar {
    border-color: var(--brass);
    background: repeating-linear-gradient(-45deg, transparent 0 4px, color-mix(in srgb, var(--brass) 25%, transparent) 4px 8px);
  }
  beam-heaps .strip {
    grid-column: 1 / -1;
    position: relative;
    height: 1.6rem;
    border-bottom: 1.5px solid var(--line);
    overflow: hidden;
  }
  beam-heaps .strip .gc {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--brass) 18%, transparent);
  }
  beam-heaps .strip .tick {
    position: absolute;
    bottom: 0;
    width: 2px;
    height: 45%;
    margin-left: -1px;
    background: var(--ink);
  }
  beam-heaps .strip .tick.late {
    height: 90%;
    background: var(--code-error);
  }
  beam-heaps .strip .wait {
    position: absolute;
    bottom: 0;
    height: 3px;
    background: var(--code-error);
  }
  beam-heaps .readout {
    margin: .5rem 0 0;
    border-collapse: collapse;
    font-family: var(--type);
    font-size: .8rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  beam-heaps .readout tr,
  beam-heaps .readout th,
  beam-heaps .readout td {
    border: 0;
    background: none;
  }
  beam-heaps .readout th,
  beam-heaps .readout td {
    padding: .05rem .6rem .05rem 0;
    text-align: right;
    font-weight: normal;
  }
  beam-heaps .readout th:first-child {
    text-align: left;
    color: var(--muted);
  }
  /* Wide enough for the longest values, so the columns never move */
  beam-heaps .readout :is(th, td):nth-child(2) {
    min-width: 5ch;
  }
  beam-heaps .readout :is(th, td):nth-child(3) {
    min-width: 12ch;
  }
  beam-heaps .readout thead th {
    color: var(--muted);
  }
  beam-heaps .short-count {
    margin: .4rem 0 0;
    font-family: var(--type);
    font-size: .85rem;
  }
  beam-heaps .key {
    display: flex;
    flex-wrap: wrap;
    gap: .25rem 1rem;
    margin: .75rem 0 0;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  beam-heaps .key span::before {
    content: "";
    display: inline-block;
    width: .8rem;
    height: .7rem;
    margin-right: .3rem;
    vertical-align: -.05rem;
    background: var(--swatch);
    border-radius: 2px;
  }
  beam-heaps .short {
    margin-top: 1rem;
  }
  beam-heaps .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: .35rem;
    height: 4.6rem; /* two rows of tiles, filled or not */
    overflow: hidden;
    align-content: flex-start;
    margin-top: .5rem;
  }
  beam-heaps .tile {
    width: 3.2rem;
    padding: .2rem;
    font-family: var(--code);
    font-size: .7rem;
    text-align: center;
    border: 1.5px solid var(--line);
    border-radius: 4px;
    transition: opacity .3s;
  }
  beam-heaps .tile .bar {
    height: .5rem;
    margin-top: .15rem;
  }
  beam-heaps .tile.gone {
    opacity: 0;
  }
  /* A fixed height that scrolls to the newest line */
  beam-heaps .log {
    margin: 1rem 0 0;
    padding: .5rem .65rem;
    height: calc(${LOG_LINES} * 1.45em + 1rem);
    overflow-y: auto;
    font-family: var(--code);
    font-size: .8rem;
    line-height: 1.45;
    background: var(--code-bg);
    color: var(--code-ink);
    border-radius: var(--radius);
  }
  beam-heaps .log div {
    white-space: pre-wrap;
  }
  @media (prefers-reduced-motion: reduce) {
    beam-heaps .tile,
    beam-heaps .badge,
    beam-heaps .states > span {
      transition: none;
    }
  }
</style>`);

// A BEAM process's heaps at time t, from its traced collections. Between
// collections the young heap fills at a steady rate (the recording only has
// its size at each collection); during one, the sizes are as it began.
function beamHeap(gcs, t, start) {
  let since = start;
  let after = [0, FIRST_HEAP, 0, 0];
  for (const gc of gcs) {
    const [, from, to, before] = gc;
    if (t < from) {
      const f = Math.min(1, Math.max(0, (t - since) / (from - since)));
      return { young: after[0] + (before[0] - after[0]) * f, block: after[1], old: after[2], oldBlock: after[3], gc: null };
    }
    if (t < to) return { young: before[0], block: before[1], old: before[2], oldBlock: before[3], gc };
    since = to;
    after = gc[4];
  }
  return { young: after[0], block: after[1], old: after[2], oldBlock: after[3], gc: null };
}

// What a BEAM collection had to go through, as erl_gc.c counts it (less the
// stack, a few words here): the young heap, and for a major one the old heap.
const toGoThrough = ([kind, , , before]) => before[0] + (kind === "major" ? before[2] : 0);
const dirty = (gc) => toGoThrough(gc) >= DIRTY_WORDS;

const during = (ticks, from, to) => ticks.filter(([due, late]) => due < to && due + late > from);
const worstLate = (ticks) => Math.max(0, ...ticks.map(([, late]) => late));

customElements.define("beam-heaps", class extends HTMLElement {
  async connectedCallback() {
    if (this.started) return;
    this.started = true;
    let beam, node;
    try {
      [beam, node] = await Promise.all([DATA.beam, DATA.node].map((url) => fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        return r.json();
      })));
    } catch (error) {
      console.error("beam-heaps: couldn't load the recordings", error);
      return; // the static fallback stays
    }
    this.beam = beam;
    this.node = node;
    this.build();
  }

  build() {
    const { beam, node } = this;
    const id = `beam-heaps-${++ids}`;
    this.end = Math.max(...beam.tickers.flatMap((t) => t.ticks.map(([due]) => due)), ...node.tickers.flatMap((t) => t.ticks.map(([due]) => due)));
    this.events = this.logEvents();

    const speeds = Object.keys(SPEEDS).map((value) =>
      `<label><input type="radio" name="${id}-speed" value="${value}"${value === "1/10" ? " checked" : ""}> ${value}</label>`).join("");
    const tickerRows = (side) => side.tickers.map((_, i) => `
      <div class="who" data-ticker="${i}">
        <span class="name">ticker ${i + 1}</span>${states(side === beam ? ["ticking"] : ["ticking", "paused"])}
        ${side === beam ? heapRows() : ""}
        <div class="strip" aria-hidden="true"></div>
      </div>`).join("");
    const states = (words) => `<span class="status states">${words.map((w) => `<span data-state="${w}">${w}</span>`).join("")}</span>`;
    const readout = (who) => `
      <table class="readout ${who}-readout">
        <thead><tr><th></th><th>ticks</th><th>worst</th></tr></thead>
        <tbody>
          <tr class="all"><th>so far</th><td></td><td></td></tr>
          <tr class="gc"><th>while collecting</th><td></td><td></td></tr>
        </tbody>
      </table>`;
    const heapRows = () => `
      <div class="heap">
        <span>young</span><span class="bar young"><i></i></span><span class="of young-of"></span>
        <span>old</span><span class="bar old"><i></i></span><span class="of old-of"></span>
      </div>`;

    this.innerHTML = `
      <div class="controls">
        <button type="button" class="play"></button>
        <button type="button" class="step">Step</button>
        <button type="button" class="restart">Restart</button>
      </div>
      <div class="settings">
        <fieldset class="choices"><legend>Speed</legend>${speeds}</fieldset>
      </div>
      <label class="time"><span>Time in the run</span>
        <input type="range" min="0" max="${this.end}" step="${STEP}" value="0">
        <output></output>
      </label>
      <p class="note">A replay of two real runs, slowed down: <a href="record-gc.exs">record-gc.exs</a> on ${beam.versions} with ${beam.schedulers} schedulers, and <a href="record-gc.mjs">record-gc.mjs</a> on ${node.versions}, on the same M1. Each builds a list of 10 million pairs, starting half a second in, while three tickers tick every 10 ms.</p>

      <div class="sides">
      <section class="side beam-side" aria-label="BEAM">
        <p class="side-title">BEAM: every process has its own heap</p>
        <p class="side-note">Each bar is one heap block, drawn the same width whatever its size.</p>
        <p class="banner beam-banner"><span class="badge" aria-hidden="true">collecting</span>When the builder collects, it's on a dirty CPU scheduler, and the tickers run on.</p>
        <div class="who builder">
          <span class="name">builder</span>${states(["waiting", "building", "collecting", "done"])}
          ${heapRows()}
        </div>
        ${tickerRows(beam)}
        ${readout("beam")}
      </section>

      <section class="side node-side" aria-label="Node">
        <p class="side-title">Node: one heap for all of its JavaScript</p>
        <p class="side-note">V8's young and old generations, as sampled during the run.</p>
        <p class="banner node-banner"><span class="badge" aria-hidden="true">collecting</span>When V8 collects, no JavaScript runs, not even a ticker.</p>
        <div class="who heap-row">
          <span class="name">heap</span>
          <div class="heap">
            <span>young</span><span class="bar young"><i></i></span><span class="of young-of"></span>
            <span>old</span><span class="bar old"><i></i></span><span class="of old-of"></span>
          </div>
        </div>
        <div class="who builder">
          <span class="name">builder</span>${states(["waiting", "building", "paused", "done"])}
        </div>
        ${tickerRows(node)}
        ${readout("node")}
      </section>
      </div>

      <div class="key" aria-hidden="true">
        <span style="--swatch: var(--code-string)">young heap in use</span>
        <span style="--swatch: var(--code-number)">old heap in use</span>
        <span style="--swatch: color-mix(in srgb, var(--brass) 35%, transparent)">a collection running (the BEAM: the builder's)</span>
        <span style="--swatch: var(--ink)">a tick</span>
        <span style="--swatch: var(--code-error)">a late tick, and how long it waited</span>
      </div>

      <section class="side short" aria-label="Short-lived processes">
        <p class="side-title">Processes that never collect</p>
        <p class="side-note">Like die-young.exs: each sums a list of 50 numbers in its 233-word heap and exits. Not to scale: each really lives a few microseconds.</p>
        <button type="button" class="spawn">Spawn ${SHORT_BATCH} short-lived processes</button>
        <div class="tiles" aria-hidden="true"></div>
        <p class="short-count" aria-live="polite"></p>
      </section>

      <div class="log" role="log" aria-live="polite" aria-label="What happened, newest last"></div>`;

    this.$ = (selector) => this.querySelector(selector);
    this.speed = SPEEDS["1/10"];
    this.playing = !reducedMotion.matches;
    this.visible = false;
    this.t = 0;
    this.shortDone = 0;
    this.shortNext = 1;
    this.logged = -1;

    this.$(".play").addEventListener("click", () => {
      if (!this.playing && this.t >= this.end) this.seek(0);
      this.setPlaying(!this.playing);
    });
    this.$(".step").addEventListener("click", () => this.seek(this.t + STEP));
    this.$(".restart").addEventListener("click", () => this.seek(0));
    this.$(".time input").addEventListener("input", (e) => {
      this.setPlaying(false);
      this.seek(Number(e.target.value));
    });
    this.$(".settings").addEventListener("change", (e) => {
      this.speed = SPEEDS[e.target.value];
    });
    this.$(".spawn").addEventListener("click", () => this.spawnShort());
    this.onMotion = () => reducedMotion.matches && this.setPlaying(false);
    reducedMotion.addEventListener("change", this.onMotion);

    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.loop();
    });
    this.observer.observe(this);

    this.renderShort();
    this.seek(0);
    this.setPlaying(this.playing);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    reducedMotion.removeEventListener("change", this.onMotion);
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  // The log's lines, worked out from the recordings up front
  logEvents() {
    const { beam, node } = this;
    const events = [];
    const beamTicks = beam.tickers.flatMap((t) => t.ticks);
    const nodeTicks = node.tickers.flatMap((t) => t.ticks);
    events.push({ at: beam.builder.started, text: "Both builders start." });
    for (const gc of beam.builder.gcs) {
      const [kind, from, to] = gc;
      if (to - from < LOGGED_GC) continue;
      const ticks = during(beamTicks, from, to);
      events.push({
        at: to,
        text: `BEAM: the builder's ${kind} collection, ${size(toGoThrough(gc) * WORD)} to go through${dirty(gc) ? " on a dirty CPU scheduler" : ""}, took ${ms(to - from)} ms. ` +
          `${ticks.length} ticks meanwhile, the worst ${ms(worstLate(ticks))} ms late.`,
      });
    }
    for (const [kind, from, to] of node.gcs) {
      if (to - from < LOGGED_GC) continue;
      const ticks = during(nodeTicks, from, to);
      events.push({
        at: to,
        text: `Node: a ${kind} collection took ${ms(to - from)} ms. No JavaScript ran, so ${ticks.length ? `${ticks.length} ticks waited, the worst ${ms(worstLate(ticks))} ms late` : "nothing ran"}.`,
      });
    }
    events.push({ at: node.builder.built, text: `Node's builder is done, ${ms(node.builder.built - node.builder.started)} ms after it started.` });
    events.push({ at: beam.builder.built, text: `The BEAM's builder is done, ${ms(beam.builder.built - beam.builder.started)} ms after it started.` });
    return events.sort((a, b) => a.at - b.at);
  }

  setPlaying(playing) {
    this.playing = playing;
    this.$(".play").textContent = playing ? "Pause" : this.t >= this.end ? "Replay" : "Play";
    this.$(".step").disabled = playing;
    this.loop();
  }

  loop() {
    if (this.playing && this.visible && !this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((now) => this.tick(now));
    }
  }

  tick(now) {
    this.frame = null;
    if (!this.playing || !this.visible) return;
    const elapsed = Math.min(100, now - this.last);
    this.last = now;
    this.seek(this.t + elapsed * this.speed);
    if (this.t >= this.end) this.setPlaying(false);
    this.loop();
  }

  seek(t) {
    this.t = Math.max(0, Math.min(this.end, t));
    this.render();
  }

  render() {
    const { beam, node, t } = this;

    const slider = this.$(".time input");
    slider.value = String(Math.round(t));
    slider.setAttribute("aria-valuetext", `${ms(t)} ms`);
    this.$(".time output").textContent = `${ms(t)} ms`;

    // BEAM: the builder and each ticker, each with its own heaps
    const builderHeap = beamHeap(beam.builder.gcs, t, beam.builder.started);
    const builderRow = this.$(".beam-side .builder");
    this.heap(builderRow, builderHeap);
    const g = builderHeap.gc;
    const building = t >= beam.builder.started && t < beam.builder.built;
    this.state(builderRow, g ? "collecting" : building ? "building" : t < beam.builder.started ? "waiting" : "done", !!g);
    this.$(".beam-side .badge").classList.toggle("on", !!(g && dirty(g)));

    const builderGcs = beam.builder.gcs.map(([, from, to]) => [from, to]);
    beam.tickers.forEach((ticker, i) => {
      const row = this.$(`.beam-side [data-ticker="${i}"]`);
      const heap = beamHeap(ticker.gcs, t, 0);
      this.heap(row, heap);
      this.state(row, "ticking", false);
      this.strip(row, ticker.ticks, builderGcs);
    });
    this.readout(".beam-readout", beam.tickers, builderGcs);

    // Node: one heap, collections that stop everything
    const sample = this.sampleAt(t);
    const heapRow = this.$(".node-side .heap-row");
    if (sample) {
      const [, youngUsed, youngSize, oldUsed, oldSize] = sample;
      this.bar(heapRow, "young", youngUsed / youngSize, usedOf(youngUsed, youngSize));
      this.bar(heapRow, "old", oldUsed / oldSize, usedOf(oldUsed, oldSize));
    }
    const nodeGcs = node.gcs.map(([, from, to]) => [from, to]);
    const gc = node.gcs.find(([, from, to]) => from <= t && t < to);
    heapRow.classList.toggle("collecting", !!gc);
    this.$(".node-side .badge").classList.toggle("on", !!gc);
    const nodeBuilding = t >= node.builder.started && t < node.builder.built;
    this.state(this.$(".node-side .builder"), gc && nodeBuilding ? "paused" : nodeBuilding ? "building" : t < node.builder.started ? "waiting" : "done", !!(gc && nodeBuilding));
    node.tickers.forEach((ticker, i) => {
      const row = this.$(`.node-side [data-ticker="${i}"]`);
      this.state(row, gc ? "paused" : "ticking", !!gc);
      this.strip(row, ticker.ticks, nodeGcs);
    });
    this.readout(".node-readout", node.tickers, nodeGcs);

    // The log: every event up to now. Moving forward adds lines; moving back
    // (Restart, the slider) starts it over.
    const upTo = this.events.findLastIndex((e) => e.at <= t);
    if (upTo !== this.logged) {
      const log = this.$(".log");
      if (upTo < this.logged || this.logged < 0) log.replaceChildren();
      for (const e of this.events.slice(Math.max(this.logged + 1, 0), upTo + 1)) {
        const line = document.createElement("div");
        line.textContent = `${ms(e.at).padStart(5)} ms  ${e.text}`;
        log.append(line);
      }
      if (upTo < 0) log.textContent = "Press Play, or drag the time slider.";
      this.logged = upTo;
      log.scrollTop = log.scrollHeight;
    }
  }

  // Ticks so far, and those that were waiting while a collection ran
  readout(selector, tickers, gcs) {
    const happened = tickers.flatMap((tk) => tk.ticks.filter(([due, late]) => due + late <= this.t));
    const inGc = happened.filter(([due, late]) => gcs.some(([from, to]) => due < to && due + late > from));
    const table = this.$(selector);
    const row = (cls, ticks) => {
      const [count, worst] = table.querySelectorAll(`.${cls} td`);
      const c = number(ticks.length);
      const w = ticks.length ? `${ms(worstLate(ticks))} ms late` : "–";
      if (count.textContent !== c) count.textContent = c;
      if (worst.textContent !== w) worst.textContent = w;
    };
    row("all", happened);
    row("gc", inGc);
  }

  sampleAt(t) {
    const { samples } = this.node;
    let found = samples[0];
    for (const s of samples) {
      if (s[0] > t) break;
      found = s;
    }
    return found;
  }

  heap(row, h) {
    row.classList.toggle("collecting", !!h.gc);
    this.bar(row, "young", h.young / h.block, usedOf(h.young * WORD, h.block * WORD));
    this.bar(row, "old", h.oldBlock ? h.old / h.oldBlock : 0, h.oldBlock ? usedOf(h.old * WORD, h.oldBlock * WORD) : "none yet");
  }

  bar(row, which, used, label) {
    const bar = row.querySelector(`.bar.${which}`);
    bar.style.setProperty("--used", Math.min(1, used).toFixed(4));
    bar.classList.toggle("none", label === "none yet");
    const of = row.querySelector(`.${which}-of`);
    if (of.textContent !== label) of.textContent = label;
  }

  // Show one of a row's stacked status words. The others stay in place,
  // invisible, so the row never changes size.
  state(row, word, busy) {
    for (const el of row.querySelectorAll(":scope > .states > span")) {
      const on = el.dataset.state === word;
      el.classList.toggle("on", on);
      el.classList.toggle("busy", on && busy);
      el.setAttribute("aria-hidden", String(!on));
    }
  }

  text(selector, text) {
    const el = this.$(selector);
    if (el.textContent !== text) el.textContent = text;
  }

  // A ticker's last WINDOW of the run: collections shaded, each tick a mark
  // where it happened, and a late one's wait drawn from when it was due.
  strip(row, ticks, gcs) {
    const strip = row.querySelector(".strip");
    const from = this.t - WINDOW;
    const x = (time) => `${((time - from) / WINDOW) * 100}%`;
    const parts = [];
    for (const [a, b] of gcs) {
      if (b < from || a > this.t) continue;
      const start = Math.max(a, from);
      const end = Math.min(b, this.t);
      parts.push(`<span class="gc" style="left:${x(start)};width:${((end - start) / WINDOW) * 100}%"></span>`);
    }
    for (const [due, late] of ticks) {
      if (due > this.t || due + late < from) continue;
      const happened = due + late;
      const isLate = late > LATE;
      if (isLate) {
        const end = Math.min(happened, this.t);
        const start = Math.max(due, from);
        parts.push(`<span class="wait" style="left:${x(start)};width:${((end - start) / WINDOW) * 100}%"></span>`);
      }
      if (happened <= this.t) parts.push(`<span class="tick${isLate ? " late" : ""}" style="left:${x(happened)}"></span>`);
    }
    const html = parts.join("");
    if (strip.innerHTML !== html) strip.innerHTML = html;
  }

  // A batch at a time. A finished tile fades but keeps its place until the
  // whole batch is done, so the others don't shift.
  spawnShort() {
    const tiles = this.$(".tiles");
    const button = this.$(".spawn");
    const instant = reducedMotion.matches;
    button.disabled = true;
    let left = SHORT_BATCH;
    for (let i = 0; i < SHORT_BATCH; i++) {
      const tile = document.createElement("span");
      tile.className = "tile";
      tile.innerHTML = `P${number(this.shortNext++)}<span class="bar young"><i></i></span>`;
      tiles.append(tile);
      const fill = tile.querySelector("i");
      const finish = () => {
        tile.classList.add("gone");
        this.shortDone++;
        this.renderShort();
        if (--left === 0) {
          setTimeout(() => {
            tiles.replaceChildren();
            button.disabled = false;
          }, instant ? 0 : 300);
        }
      };
      if (instant) {
        fill.style.width = `${(SHORT_USED / FIRST_HEAP) * 100}%`;
        setTimeout(finish, 600);
      } else {
        const delay = i * 60;
        fill.animate([{ width: "0%" }, { width: `${(SHORT_USED / FIRST_HEAP) * 100}%` }], { duration: SHORT_LIFE * 0.7, delay, fill: "forwards", easing: "linear" });
        setTimeout(finish, delay + SHORT_LIFE);
      }
    }
  }

  renderShort() {
    this.text(".short-count", `Finished: ${number(this.shortDone)}. Garbage collections: 0. Each heap is freed whole when its process ends.`);
  }
});
