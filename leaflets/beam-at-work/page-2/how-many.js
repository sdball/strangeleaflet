// <how-many>: page 2's opening widget. Page 1's three tickers and busy
// loop, now with a crowd of connections waiting alongside them, held three
// ways: a BEAM process each, a Node async function each, and a Node worker
// thread each. The reader picks how many connections, then adds a busy loop
// (one connection gets a message that takes a second of CPU).
//
// Each lane has a memory bar for the waiting connections, against this M1's
// 8 GB, and the three tickers' strips:
// - BEAM processes: the measured cost from spawn.exs (2,641 to 2,764 bytes
//   each), and the tickers keep ticking through the busy loop (page 1).
// - Node async functions: the measured cost from pending.mjs (563 to 675
//   bytes each, cheaper than a BEAM process), but they share one thread, so
//   the busy loop stops every ticker, and when it ends each ticker runs once,
//   late, and carries on from there on a new beat (page 1's intervals).
// - Node worker threads: each has its own thread, so the busy loop in one
//   doesn't stop the others, but each costs about 9 MB (worker-footprint.mjs,
//   by vmmap's physical footprint: 10.1 MB each at 8, 9.6 at 100, 9.2 at
//   300, 9.0 at 500). Past this machine's 8 GB the lane says so instead of
//   pretending to run: from 1,000 up the figure is that 9.0 MB times the
//   count, an extrapolation, and the note says the runs stopped at 500.
//
// Time runs at a quarter speed: a tick every 100 ms is one every 400 here,
// and the busy loop's second takes four. It holds a static fallback (what
// feed readers and no-JS visitors see) and replaces it once this module
// runs. It only moves while on screen. Nothing slides; ticks appear on the
// strips, which readers who prefer reduced motion get too, since the strips
// are the point.

const MACHINE = 8 * 1024 ** 3; // bytes: this M1 has 8 GB
const COUNTS = [10, 100, 1000, 100_000, 1_000_000];
const TICK = 100; // ms between ticks
const BUSY = 1000; // ms the busy loop runs
const SLOW = 4; // real ms per simulated ms
const WINDOW = 2400; // simulated ms of history on each strip
const TICKERS = ["A", "B", "C"];

// Bytes each, measured at the nearest count (smaller counts use the
// smallest measurement)
const BEAM_EACH = [[1000, 2764], [10_000, 2674], [100_000, 2650], [1_000_000, 2641]];
const ASYNC_EACH = [[1000, 675], [10_000, 571], [100_000, 563], [1_000_000, 565]];
const WORKER_EACH = [[8, 10.1], [100, 9.6], [300, 9.2], [500, 9.0]].map(([n, mb]) => [n, mb * 1024 ** 2]);
const each = (table, n) => (table.find(([at]) => n <= at) ?? table[table.length - 1])[1];

const LANES = [
  { key: "beam", title: "BEAM: a process each", note: "Cheap, and a busy one can't hold up the rest.", each: (n) => each(BEAM_EACH, n), blocks: false },
  { key: "async", title: "Node: an async function each", note: "Cheaper still, but they all share one thread.", each: (n) => each(ASYNC_EACH, n), blocks: true },
  { key: "workers", title: "Node: a worker thread each", note: "Each its own thread, so a busy one can't hold up the rest.", each: (n) => each(WORKER_EACH, n), blocks: false },
];

const number = (n) => n.toLocaleString("en-US");
const size = (bytes) =>
  bytes >= 1024 ** 4 ? `about ${number(Math.round(bytes / 1024 ** 4))} TB`
  : bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
  : bytes >= 1024 ** 2 ? `${number(Math.round(bytes / 1024 ** 2))} MB`
  : `${number(Math.max(1, Math.round(bytes / 1024)))} KB`;

let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  how-many:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: how-many / inline-size;
  }
  how-many .intro-title {
    margin: 0;
    font-family: var(--type);
    font-size: 1.1rem;
    font-weight: 700;
  }
  how-many .intro-text {
    margin: .3rem 0 0;
    font-size: .95rem;
  }
  how-many .controls {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem 1rem;
    align-items: center;
    margin-top: .75rem;
  }
  how-many button,
  how-many .choices label {
    min-height: 44px;
    padding: .35rem .7rem;
    font: inherit;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--ink);
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  how-many button.busy {
    border-color: var(--brass);
    font-weight: 700;
  }
  how-many button:disabled {
    cursor: default;
    opacity: .5;
  }
  how-many button:focus-visible,
  how-many .choices label:has(:focus-visible) {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  how-many .choices {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .35rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  how-many .choices legend {
    float: left;
    margin-right: .25rem;
    padding: 0;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  how-many .choices label {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
  }
  how-many .choices label:has(:checked) {
    border-color: var(--brass);
    background: var(--tint);
  }
  how-many .choices input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
  }
  how-many .note {
    margin: .6rem 0 0;
    font-size: .9rem;
    color: var(--muted);
  }
  how-many .lane {
    display: grid;
    gap: .35rem;
    margin-top: 1rem;
    padding-top: .75rem;
    border-top: 1.5px solid var(--line);
  }
  /* Wide enough: the lane's name beside its bar and strips */
  @container how-many (min-width: 36rem) {
    how-many .lane {
      grid-template-columns: 12rem 1fr;
      column-gap: 1rem;
    }
    how-many .lane .about {
      grid-row: span 3;
    }
  }
  how-many .lane-title {
    margin: 0;
    font-family: var(--type);
    font-size: .95rem;
    font-weight: 700;
  }
  how-many .lane-note {
    margin: .15rem 0 0;
    font-size: .85rem;
    color: var(--muted);
  }
  /* The label, the figure, and the bar a line each, so a long figure
     never wraps the label and moves the strips */
  how-many .memory {
    display: grid;
    gap: .15rem;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  how-many .memory output {
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    white-space: nowrap;
  }
  how-many .bar {
    position: relative;
    height: .8rem;
    border: 1.5px solid var(--line);
    border-radius: 3px;
    overflow: hidden;
  }
  how-many .bar i {
    position: absolute;
    inset: 0 auto 0 0;
    min-width: 2px;
    width: calc(var(--used, 0) * 100%);
    background: var(--code-string);
  }
  how-many .lane.over .bar {
    border-color: var(--code-error);
  }
  how-many .lane.over .bar i {
    background: repeating-linear-gradient(-45deg, var(--code-error) 0 6px, color-mix(in srgb, var(--code-error) 55%, transparent) 6px 12px);
  }
  how-many .lane.over .memory output {
    color: var(--code-error);
    font-weight: 700;
  }
  /* Three strips, or in their place a line saying they couldn't run */
  how-many .strips {
    display: grid;
    position: relative;
    gap: 2px;
  }
  how-many .strip {
    position: relative;
    height: 1rem;
    background: var(--code-bg);
    border-radius: 2px;
    overflow: hidden;
  }
  how-many .strip .name {
    position: absolute;
    left: .2rem;
    top: 0;
    font-family: var(--type);
    font-size: .65rem;
    line-height: 1rem;
    color: var(--muted);
  }
  how-many .strip .busy-zone {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--brass) 30%, transparent);
  }
  how-many .strip .tick {
    position: absolute;
    top: 15%;
    bottom: 15%;
    width: 2px;
    margin-left: -1px;
    background: var(--ink);
  }
  how-many .strip .tick.late {
    top: 0;
    bottom: 0;
    background: var(--code-error);
  }
  how-many .lane.over .strip {
    visibility: hidden;
  }
  how-many .no-room {
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--code-error);
  }
  how-many .lane.over .no-room {
    display: flex;
  }
  /* Two lines whatever it says, so nothing below it moves */
  how-many .verdict {
    margin: 0;
    min-height: 3.3em;
    font-size: .9rem;
  }
  how-many .verdict.bad {
    color: var(--code-error);
  }
  how-many .key {
    display: flex;
    flex-wrap: wrap;
    gap: .25rem 1rem;
    margin: .9rem 0 0;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  how-many .key span::before {
    content: "";
    display: inline-block;
    width: .8rem;
    height: .7rem;
    margin-right: .3rem;
    vertical-align: -.05rem;
    background: var(--swatch);
    border-radius: 2px;
  }
</style>`);

customElements.define("how-many", class extends HTMLElement {
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    const id = `how-many-${++ids}`;

    const lane = (l) => `
      <section class="lane" data-lane="${l.key}" aria-labelledby="${id}-${l.key}">
        <div class="about">
          <h3 class="lane-title" id="${id}-${l.key}">${l.title}</h3>
          <p class="lane-note">${l.note}</p>
        </div>
        <div class="memory"><span>memory for the connections</span><output></output><span class="bar" aria-hidden="true"><i></i></span></div>
        <div class="strips" aria-hidden="true">
          ${TICKERS.map((t) => `<div class="strip" data-ticker="${t}"><span class="name">${t}</span></div>`).join("")}
          <span class="no-room">Wouldn't fit in this machine's 8 GB.</span>
        </div>
        <p class="verdict" role="status"></p>
      </section>`;

    this.innerHTML = `
      <p class="intro-title">How many can wait at once?</p>
      <p class="intro-text">A server with lots of connections, each waiting for its next message, and three tickers ticking. Here it is three ways: a BEAM process for each connection, a Node async function for each, and a Node worker thread for each. Pick how many connections, then add a busy loop: one connection gets a message that takes a second of CPU.</p>
      <div class="controls">
        <fieldset class="choices"><legend>Connections</legend>${COUNTS.map((n) => `<label><input type="radio" name="${id}-count" value="${n}"${n === 100 ? " checked" : ""}> ${number(n)}</label>`).join("")}</fieldset>
        <button type="button" class="busy">Add a busy loop</button>
      </div>
      <p class="note">A simulation at a quarter speed, with memory measured on this M1, which has 8 GB: <a href="spawn.exs">spawn.exs</a>, <a href="pending.mjs">pending.mjs</a>, and <a href="worker-footprint.mjs">worker-footprint.mjs</a>. Workers were measured up to 500 at once, about 9 MB each; past that the figure is 9 MB times the count.</p>
      <div class="lanes">${LANES.map(lane).join("")}</div>
      <p class="key" aria-hidden="true">
        <span style="--swatch: var(--ink)">a tick</span>
        <span style="--swatch: var(--code-error)">a late tick</span>
        <span style="--swatch: color-mix(in srgb, var(--brass) 30%, transparent)">the busy loop running</span>
      </p>`;

    this.$ = (selector) => this.querySelector(selector);
    this.count = 100;
    this.t = 0; // simulated ms
    this.busyFrom = null; // when the busy loop started, simulated ms
    this.lanes = Object.fromEntries(LANES.map((l) => [l.key, { ticks: TICKERS.map(() => []), next: TICKERS.map((_, i) => 30 + i * 33), sawBusy: false }]));

    this.$(".choices").addEventListener("change", (e) => {
      this.count = Number(e.target.value);
      this.render();
    });
    this.$(".busy").addEventListener("click", () => {
      this.busyFrom = this.t;
      for (const l of Object.values(this.lanes)) l.sawBusy = false;
      this.$(".busy").disabled = true;
      this.render();
    });

    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.loop();
    });
    this.observer.observe(this);
    this.render();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  loop() {
    if (this.visible && !this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((now) => this.tick(now));
    }
  }

  tick(now) {
    this.frame = null;
    if (!this.visible) return;
    const elapsed = Math.min(100, Math.max(0, now - this.last)) / SLOW;
    this.last = now;
    this.advance(this.t + elapsed);
    this.render();
    this.loop();
  }

  busyAt(t) {
    return this.busyFrom !== null && t >= this.busyFrom && t < this.busyFrom + BUSY;
  }

  // Move every lane's tickers on to time `to`. Ticks are due every TICK ms.
  // Where the busy loop has the only thread (Node's async functions), a tick
  // that comes due during it waits, runs once when it ends, and the next is
  // counted from then: page 1's late tick and new beat.
  advance(to) {
    for (const def of LANES) {
      const lane = this.lanes[def.key];
      lane.next.forEach((due, i) => {
        while (due <= to) {
          if (def.blocks && this.busyAt(due)) {
            const end = this.busyFrom + BUSY;
            if (end > to) break; // still waiting
            lane.ticks[i].push({ at: end, late: true });
            due = end + TICK;
          } else {
            lane.ticks[i].push({ at: due, late: false });
            due += TICK;
          }
        }
        lane.next[i] = due;
        // Forget what's scrolled off the strip
        while (lane.ticks[i].length && lane.ticks[i][0].at < to - WINDOW) lane.ticks[i].shift();
      });
      if (this.busyAt(to)) lane.sawBusy = true;
    }
    this.t = to;
    if (this.busyFrom !== null && to >= this.busyFrom + BUSY) this.$(".busy").disabled = false;
  }

  render() {
    const { t } = this;
    const busyNow = this.busyAt(t);
    for (const def of LANES) {
      const el = this.$(`[data-lane="${def.key}"]`);
      const lane = this.lanes[def.key];
      const bytes = def.each(this.count) * this.count;
      const over = bytes > MACHINE;
      el.classList.toggle("over", over);
      el.querySelector(".bar i").style.setProperty("--used", Math.min(1, bytes / MACHINE).toFixed(4));
      this.set(el.querySelector(".memory output"), `${size(bytes)} of 8 GB`);

      // The strips: the last WINDOW of each ticker, the busy loop shaded
      const x = (at) => `${(((at - (t - WINDOW)) / WINDOW) * 100).toFixed(2)}%`;
      el.querySelectorAll(".strip").forEach((strip, i) => {
        const parts = [`<span class="name">${TICKERS[i]}</span>`];
        if (this.busyFrom !== null && this.busyFrom + BUSY > t - WINDOW) {
          const from = Math.max(this.busyFrom, t - WINDOW);
          const until = Math.min(this.busyFrom + BUSY, t);
          parts.push(`<span class="busy-zone" style="left:${x(from)};width:${(((until - from) / WINDOW) * 100).toFixed(2)}%"></span>`);
        }
        for (const tick of lane.ticks[i]) parts.push(`<span class="tick${tick.late ? " late" : ""}" style="left:${x(tick.at)}"></span>`);
        const html = parts.join("");
        if (strip.innerHTML !== html) strip.innerHTML = html;
      });

      // The verdict: what the busy loop did to this lane. Short, so it never
      // takes more than its two lines; a lane that doesn't fit says so on its strips.
      let verdict = "";
      if (!over && lane.sawBusy) {
        verdict = !def.blocks ? "The tickers kept ticking through the busy loop."
          : busyNow ? "The busy loop has the only thread. No ticker can tick."
          : "The tickers stopped while the busy loop ran.";
      }
      const v = el.querySelector(".verdict");
      this.set(v, verdict);
      v.classList.toggle("bad", over || (def.blocks && lane.sawBusy));
    }
  }

  set(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }
});
