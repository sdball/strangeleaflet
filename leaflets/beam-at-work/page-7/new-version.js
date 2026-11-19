// <new-version>: page 7's opening widget. hot.exs and restart.mjs side by
// side: three tickers counting in memory, and a waiter waiting in a receive,
// then new versions of their code.
//
// The BEAM side follows the reference manual's rules for code replacement.
// A module has at most two versions, current and old. Loading a new one
// makes the current one old, and "Fully qualified function calls always
// refer to current code": each ticker finishes the tick it's in with the
// code it was running (hot.exs printed "tick 4, version 1" after version 2
// loaded) and its fully qualified call to Ticker.loop runs the new one, its
// count carried on in the call's arguments. The waiter never makes a fully
// qualified call, so it stays in version 1. Loading a third version purges
// the old one, and "any processes lingering in it is terminated": the
// waiter, killed (hot.exs: :killed), and any ticker that hadn't yet left
// version 1, if version 3 comes within a tick of version 2.
//
// The Node side starts a new process for each version, as Node must
// (restart.mjs): version 1's process stops, and the new one takes STARTUP
// ms to come up (36 to 74 ms in the runs) and ticks TICK ms later, with
// every count back at 1 and the waiter started afresh. "Start the new one
// first" is restart.mjs's overlap mode: the old one keeps ticking until the
// new one is up.
//
// Time runs at a quarter speed, and only while on screen. It holds a static
// fallback (what feed readers and no-JS visitors see) and replaces it once
// this module runs. Ticks appear on the strips; nothing slides, so reduced
// motion changes nothing.

const TICK = 100; // ms between ticks
const STARTUP = 50; // ms for a new Node process to come up
const SLOW = 4; // real ms per simulated ms
const WINDOW = 2400; // simulated ms on each strip
const LAST = 3; // versions to deploy
const TICKERS = ["a", "b", "c"];
const COLOURS = { 1: "var(--ink)", 2: "var(--code-function)", 3: "var(--code-string)" };

let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  new-version:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: new-version / inline-size;
  }
  new-version .intro-title {
    margin: 0;
    font-family: var(--type);
    font-size: 1.1rem;
    font-weight: 700;
  }
  new-version .intro-text {
    margin: .3rem 0 0;
    font-size: .95rem;
  }
  new-version .controls {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
    margin-top: .75rem;
  }
  new-version button {
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
  new-version button.deploy {
    border-color: var(--brass);
    font-weight: 700;
  }
  new-version button[aria-pressed=true] {
    border-color: var(--brass);
    background: var(--tint);
  }
  new-version button:disabled {
    cursor: default;
    opacity: .5;
  }
  new-version button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  new-version .note {
    margin: .6rem 0 0;
    font-size: .9rem;
    color: var(--muted);
  }
  new-version .side {
    margin-top: 1.25rem;
    padding-top: .75rem;
    border-top: 1.5px solid var(--line);
    min-width: 0;
  }
  /* Wide enough: the two side by side, rows lined up */
  @container new-version (min-width: 38rem) {
    new-version .sides {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 1.25rem;
    }
    new-version .side {
      display: grid;
      grid-template-rows: subgrid;
      grid-row: span 5;
      align-content: start;
    }
  }
  new-version .side-title {
    margin: 0;
    font-family: var(--type);
    font-size: 1rem;
    font-weight: 700;
  }
  new-version .side-note {
    display: grid;
    margin: .15rem 0 0;
    font-size: .85rem;
    color: var(--muted);
  }
  new-version .side-note > span {
    grid-area: 1 / 1;
    visibility: hidden;
  }
  new-version .side-note > span.on {
    visibility: visible;
  }
  /* The headline: the longest gap between ticks since a deploy */
  new-version .gap {
    display: grid;
    margin: .6rem 0 0;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  new-version .gap output {
    font-size: 1.3rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  new-version .rows {
    display: grid;
    gap: .3rem;
    margin-top: .6rem;
  }
  new-version .row {
    display: grid;
    grid-template-columns: 3.6rem 1fr 4.2rem;
    align-items: center;
    gap: .4rem;
    font-family: var(--type);
    font-size: .8rem;
  }
  new-version .row .who {
    font-weight: 700;
  }
  new-version .row .count {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  new-version .row.dead .count {
    color: var(--code-error);
    font-weight: 700;
  }
  new-version .strip {
    position: relative;
    height: 1.1rem;
    background: var(--code-bg);
    border-radius: 2px;
    overflow: hidden;
  }
  new-version .strip .tick {
    position: absolute;
    top: 15%;
    bottom: 15%;
    width: 3px;
    margin-left: -1.5px;
  }
  new-version .strip .deploy-line {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 2px dashed var(--brass);
  }
  new-version .strip .wait-span {
    position: absolute;
    top: 40%;
    bottom: 40%;
  }
  new-version .strip .end {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 3px;
    margin-left: -1.5px;
    background: var(--code-error);
  }
  new-version .verdict {
    margin: .6rem 0 0;
    min-height: 4.9em;
    font-size: .95rem;
  }
  new-version .verdict.bad {
    color: var(--code-error);
  }
  new-version .key {
    display: flex;
    flex-wrap: wrap;
    gap: .25rem 1rem;
    margin: .9rem 0 0;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  new-version .key span::before {
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

const SIDES = {
  beam: {
    title: "BEAM: load it into the running system",
    notes: ["Three ticker processes and a waiter, one module's code."],
  },
  node: {
    title: "Node: start a new process",
    notes: ["Stop the old process, then start the new one.", "Start the new process first, then stop the old one."],
  },
};

const msText = (ms) => `${Math.round(ms)} ms`;

customElements.define("new-version", class extends HTMLElement {
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    const id = `new-version-${++ids}`;

    const side = (key) => `
      <section class="side" data-side="${key}" aria-labelledby="${id}-${key}">
        <h3 class="side-title" id="${id}-${key}">${SIDES[key].title}</h3>
        <p class="side-note">${SIDES[key].notes.map((n) => `<span>${n}</span>`).join("")}</p>
        <p class="gap"><span>the longest gap between ticks</span><output></output></p>
        <div class="rows" aria-hidden="true">
          ${[...TICKERS, "waiter"].map((who) => `<div class="row" data-who="${who}"><span class="who">${who}</span><span class="strip"></span><span class="count"></span></div>`).join("")}
        </div>
        <p class="verdict" role="status"></p>
      </section>`;

    this.innerHTML = `
      <p class="intro-title">A new version, while it runs</p>
      <p class="intro-text">Three tickers count up, each keeping its count in memory, and a fourth process waits for a message. Then a new version of their code arrives; each version ticks in its own colour. Here's the BEAM loading it into the running system, and Node starting a new process with it.</p>
      <div class="controls">
        <button type="button" class="deploy">Deploy version 2</button>
        <button type="button" class="first" aria-pressed="false">Node: start the new one first</button>
        <button type="button" class="reset">Reset</button>
      </div>
      <p class="note">A simulation of <a href="hot.exs">hot.exs</a> and <a href="restart.mjs">restart.mjs</a> at a quarter speed: a tick every 100 ms, and a new Node process up in about 50 ms, as in the runs.</p>
      <div class="sides">${side("beam")}${side("node")}</div>
      <p class="key" aria-hidden="true">
        ${Object.entries(COLOURS).map(([v, c]) => `<span style="--swatch: ${c}">version ${v}</span>`).join("")}
        <span style="--swatch: var(--brass)">a deploy</span>
        <span style="--swatch: var(--code-error)">a process ended</span>
      </p>`;

    this.$ = (selector) => this.querySelector(selector);
    this.first = false;
    this.$(".deploy").addEventListener("click", () => this.deploy());
    this.$(".first").addEventListener("click", (e) => {
      this.first = !this.first;
      e.currentTarget.setAttribute("aria-pressed", String(this.first));
      this.reset();
    });
    this.$(".reset").addEventListener("click", () => this.reset());

    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.loop();
    });
    this.observer.observe(this);
    this.reset();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  reset() {
    this.t = 0;
    this.current = 1;
    this.deploys = []; // simulated ms of each deploy
    // BEAM: each ticker's ticks, the version of the code its loop is in,
    // its count, and whether it was killed; the waiter is in version 1
    // (All three tick together, as in both scripts.)
    const ticker = () => ({ ticks: [], frame: 1, n: 0, next: 30, lastAt: null, killedAt: null });
    this.beam = { tickers: TICKERS.map(ticker), waiter: { frame: 1, killedAt: null }, maxGap: 0 };
    // Node: one process at a time (two, briefly, when the new one starts first)
    this.node = { tickers: TICKERS.map(ticker), stops: [], starts: [{ at: 0, version: 1 }], maxGap: 0 };
    this.$(".deploy").disabled = false;
    this.$(".deploy").textContent = "Deploy version 2";
    this.render();
  }

  deploy() {
    if (this.current >= LAST) return;
    const at = this.t;
    this.current += 1;
    const v = this.current;
    this.deploys.push(at);

    // BEAM: the old version is purged, and anything still in it killed
    const purged = v - 2;
    if (purged >= 1) {
      for (const tk of this.beam.tickers) if (tk.killedAt === null && tk.frame === purged) tk.killedAt = at;
      if (this.beam.waiter.killedAt === null && this.beam.waiter.frame === purged) this.beam.waiter.killedAt = at;
    }

    // Node: a new process; the old one stops now, or once the new one is up
    const up = at + STARTUP;
    const stop = this.first ? up : at;
    this.node.stops.push(stop);
    this.node.starts.push({ at: up, version: v });
    for (const tk of this.node.tickers) tk.pending = { stop, version: v, first: up + TICK };

    const button = this.$(".deploy");
    button.textContent = v < LAST ? `Deploy version ${v + 1}` : "No more versions";
    button.disabled = v >= LAST;
    this.render();
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
    this.advance(this.t + Math.min(100, Math.max(0, now - this.last)) / SLOW);
    this.last = now;
    this.render();
    this.loop();
  }

  // Move both sides on to time `to`
  advance(to) {
    // BEAM: a ticker ticks with the code it's in, then its fully qualified
    // call moves it to whatever is current at that moment
    for (const tk of this.beam.tickers) {
      while (tk.killedAt === null && tk.next <= to) {
        this.addTick(this.beam, tk, tk.next);
        tk.frame = this.versionAt(tk.next);
        tk.next += TICK;
      }
    }
    // Node: each process ticks its own counts. Once the old process has
    // stopped, before its next tick, the new one's count starts again.
    for (const tk of this.node.tickers) {
      for (;;) {
        const p = tk.pending;
        if (p && p.stop <= tk.next && p.stop <= to) {
          tk.n = 0;
          tk.frame = p.version;
          tk.next = p.first;
          tk.pending = null;
          continue;
        }
        if (tk.next > to) break;
        this.addTick(this.node, tk, tk.next);
        tk.next += TICK;
      }
    }
    for (const side of [this.beam, this.node]) {
      for (const tk of side.tickers) while (tk.ticks.length && tk.ticks[0].at < to - WINDOW) tk.ticks.shift();
    }
    this.t = to;
  }

  versionAt(t) {
    return 1 + this.deploys.filter((d) => d <= t).length;
  }

  // A tick, in the version the ticker's code is in, and the gap since its
  // last one, if that was since just before the first deploy
  addTick(side, tk, at) {
    if (this.deploys.length && tk.lastAt !== null && tk.lastAt >= this.deploys[0] - TICK) {
      side.maxGap = Math.max(side.maxGap, at - tk.lastAt);
    }
    tk.lastAt = at;
    tk.n += 1;
    tk.ticks.push({ at, version: tk.frame });
  }

  // The longest gap between ticks since the first deploy, counting one
  // that's still going on, so it climbs while the tickers wait
  longestGap(side) {
    if (!this.deploys.length) return null;
    let longest = side.maxGap;
    for (const tk of side.tickers) {
      if (tk.killedAt === null && tk.lastAt !== null) longest = Math.max(longest, this.t - tk.lastAt);
    }
    return longest;
  }

  render() {
    const { t } = this;
    const x = (at) => `${(((at - (t - WINDOW)) / WINDOW) * 100).toFixed(2)}%`;
    for (const key of Object.keys(SIDES)) {
      const el = this.$(`[data-side="${key}"]`);
      const side = this[key];
      const notes = el.querySelectorAll(".side-note > span");
      notes.forEach((n, i) => {
        const on = i === Math.min(notes.length - 1, this.first ? 1 : 0);
        n.classList.toggle("on", on);
        n.setAttribute("aria-hidden", String(!on));
      });

      const deployLines = this.deploys.filter((d) => d > t - WINDOW).map((d) => `<span class="deploy-line" style="left:${x(d)}"></span>`).join("");
      side.tickers.forEach((tk, i) => {
        const row = el.querySelector(`[data-who="${TICKERS[i]}"]`);
        const ticks = tk.ticks.map((k) => `<span class="tick" style="left:${x(k.at)};background:${COLOURS[k.version]}"></span>`).join("");
        const end = tk.killedAt !== null && tk.killedAt > t - WINDOW ? `<span class="end" style="left:${x(tk.killedAt)}"></span>` : "";
        this.html(row.querySelector(".strip"), deployLines + ticks + end);
        row.classList.toggle("dead", tk.killedAt !== null);
        this.set(row.querySelector(".count"), tk.killedAt !== null ? "killed" : `count ${tk.n}`);
      });

      // The waiter: a line in the colour of the code it's waiting in, ended
      // where it was killed (BEAM) or where its process stopped (Node)
      const row = el.querySelector('[data-who="waiter"]');
      let parts = deployLines;
      let status;
      if (key === "beam") {
        const w = side.waiter;
        const until = w.killedAt ?? t;
        parts += `<span class="wait-span" style="left:${x(Math.max(0, t - WINDOW))};width:${(((until - Math.max(0, t - WINDOW)) / WINDOW) * 100).toFixed(2)}%;background:${COLOURS[w.frame]}"></span>`;
        if (w.killedAt !== null) parts += `<span class="end" style="left:${x(w.killedAt)}"></span>`;
        status = w.killedAt !== null ? "killed" : "waiting";
        row.classList.toggle("dead", w.killedAt !== null);
      } else {
        // Each process's waiter, from its start until its process stops
        const starts = side.starts;
        starts.forEach((s, i) => {
          const from = Math.max(s.at, t - WINDOW);
          const until = Math.min(side.stops[i] ?? t, t);
          if (until > from && s.at <= t) parts += `<span class="wait-span" style="left:${x(from)};width:${(((until - from) / WINDOW) * 100).toFixed(2)}%;background:${COLOURS[s.version]}"></span>`;
          if (side.stops[i] !== undefined && side.stops[i] <= t && side.stops[i] > t - WINDOW) parts += `<span class="end" style="left:${x(side.stops[i])}"></span>`;
        });
        status = "waiting";
        row.classList.remove("dead");
      }
      this.html(row.querySelector(".strip"), parts);
      this.set(row.querySelector(".count"), status);

      const gap = this.longestGap(side);
      const allKilled = side.tickers.every((tk) => tk.killedAt !== null);
      this.set(el.querySelector(".gap output"), allKilled ? "no more ticks" : gap === null ? "–" : gap <= TICK + 1 ? "none" : msText(gap));

      // The verdict
      let verdict = "";
      const deployed = this.deploys.length;
      if (key === "beam" && deployed) {
        const killed = side.tickers.filter((tk) => tk.killedAt !== null).length;
        verdict = deployed === 1 ? "Each ticker finished the tick it was in, then ran version 2. No gap, and the counts carried on."
          : `Version 3 removed version 1, and killed the waiter${killed ? ` and ${killed === 1 ? "a ticker" : `${killed} tickers`}` : ""}, still in it.`;
      } else if (key === "node" && deployed) {
        verdict = this.first ? "The new process started before the old one stopped: a shorter gap, but every count back to 1."
          : "The old process stopped, then the new one started: a gap, and every count back to 1.";
      }
      const v = el.querySelector(".verdict");
      this.set(v, verdict);
      v.classList.toggle("bad", key === "beam" && this.beam.waiter.killedAt !== null);
    }
  }

  set(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  html(el, html) {
    if (el.innerHTML !== html) el.innerHTML = html;
  }
});
