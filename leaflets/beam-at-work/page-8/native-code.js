// <native-code>: page 8's opening widget. Page 1's busy loop, fib(40), four
// ways, each beside a ticker that ticks every 100 ms, with how long the busy
// loop took and what the ticker did, from the runs on the page:
// - in Elixir (speed.exs, 780 ms): preempted, so the ticker keeps ticking;
// - in C, as an ordinary NIF (speed.exs, 309 ms): the scheduler can't take it
//   back, so the ticker stops for all of it, and when it ends every tick
//   that came due meanwhile comes at once, then the beat carries on where
//   it was (nif.exs: ticks 4 to 24 at 2496–2497 ms, then 2502 ms);
// - the same NIF marked dirty (310 ms): it runs on a dirty CPU scheduler,
//   and the ticker keeps ticking (nif.exs dirty_fib);
// - in Node (speed.mjs, about 1,005 ms): the ticker stops, then one late
//   tick and a new beat, the rest skipped (page 1).
//
// Time runs at a quarter speed, and only while on screen. It holds a static
// fallback (what feed readers and no-JS visitors see) and replaces it once
// this module runs. Ticks appear on the strips; nothing slides.

const TICK = 100; // ms between ticks
const SLOW = 4; // real ms per simulated ms
const WINDOW = 2400; // simulated ms on each strip

const LANES = [
  { key: "elixir", title: "BEAM: the busy loop in Elixir", busy: 780, stops: false },
  { key: "nif", title: "BEAM: the busy loop in C, as a NIF", busy: 309, stops: "catch up" },
  { key: "dirty", title: "BEAM: the same NIF, marked dirty", busy: 310, stops: false },
  { key: "node", title: "Node: the busy loop in JavaScript", busy: 1005, stops: "skip" },
];

const seconds = (ms) => `${(ms / 1000).toFixed(2)} s`;

let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  native-code:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: native-code / inline-size;
  }
  native-code .intro-title {
    margin: 0;
    font-family: var(--type);
    font-size: 1.1rem;
    font-weight: 700;
  }
  native-code .intro-text {
    margin: .3rem 0 0;
    font-size: .95rem;
  }
  native-code .controls {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
    margin-top: .75rem;
  }
  native-code button {
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
  native-code button.busy {
    border-color: var(--brass);
    font-weight: 700;
  }
  native-code button:disabled {
    cursor: default;
    opacity: .5;
  }
  native-code button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  native-code .note {
    margin: .6rem 0 0;
    font-size: .9rem;
    color: var(--muted);
  }
  native-code .lane {
    display: grid;
    gap: .35rem;
    margin-top: 1rem;
    padding-top: .75rem;
    border-top: 1.5px solid var(--line);
  }
  /* Wide enough: the lane's name beside its strip */
  @container native-code (min-width: 36rem) {
    native-code .lane {
      grid-template-columns: 12rem 1fr;
      column-gap: 1rem;
    }
    native-code .lane .lane-title {
      grid-row: span 2;
    }
  }
  native-code .lane-title {
    margin: 0;
    font-family: var(--type);
    font-size: .95rem;
    font-weight: 700;
  }
  native-code .strip {
    position: relative;
    height: 1.3rem;
    background: var(--code-bg);
    border-radius: 2px;
    overflow: hidden;
  }
  native-code .strip .busy-zone {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--brass) 30%, transparent);
  }
  native-code .strip .tick {
    position: absolute;
    top: 15%;
    bottom: 15%;
    width: 2px;
    margin-left: -1px;
    background: var(--ink);
  }
  native-code .strip .tick.late {
    top: 0;
    bottom: 0;
    background: var(--code-error);
  }
  /* Late ticks that came at the same moment: one mark, and how many */
  native-code .strip .bunch {
    position: absolute;
    top: 0;
    margin-left: 4px;
    font-family: var(--type);
    font-size: .7rem;
    line-height: 1.3rem;
    font-weight: 700;
    color: var(--code-error);
  }
  native-code .verdict {
    margin: 0;
    min-height: 3.3em;
    font-size: .9rem;
  }
  native-code .verdict.bad {
    color: var(--code-error);
  }
  native-code .key {
    display: flex;
    flex-wrap: wrap;
    gap: .25rem 1rem;
    margin: .9rem 0 0;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  native-code .key span::before {
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

customElements.define("native-code", class extends HTMLElement {
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    const id = `native-code-${++ids}`;

    this.innerHTML = `
      <p class="intro-title">One busy loop, four ways</p>
      <p class="intro-text">A ticker ticks every 100 ms, and a busy loop starts beside it: the slow recursive Fibonacci, fib(40). In Elixir it's preempted. Here it is in C as well, called from Elixir as native code, and in Node. Each busy loop takes as long as it took on this M1.</p>
      <div class="controls">
        <button type="button" class="busy">Add a busy loop</button>
      </div>
      <p class="note">A simulation of <a href="nif.exs">nif.exs</a>, <a href="speed.exs">speed.exs</a>, and <a href="speed.mjs">speed.mjs</a>, at a quarter speed.</p>
      <div class="lanes">
        ${LANES.map((l) => `
          <section class="lane" data-lane="${l.key}" aria-labelledby="${id}-${l.key}">
            <h3 class="lane-title" id="${id}-${l.key}">${l.title}</h3>
            <div class="strip" aria-hidden="true"></div>
            <p class="verdict" role="status"></p>
          </section>`).join("")}
      </div>
      <p class="key" aria-hidden="true">
        <span style="--swatch: var(--ink)">a tick</span>
        <span style="--swatch: var(--code-error)">a late tick</span>
        <span style="--swatch: color-mix(in srgb, var(--brass) 30%, transparent)">the busy loop running</span>
      </p>`;

    this.$ = (selector) => this.querySelector(selector);
    this.t = 0;
    this.busyFrom = null;
    this.lanes = Object.fromEntries(LANES.map((l) => [l.key, { ticks: [], next: 30 }]));
    this.$(".busy").addEventListener("click", () => {
      this.busyFrom = this.t;
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
    this.advance(this.t + Math.min(100, Math.max(0, now - this.last)) / SLOW);
    this.last = now;
    this.render();
    this.loop();
  }

  // Each lane's ticker on to time `to`. A tick that comes due while a
  // blocking busy loop runs waits for it to end; then a NIF's all come at
  // once and the beat carries on, and Node's one late tick starts a new beat.
  advance(to) {
    for (const def of LANES) {
      const lane = this.lanes[def.key];
      const from = this.busyFrom;
      const end = from === null ? null : from + def.busy;
      while (lane.next <= to) {
        const due = lane.next;
        if (def.stops && from !== null && due >= from && due < end) {
          if (end > to) break; // still waiting
          if (def.stops === "catch up") {
            lane.ticks.push({ at: end, late: true });
            lane.next = due + TICK;
          } else {
            lane.ticks.push({ at: end, late: true });
            lane.next = end + TICK;
          }
        } else {
          lane.ticks.push({ at: due, late: false });
          lane.next = due + TICK;
        }
      }
      while (lane.ticks.length && lane.ticks[0].at < to - WINDOW) lane.ticks.shift();
    }
    this.t = to;
    const longest = Math.max(...LANES.map((l) => l.busy));
    if (this.busyFrom !== null && to >= this.busyFrom + longest + 2 * TICK) {
      this.$(".busy").disabled = false;
    }
  }

  render() {
    const { t } = this;
    const x = (at) => `${(((at - (t - WINDOW)) / WINDOW) * 100).toFixed(2)}%`;
    for (const def of LANES) {
      const el = this.$(`[data-lane="${def.key}"]`);
      const lane = this.lanes[def.key];
      const parts = [];
      if (this.busyFrom !== null && this.busyFrom + def.busy > t - WINDOW) {
        const from = Math.max(this.busyFrom, t - WINDOW);
        const until = Math.min(this.busyFrom + def.busy, t);
        parts.push(`<span class="busy-zone" style="left:${x(from)};width:${(((until - from) / WINDOW) * 100).toFixed(2)}%"></span>`);
      }
      const bunches = new Map();
      for (const tick of lane.ticks) {
        if (tick.late) bunches.set(tick.at, (bunches.get(tick.at) ?? 0) + 1);
        parts.push(`<span class="tick${tick.late ? " late" : ""}" style="left:${x(tick.at)}"></span>`);
      }
      for (const [at, n] of bunches) if (n > 1) parts.push(`<span class="bunch" style="left:${x(at)}">×${n}</span>`);
      const html = parts.join("");
      const strip = el.querySelector(".strip");
      if (strip.innerHTML !== html) strip.innerHTML = html;

      let verdict = "";
      if (this.busyFrom !== null) {
        const done = t >= this.busyFrom + def.busy;
        const took = seconds(def.busy);
        // Short, so none of them takes more than two lines
        if (!done) verdict = def.stops ? "Busy. The ticker can't tick." : "Busy, and the ticker is still ticking.";
        else if (!def.stops) verdict = `Took ${took}${def.key === "dirty" ? " on a dirty scheduler" : ""}, and the ticker kept ticking.`;
        else if (def.stops === "catch up") verdict = `Took ${took}, and the ticker stopped. Its missed ticks all came at once.`;
        else verdict = `Took ${took}, and the ticker stopped. One late tick; the rest skipped.`;
      }
      this.set(el.querySelector(".verdict"), verdict);
      el.querySelector(".verdict").classList.toggle("bad", !!def.stops && this.busyFrom !== null);
    }
  }

  set(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }
});
