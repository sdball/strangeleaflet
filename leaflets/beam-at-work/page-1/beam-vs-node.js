// <beam-vs-node>: page 1's widget. The same workload in two runtimes, side by
// side: three tickers that each print a tick every so often, and a button
// that adds a CPU-bound loop. The BEAM view shows its schedulers, their run
// queues, and the reductions counting down on each running process. The Node
// view shows its one call stack and the callbacks waiting behind it. Each
// keeps a log like the scripts on the page print, and scores itself against
// the ideal output (every tick on its beat): behind now, late, and skipped.
//
// It holds a static fallback (what feed readers and no-JS visitors see) and
// replaces it once this module runs. It's a simulation from ../beam-sim.js,
// slowed down to watch. Readers who prefer reduced motion get it paused,
// with Play and Step.

import { Beam, EventLoop, CONTEXT_REDS } from "../beam-sim.js";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Units are reductions (see beam-sim.js). Both runtimes do the same work.
const TICKERS = [
  { name: "A", color: "--code-function", first: 1700 },
  { name: "B", color: "--code-string", first: 3400 },
  { name: "C", color: "--code-keyword", first: 5100 },
];
const PERIOD = 5000; // between a ticker's ticks
const TICK_WORK = 150; // printing one tick
const BUSY_WORK = 3 * CONTEXT_REDS; // one busy loop: three full slices
const MAX_BUSY = 3;
const WINDOW = 30000; // how much time the tick strip shows
// Reductions per second. Extra slow makes a turn last ten seconds, long
// enough to read the countdown and watch a tick go through.
const SPEEDS = { "extra-slow": 400, slow: 1200, normal: 3000, fast: 9000 };
const LOG_LINES = 6;
const GRACE = 600; // a tick that starts later than this after it's due is late

// The ideal output: ticker i's nth tick is due at first + (n - 1) * PERIOD
const dueTime = (i, n) => TICKERS[i].first + (n - 1) * PERIOD;
const dueCount = (i, time) => (time < TICKERS[i].first ? 0 : Math.floor((time - TICKERS[i].first) / PERIOD) + 1);

const number = (n) => n.toLocaleString("en-US");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

document.head.insertAdjacentHTML("beforeend", `<style>
  beam-vs-node:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    container-type: inline-size;
    background: var(--bg);
  }
  /* On a wide screen, wider than the text, so the two views fit side by side */
  @media (min-width: 900px) {
    beam-vs-node:defined {
      --wide: min(56rem, 100vw - 4rem);
      width: var(--wide);
      margin-left: calc(50% - var(--wide) / 2);
    }
  }
  beam-vs-node .controls {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
  }
  beam-vs-node button,
  beam-vs-node .choices label {
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
  beam-vs-node button.add {
    border-color: var(--brass);
    font-weight: 700;
  }
  beam-vs-node button:disabled {
    cursor: default;
    opacity: .5;
  }
  beam-vs-node button:focus-visible,
  beam-vs-node .choices label:has(:focus-visible) {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  beam-vs-node .settings {
    display: flex;
    flex-wrap: wrap;
    gap: .25rem 1.25rem;
    margin-top: .75rem;
  }
  beam-vs-node .choices {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .35rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  beam-vs-node .choices legend {
    float: left;
    margin-right: .25rem;
    padding: 0;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  beam-vs-node .choices label {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    min-width: 44px;
    justify-content: center;
  }
  beam-vs-node .choices label:has(:checked) {
    border-color: var(--brass);
    background: var(--tint);
  }
  beam-vs-node .choices input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
  }
  beam-vs-node .note {
    margin: .6rem 0 0;
    font-size: .9rem;
    color: var(--muted);
  }
  /* The views share rows, so side by side their strips and logs line up */
  beam-vs-node .views {
    display: grid;
    gap: .6rem 1rem;
    margin-top: 1rem;
  }
  @container (min-width: 600px) {
    beam-vs-node .views {
      grid-template-columns: 1fr 1fr;
    }
  }
  beam-vs-node .view {
    display: grid;
    grid-row: span 7;
    grid-template-rows: subgrid;
    align-items: start;
    min-width: 0;
  }
  beam-vs-node .view + .view {
    margin-top: 1rem;
  }
  @container (min-width: 600px) {
    beam-vs-node .view + .view {
      margin-top: 0;
    }
  }
  beam-vs-node h3 {
    margin: 0;
    font-family: var(--type);
    font-size: 1rem;
  }
  beam-vs-node .status {
    min-height: 2.6em;
    margin: 0;
    font-size: .9rem;
  }
  beam-vs-node .box {
    padding: .5rem .6rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  beam-vs-node .box-name {
    display: block;
    margin-bottom: .3rem;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  beam-vs-node .running {
    display: grid;
    grid-template-columns: minmax(6.5rem, max-content) 1fr;
    align-items: center;
    gap: .5rem;
    min-height: 2rem;
  }
  /* A view narrower than about 380px (a phone, or side by side in a
     narrowish widget) puts the bar under its process. Not a container query
     on .view itself: size containment would stop it being a subgrid. */
  @container (max-width: 775px) {
    beam-vs-node .running {
      grid-template-columns: minmax(0, 1fr);
      justify-items: start;
      gap: .3rem;
    }
    beam-vs-node .running .bar {
      justify-self: stretch;
    }
  }
  beam-vs-node .idle {
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  beam-vs-node .bar {
    position: relative;
    height: 1.4rem;
    background: var(--tint);
    border-radius: 3px;
    overflow: hidden;
  }
  beam-vs-node .bar span {
    position: absolute;
    inset: 0 auto 0 0;
    background: color-mix(in srgb, var(--brass) 45%, transparent);
  }
  beam-vs-node .bar b {
    position: relative;
    display: block;
    padding: 0 .4rem;
    font: 400 .75rem/1.4rem var(--code);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  beam-vs-node .queue {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .3rem;
    min-height: 1.9rem;
    margin-top: .35rem;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  beam-vs-node .chip {
    display: inline-block;
    padding: .1rem .45rem;
    font-family: var(--code);
    font-size: .8rem;
    color: var(--ink);
    background: var(--tint);
    border-left: 4px solid var(--who);
    border-radius: 3px;
    white-space: nowrap;
  }
  beam-vs-node .strip {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: .15rem .4rem;
    align-items: center;
    font-family: var(--code);
    font-size: .75rem;
  }
  beam-vs-node .strip svg {
    grid-row: 1 / span 3;
    grid-column: 2;
    width: 100%;
    height: 3.6rem;
    background: var(--code-bg);
    border-radius: 3px;
  }
  beam-vs-node .strip-note {
    margin: .2rem 0 0;
    font-size: .8rem;
    color: var(--muted);
  }
  beam-vs-node .swatch {
    display: inline-block;
    width: .9em;
    height: .9em;
    vertical-align: -.1em;
    background: color-mix(in srgb, var(--code-number) 30%, transparent);
    border: 1px solid var(--code-number);
  }
  beam-vs-node pre.log {
    margin: 0;
    padding: .5rem .6rem;
    height: calc(${LOG_LINES} * 1.45em + 1rem);
    font: .8rem/1.45 var(--code);
    color: var(--code-ink);
    background: var(--code-bg);
    border: 1px solid var(--code-line);
    border-radius: var(--radius);
    overflow: hidden;
    white-space: pre;
  }
  beam-vs-node .log .busy {
    color: var(--code-number);
  }
  beam-vs-node .log .off {
    color: var(--code-comment);
  }
  beam-vs-node .score {
    display: flex;
    flex-wrap: wrap;
    gap: .2rem 1rem;
    margin: 0;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  beam-vs-node .score b {
    color: var(--ink);
  }
  beam-vs-node .score .bad {
    color: var(--code-error);
  }
  /* The last process to run, shown dimmed while its scheduler is idle */
  beam-vs-node .chip.past {
    opacity: .45;
  }
  /* Fixed slots in the waiting rows, so they don't reflow every tick */
  beam-vs-node .chip.gone {
    visibility: hidden;
  }
</style>`);

let ids = 0;

// One side of the comparison: its log, its tick strip, and its counts
class Side {
  constructor(root) {
    this.root = root;
    this.log = [];
    this.ticks = []; // [time, ticker index]
    this.bands = []; // [from, to] when a busy loop was running
    this.counts = TICKERS.map(() => 0); // ticks printed
    this.answered = TICKERS.map(() => 0); // the latest due tick each has printed for
    this.lateness = TICKERS.map(() => 0); // of each ticker's latest tick
    this.late = 0;
    this.skipped = 0;
    this.lastRan = new Map(); // scheduler (or stack) to the name of what ran there last
  }

  // Due ticks not printed yet
  behind(now) {
    return TICKERS.reduce((sum, _, i) => sum + Math.max(0, dueCount(i, now - TICK_WORK - GRACE) - this.answered[i]), 0);
  }

  // Off the ideal beat: a ticker whose latest tick was late
  drifted() {
    return this.lateness.some((late) => late > GRACE);
  }

  // A tick printed at `time`, answering due tick n
  printTick(i, n, time) {
    const lateness = time - TICK_WORK - dueTime(i, n);
    const skipped = Math.max(0, n - this.answered[i] - 1);
    this.counts[i]++;
    this.answered[i] = n;
    this.lateness[i] = lateness;
    this.skipped += skipped;
    if (lateness > GRACE) this.late++;
    this.ticks.push([time, i]);
    const notes = [lateness > GRACE && "late", skipped && `${skipped} skipped`].filter(Boolean);
    this.print(`${TICKERS[i].name} tick ${this.counts[i]}`, "", notes.join(", "));
  }

  print(text, cls = "", note = "") {
    this.log.push([text, cls, note]);
    if (this.log.length > LOG_LINES) this.log.shift();
    this.logDirty = true;
  }
}

customElements.define("beam-vs-node", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const id = `beam-vs-node-${++ids}`;
    const radios = (name, legend, options, checked) => `
      <fieldset class="choices">
        <legend>${legend}</legend>
        ${options.map(([value, label]) => `<label><input type="radio" name="${id}-${name}" value="${value}"${value === checked ? " checked" : ""}> ${label}</label>`).join("")}
      </fieldset>`;
    const tickerLabels = TICKERS.map((t) => `<span style="color: var(${t.color})">${t.name}</span>`).join("");

    this.innerHTML = `
      <div class="controls">
        <button type="button" class="add">Add a busy loop</button>
        <button type="button" class="play"></button>
        <button type="button" class="step">Step</button>
        <button type="button" class="reset">Reset</button>
      </div>
      <div class="settings">
        ${radios("schedulers", "BEAM schedulers", [["1", "1"], ["2", "2"], ["4", "4"]], "1")}
        ${radios("speed", "Speed", [["extra-slow", "extra slow"], ["slow", "slow"], ["normal", "normal"], ["fast", "fast"]], "normal")}
      </div>
      <p class="note">A simulation, slowed way down to watch. Both sides do the same work at the same pace; only the scheduling differs: preemptive in the BEAM, cooperative in Node. Node runs its JavaScript on one thread however many cores you give the BEAM.</p>
      <div class="views">
        <section class="view" data-side="beam" aria-labelledby="${id}-beam">
          <h3 id="${id}-beam">BEAM</h3>
          <p class="status" aria-live="polite"></p>
          <p class="score"></p>
          <div class="schedulers"></div>
          <div class="queue" data-waiting></div>
          <div class="strip" aria-hidden="true">${tickerLabels}<svg preserveAspectRatio="none"></svg></div>
          <pre class="log" aria-label="BEAM output, newest last"></pre>
        </section>
        <section class="view" data-side="node" aria-labelledby="${id}-node">
          <h3 id="${id}-node">Node.js</h3>
          <p class="status" aria-live="polite"></p>
          <p class="score"></p>
          <div class="box">
            <span class="box-name">call stack (the one thread)</span>
            <div class="running" data-stack></div>
            <div class="queue" data-ready></div>
          </div>
          <div class="queue" data-timers></div>
          <div class="strip" aria-hidden="true">${tickerLabels}<svg preserveAspectRatio="none"></svg></div>
          <pre class="log" aria-label="Node output, newest last"></pre>
        </section>
      </div>
      <p class="strip-note">The strips show each ticker's ticks, newest on the right. Faint marks are the ideal: where every tick should land. <span class="swatch"></span> a busy loop running.</p>`;

    this.$ = (selector) => this.querySelector(selector);
    this.views = {
      beam: this.$('[data-side="beam"]'),
      node: this.$('[data-side="node"]'),
    };
    this.speed = SPEEDS.normal;
    this.playing = !reducedMotion.matches;
    this.visible = false;

    this.$(".add").addEventListener("click", () => this.addBusy());
    this.$(".play").addEventListener("click", () => this.setPlaying(!this.playing));
    this.$(".step").addEventListener("click", () => {
      this.advance(Math.round(CONTEXT_REDS / 8));
      this.render();
    });
    this.$(".reset").addEventListener("click", () => this.reset());
    this.$(".settings").addEventListener("change", (e) => {
      if (e.target.name.endsWith("schedulers")) {
        this.beam.setSchedulers(Number(e.target.value));
        this.schedulersKey = null;
      } else {
        this.speed = SPEEDS[e.target.value];
      }
      this.render();
    });
    this.onMotion = () => reducedMotion.matches && this.setPlaying(false);
    reducedMotion.addEventListener("change", this.onMotion);

    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.loop();
    });
    this.observer.observe(this);

    this.reset();
    this.setPlaying(this.playing);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    reducedMotion.removeEventListener("change", this.onMotion);
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  reset() {
    const schedulers = Number(this.$('input[name$="schedulers"]:checked').value);
    this.beam = new Beam({ schedulers });
    this.node = new EventLoop();
    this.sides = { beam: new Side(this.views.beam), node: new Side(this.views.node) };
    this.busyCount = 0;
    this.carry = 0;
    this.schedulersKey = null;
    const { beam, node, sides } = this;

    TICKERS.forEach((ticker, i) => {
      // Elixir: a process that waits for a :tick message, prints, waits again.
      // The timer keeps sending on schedule, so late ticks wait in the
      // mailbox and each one gets printed, oldest first.
      const p = beam.spawn(`ticker ${ticker.name}`, function* () {
        for (;;) {
          yield { receive: true };
          yield { run: TICK_WORK };
          sides.beam.printTick(i, sides.beam.answered[i] + 1, beam.time);
        }
      }, { ticker: i });
      beam.sendInterval(p.pid, "tick", PERIOD, ticker.first);
      // Node: setInterval with a callback that prints. One late callback
      // stands in for every tick that came due while it waited.
      node.setInterval(`tick ${ticker.name}`, function* () {
        const started = node.time;
        yield { run: TICK_WORK };
        sides.node.printTick(i, dueCount(i, started), node.time);
      }, PERIOD, ticker.first);
    });

    // Shade the strip while a busy loop runs: in the BEAM from start to
    // finish (it takes turns), in Node while it holds the stack
    beam.on((e) => {
      if (e.process?.busy === undefined) return;
      if (e.type === "exit") sides.beam.print(`busy loop ${e.process.busy} ends`, "busy");
    });
    node.on((e) => {
      if (e.callback?.busy === undefined) return;
      if (e.type === "call") {
        sides.node.print(`busy loop ${e.callback.busy} starts`, "busy");
        sides.node.bands.push([e.time, null]);
      }
      if (e.type === "return") {
        sides.node.print(`busy loop ${e.callback.busy} ends`, "busy");
        this.closeBand(sides.node, e.time);
      }
    });
    this.render();
  }

  closeBand(side, time) {
    const open = side.bands.find((band) => band[1] === null);
    if (open) open[1] = time;
  }

  busyAlive() {
    const beam = [...this.beam.processes.values()].filter((p) => p.busy !== undefined).length;
    const stack = this.node.stack?.busy !== undefined ? 1 : 0;
    const node = stack + this.node.ready().filter((c) => c.busy !== undefined).length;
    return { beam, node };
  }

  addBusy() {
    const alive = this.busyAlive();
    if (Math.max(alive.beam, alive.node) >= MAX_BUSY) return;
    const n = ++this.busyCount;
    const name = `busy ${n}`;
    // Elixir: spawn a process that runs fib(40)
    const { beam, sides } = this;
    beam.spawn(name, function* () {
      sides.beam.print(`busy loop ${n} starts`, "busy");
      if (!sides.beam.bands.some((b) => b[1] === null)) sides.beam.bands.push([beam.time, null]);
      yield { run: BUSY_WORK };
    }, { busy: n });
    // Node: a callback that runs fib(40), like the script's setTimeout
    this.node.queue(name, function* () {
      yield { run: BUSY_WORK };
    }, { busy: n });
    this.render();
  }

  setPlaying(playing) {
    this.playing = playing;
    const button = this.$(".play");
    button.textContent = playing ? "Pause" : "Play";
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
    const seconds = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.carry += seconds * this.speed;
    const units = Math.floor(this.carry);
    this.carry -= units;
    this.advance(units);
    this.render();
    this.loop();
  }

  advance(units) {
    this.beam.advance(units);
    this.node.advance(units);
    // The BEAM's band covers busy loops alive, overlapping ones included
    const { beam } = this.busyAlive();
    if (!beam) this.closeBand(this.sides.beam, this.beam.time);
  }

  render() {
    this.renderBeam();
    this.renderNode();
    for (const [key, side] of Object.entries(this.sides)) {
      const clock = this[key];
      this.renderStrip(side, clock.time);
      this.renderLog(side);
    }
    const alive = this.busyAlive();
    this.$(".add").disabled = Math.max(alive.beam, alive.node) >= MAX_BUSY;
    this.$(".step").disabled = this.playing && this.visible;
  }

  chip(name, extra = "", cls = "") {
    const ticker = TICKERS.find((t) => name.endsWith(` ${t.name}`));
    const color = ticker ? ticker.color : "--code-number";
    return `<span class="chip ${cls}" style="--who: var(${color})">${name}${extra}</span>`;
  }

  setHTML(el, html) {
    if (el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
  }

  setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  busyProgress(p) {
    const done = BUSY_WORK - (p.cmd ? p.cmd.left : BUSY_WORK);
    return ` ${Math.floor((100 * done) / BUSY_WORK)}%`;
  }

  renderBeam() {
    const { beam } = this;
    const view = this.views.beam;
    const holder = view.querySelector(".schedulers");
    const key = beam.schedulers.length;
    if (this.schedulersKey !== key) {
      this.schedulersKey = key;
      holder.innerHTML = beam.schedulers.map((s) => `
        <div class="box">
          <span class="box-name">scheduler ${s.id}</span>
          <div class="running"></div>
          <div class="queue"></div>
        </div>`).join("");
    }
    const side = this.sides.beam;
    holder.querySelectorAll(".box").forEach((box, i) => {
      const s = beam.schedulers[i];
      const p = s.current;
      if (p) side.lastRan.set(s.id, p.name);
      this.renderRunning(box.querySelector(".running"), side.lastRan.get(s.id), p && {
        extra: p.busy !== undefined ? this.busyProgress(p) : "",
        fraction: s.left / beam.budget,
        text: `${number(s.left)} of ${number(beam.budget)} reductions left`,
      }, "idle");
      const queue = s.queue.map((q) => this.chip(q.name, q.busy !== undefined ? this.busyProgress(q) : "")).join("");
      this.setHTML(box.querySelector(".queue"), `run queue: ${queue || "empty"}`);
    });
    const waiting = new Set(beam.waitingProcesses().map((p) => p.name));
    this.setHTML(view.querySelector("[data-waiting]"), `waiting for a tick: ${TICKERS.map((t) =>
      this.chip(`ticker ${t.name}`, "", waiting.has(`ticker ${t.name}`) ? "" : "gone")).join("")}`);

    const alive = this.busyAlive().beam;
    const s = beam.schedulers.length;
    const behind = side.behind(beam.time);
    this.setText(view.querySelector(".status"), alive
      ? `${plural(alive, "busy loop")} on ${plural(s, "scheduler")}. ${behind
        ? "There isn't CPU for everything, so ticks wait in the tickers' mailboxes."
        : "The tickers still get their turns."}`
      : behind
        ? "Catching up: every tick that waited in a mailbox gets printed."
        : `${plural(s, "scheduler")}. The tickers tick on the ideal beat.`);
    this.renderScore(view, side, behind);
  }

  // What's running on a scheduler or the stack, in a row that keeps its
  // layout when nothing is: the last thing that ran stays, dimmed
  renderRunning(row, lastName, now, idleText) {
    if (!row.firstChild) row.innerHTML = `<span class="slot"></span><div class="bar"><span></span><b></b></div>`;
    const slot = row.querySelector(".slot");
    if (now) {
      this.setHTML(slot, this.chip(lastName, now.extra));
      row.querySelector(".bar span").style.width = `${100 * now.fraction}%`;
      this.setText(row.querySelector(".bar b"), now.text);
    } else {
      this.setHTML(slot, lastName ? this.chip(lastName, "", "past") : `<span class="idle">nothing yet</span>`);
      row.querySelector(".bar span").style.width = "0%";
      this.setText(row.querySelector(".bar b"), idleText);
    }
  }

  renderScore(view, side, behind) {
    const item = (label, n) => `<span>${label} <b${n ? ' class="bad"' : ""}>${number(n)}</b></span>`;
    this.setHTML(view.querySelector(".score"),
      item("behind now", behind) + item("late so far", side.late) + item("skipped so far", side.skipped));
  }

  renderNode() {
    const { node } = this;
    const view = this.views.node;
    const side = this.sides.node;
    const c = node.stack;
    if (c) side.lastRan.set("stack", c.name);
    this.renderRunning(view.querySelector("[data-stack]"), side.lastRan.get("stack"), c && {
      extra: "",
      fraction: c.done / c.total,
      text: `${number(c.total - c.done)} to go${c.busy !== undefined ? ", no budget" : ""}`,
    }, "empty");
    const ready = node.ready().map((r) => this.chip(r.name, r.busy !== undefined ? " 0%" : "")).join("");
    this.setHTML(view.querySelector("[data-ready]"), `waiting for the stack: ${ready || "nothing"}`);
    const notDue = new Set(node.waitingTimers().map((t) => t.name));
    this.setHTML(view.querySelector("[data-timers]"), `timers not due yet: ${TICKERS.map((t) =>
      this.chip(`timer ${t.name}`, "", notDue.has(`tick ${t.name}`) ? "" : "gone")).join("")}`);

    const blocked = c?.busy !== undefined;
    const due = node.ready().filter((r) => r.busy === undefined).length;
    const behind = side.behind(node.time);
    this.setText(view.querySelector(".status"), blocked
      ? `A busy loop has the only thread. ${due ? "The tickers wait for it to finish." : "Nothing else can run."}`
      : side.drifted()
        ? "Ticking again, but off the ideal beat: each interval counts on from its late tick, and the ticks it missed are gone."
        : "One thread, one callback at a time. The tickers tick on the ideal beat.");
    this.renderScore(view, side, behind);
  }

  renderStrip(side, now) {
    const svg = side.root.querySelector(".strip svg");
    const from = now - WINDOW;
    side.ticks = side.ticks.filter(([t]) => t > from);
    side.bands = side.bands.filter(([, to]) => to === null || to > from);
    const x = (t) => (((t - from) / WINDOW) * 1000).toFixed(1);
    const bands = side.bands.map(([a, b]) =>
      `<rect x="${x(Math.max(a, from))}" y="0" width="${(x(b ?? now) - x(Math.max(a, from))).toFixed(1)}" height="30" style="fill: color-mix(in srgb, var(--code-number) 30%, transparent)"/>`).join("");
    const ideal = TICKERS.flatMap((_, i) => {
      const marks = [];
      for (let n = Math.max(1, dueCount(i, from)); dueTime(i, n) <= now; n++) {
        const t = dueTime(i, n);
        if (t > from) marks.push(`<line x1="${x(t)}" x2="${x(t)}" y1="${i * 10}" y2="${i * 10 + 10}" style="stroke: var(${TICKERS[i].color}); stroke-width: 1px; opacity: .45" vector-effect="non-scaling-stroke"/>`);
      }
      return marks;
    }).join("");
    const ticks = side.ticks.map(([t, i]) =>
      `<line x1="${x(t)}" x2="${x(t)}" y1="${i * 10 + 1.5}" y2="${i * 10 + 8.5}" style="stroke: var(${TICKERS[i].color}); stroke-width: 3px" vector-effect="non-scaling-stroke"/>`).join("");
    svg.setAttribute("viewBox", "0 0 1000 30");
    svg.innerHTML = bands + ideal + ticks;
  }

  renderLog(side) {
    if (!side.logDirty) return;
    side.logDirty = false;
    const pre = side.root.querySelector(".log");
    pre.replaceChildren(...side.log.flatMap(([text, cls, note], i) => {
      const line = document.createElement("span");
      line.textContent = text;
      if (cls) line.className = cls;
      if (note) {
        const off = document.createElement("span");
        off.className = "off";
        off.textContent = `  (${note})`;
        line.append(off);
      }
      return i ? ["\n", line] : [line];
    }));
  }
});
