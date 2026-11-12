// <beam-spread>: page 2's widget. Eight schedulers, each a row: the process
// it's running, then its run queue. "Spawn 16 busy processes" starts a parent,
// which spawns sixteen children onto its own scheduler's queue, as erts does.
// Idle schedulers take processes from it, migration moves more, and chips
// slide from row to row as they go. "Spawn 1,000 waiting processes" starts
// processes that run to a receive and then wait for a message in no queue
// at all, taking no scheduler time; a memory figure counts what they cost.
// A readout under the rows counts each scheduler's processes the way
// spread.exs does.
//
// It holds a static fallback (what feed readers and no-JS visitors see) and
// replaces it once this module runs. It's a simulation from ../beam-sim.js,
// slowed down to watch. Readers who prefer reduced motion get it paused,
// with Play and Step, and chips that move without sliding.

import { Beam, CONTEXT_REDS } from "../beam-sim.js";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const SCHEDULERS = 8;
const CHILDREN = 16;
const SPAWN_WORK = 100; // the parent's work between spawns
const BUSY_WORK = 12 * CONTEXT_REDS; // each child: twelve full turns
const BALANCE_EVERY = 3 * CONTEXT_REDS; // migration's load check
const IDLE_BATCH = 1000;
const MAX_PROCESSES = 1_048_576; // the BEAM's default limit (+P)
const BYTES_EACH = 2616; // a new process, measured on the page
// Reductions per second. Normal makes a turn last a second.
const SPEEDS = { slow: 1500, normal: 4000, fast: 12000 };
const MAX_SHOWN = 7; // chips per row at most, the running one included; the rest are "+N"
const LOG_LINES = 5;
const ARRIVED = 1.5 * CONTEXT_REDS; // how long a moved chip stays marked

const number = (n) => n.toLocaleString("en-US");
const megabytes = (bytes) => (bytes < 1e6 ? `${number(Math.round(bytes / 1e3))} KB` : `${(bytes / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`);

let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  beam-spread:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }
  beam-spread .controls,
  beam-spread .settings {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
  }
  beam-spread .settings {
    margin-top: .75rem;
  }
  beam-spread button,
  beam-spread .choices label {
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
  beam-spread button.spawn {
    border-color: var(--brass);
    font-weight: 700;
  }
  beam-spread button:disabled {
    cursor: default;
    opacity: .5;
  }
  beam-spread button:focus-visible,
  beam-spread .choices label:has(:focus-visible) {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  beam-spread .choices {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .35rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  beam-spread .choices legend {
    float: left;
    margin-right: .25rem;
    padding: 0;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  beam-spread .choices label {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-width: 44px;
    justify-content: center;
  }
  beam-spread .choices label:has(:checked) {
    border-color: var(--brass);
    background: var(--tint);
  }
  beam-spread .choices input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
  }
  beam-spread .note {
    margin: .6rem 0 0;
    font-size: .9rem;
    color: var(--muted);
  }
  beam-spread .rows {
    margin-top: 1rem;
  }
  beam-spread .row {
    display: grid;
    grid-template-columns: 2.25rem 1fr;
    align-items: center;
    gap: .5rem;
    min-height: 2.25rem;
    border-top: 1px solid var(--line);
  }
  beam-spread .row:last-child {
    border-bottom: 1px solid var(--line);
  }
  beam-spread .sid {
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  beam-spread .lane {
    display: flex;
    align-items: center;
    gap: .25rem;
    min-width: 0;
    overflow: hidden;
    padding: .25rem 0;
  }
  beam-spread .chip {
    position: relative;
    flex: none;
    min-width: 2.2rem;
    padding: .15rem .3rem;
    font-family: var(--code);
    font-size: .75rem;
    line-height: 1.3;
    text-align: center;
    color: var(--ink);
    border: 1.5px solid var(--who);
    border-radius: 4px;
    background: var(--bg);
  }
  beam-spread .chip.running {
    margin-right: .5rem;
    font-weight: 700;
    background: color-mix(in srgb, var(--who) 22%, var(--bg));
  }
  /* What's left of its turn */
  beam-spread .chip.running::after {
    content: "";
    position: absolute;
    left: 0;
    bottom: -1px;
    height: 3px;
    width: calc(var(--left, 0) * 100%);
    background: var(--who);
  }
  beam-spread .chip.arrived {
    outline: 2px solid var(--brass);
    outline-offset: 1px;
  }
  beam-spread .more {
    flex: none;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  beam-spread .head {
    border-top: 0;
    min-height: 0;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  beam-spread .counts,
  beam-spread .log {
    margin: .75rem 0 0;
    padding: .5rem .65rem;
    overflow-x: auto;
    font-size: .8rem;
    line-height: 1.45;
    background: var(--code-bg);
    color: var(--code-ink);
    border-radius: var(--radius);
  }
  beam-spread .counts {
    white-space: pre;
  }
  beam-spread .log {
    min-height: calc(${LOG_LINES} * 1.45em + 1rem);
    white-space: pre-wrap;
  }
  beam-spread .memory {
    margin: .75rem 0 0;
    font-size: .95rem;
  }
</style>`);

customElements.define("beam-spread", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const id = `beam-spread-${++ids}`;
    const speeds = Object.keys(SPEEDS).map((value) => `<label><input type="radio" name="${id}-speed" value="${value}"${value === "normal" ? " checked" : ""}> ${value}</label>`).join("");
    const rows = Array.from({ length: SCHEDULERS }, (_, i) => `
      <div class="row" data-scheduler="${i + 1}">
        <span class="sid">${i + 1}</span>
        <div class="lane"><span class="more"></span></div>
      </div>`).join("");

    this.innerHTML = `
      <div class="controls">
        <button type="button" class="spawn busy">Spawn ${CHILDREN} busy processes</button>
        <button type="button" class="spawn idle">Spawn ${number(IDLE_BATCH)} waiting processes</button>
        <button type="button" class="play"></button>
        <button type="button" class="step">Step</button>
        <button type="button" class="reset">Reset</button>
      </div>
      <div class="settings">
        <fieldset class="choices"><legend>Speed</legend>${speeds}</fieldset>
      </div>
      <p class="note">A simulation, slowed way down to watch: at normal speed a turn of ${number(CONTEXT_REDS)} reductions takes a second instead of about ten microseconds. Migration is simplified, and checks the schedulers' loads far more often than the real BEAM does.</p>
      <div class="rows" aria-hidden="true">
        <div class="row head"><span></span><span>each scheduler: the process running, then its run queue</span></div>
        ${rows}
      </div>
      <pre class="counts" aria-label="Processes per scheduler"></pre>
      <p class="memory"></p>
      <pre class="log" aria-live="polite" aria-label="What happened, newest last"></pre>`;

    this.$ = (selector) => this.querySelector(selector);
    this.lanes = [...this.querySelectorAll(".row[data-scheduler] .lane")];
    this.speed = SPEEDS.normal;
    this.playing = !reducedMotion.matches;
    this.visible = false;

    this.$(".busy").addEventListener("click", () => this.spawnBusy());
    this.$(".idle").addEventListener("click", () => this.spawnIdle());
    this.$(".play").addEventListener("click", () => this.setPlaying(!this.playing));
    this.$(".step").addEventListener("click", () => {
      this.advance(Math.round(CONTEXT_REDS / 8));
      this.render();
    });
    this.$(".reset").addEventListener("click", () => this.reset());
    this.$(".settings").addEventListener("change", (e) => {
      this.speed = SPEEDS[e.target.value];
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
    this.beam = new Beam({ schedulers: SCHEDULERS, balanceEvery: BALANCE_EVERY });
    this.chips = new Map(); // pid -> element
    this.moves = new Map(); // pid -> the scheduler it moved from, since the last render
    this.arrived = new Map(); // pid -> when it arrived somewhere new
    this.lines = [];
    this.carry = 0;
    this.batches = 0;
    this.idle = 0; // waiting processes alive
    this.busy = 0; // busy children alive
    for (const lane of this.lanes) lane.querySelectorAll(".chip").forEach((c) => c.remove());

    this.beam.on((e) => {
      const p = e.process;
      if (e.type === "steal" && p.kind !== "idle") {
        this.moved(p, e.from.id);
        this.print(`scheduler ${e.to.id} had nothing to do and took ${p.name} from scheduler ${e.from.id}`);
      }
      if (e.type === "migrate" && p.kind !== "idle") {
        this.moved(p, e.from.id);
        this.print(`migration: scheduler ${e.from.id} was busier than average, so ${p.name} moved to scheduler ${e.to.id}`);
      }
      if (e.type === "exit" && p.kind === "busy" && --this.busy === 0) this.print(`all ${CHILDREN} busy processes finished`);
    });
    this.print("Press a Spawn button.");
    this.render();
  }

  moved(p, from) {
    if (!this.moves.has(p.pid)) this.moves.set(p.pid, from);
    this.arrived.set(p.pid, this.beam.time);
  }

  print(line) {
    this.lines.push(line);
    this.lines = this.lines.slice(-LOG_LINES);
    this.$(".log").textContent = this.lines.join("\n");
  }

  spawnBusy() {
    const { beam } = this;
    const batch = ++this.batches;
    const first = (batch - 1) * CHILDREN + 1;
    this.busy += CHILDREN;
    const self = this;
    // Elixir: a process that spawns sixteen busy ones, like spread.exs
    beam.spawn(`parent${batch > 1 ? ` ${batch}` : ""}`, function* (me) {
      self.print(`${me.name} is on scheduler ${me.home} and spawns P${first} to P${first + CHILDREN - 1} onto its queue`);
      for (let i = first; i < first + CHILDREN; i++) {
        yield { run: SPAWN_WORK };
        yield { spawn: { name: `P${i}`, info: { kind: "busy" }, body: function* () { yield { run: BUSY_WORK }; } } };
      }
    }, { kind: "parent" });
    this.render();
  }

  spawnIdle() {
    const room = Math.min(IDLE_BATCH, MAX_PROCESSES - this.beam.processes.size);
    for (let i = 0; i < room; i++) {
      // Elixir: spawn(fn -> receive do _ -> :ok end end)
      this.beam.spawn("W", function* () { yield { receive: true }; }, { kind: "idle" });
    }
    this.idle += room;
    this.print(`spawned ${number(room)} processes; each runs to its receive, then waits in no queue`);
    this.render();
  }

  setPlaying(playing) {
    this.playing = playing;
    this.$(".play").textContent = playing ? "Pause" : "Play";
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
  }

  chip(p) {
    let el = this.chips.get(p.pid);
    if (!el) {
      el = document.createElement("span");
      el.className = "chip";
      el.textContent = p.name.replace(/^parent.*/, "parent");
      const color = { parent: "--brass", idle: "--code-function" }[p.kind] ?? "--code-number";
      el.style.setProperty("--who", `var(${color})`);
      this.chips.set(p.pid, el);
    }
    return el;
  }

  render() {
    const { beam } = this;
    const slide = !reducedMotion.matches;

    // Where the moving chips are now, or the end of the row they're leaving
    const before = new Map();
    if (slide) {
      for (const [pid, from] of this.moves) {
        const el = this.chips.get(pid);
        const origin = el?.isConnected ? el : this.lanes[from - 1]?.querySelector(".more");
        if (origin) before.set(pid, origin.getBoundingClientRect());
      }
    }

    // As many chips as fit in a row, leaving room for the "+N"
    const chipWidth = (this.chipWidth ||= this.querySelector(".chip")?.offsetWidth ?? 0) || 36;
    const fit = Math.floor((this.lanes[0].clientWidth - 48 - 8) / (chipWidth + 4));
    const shownPerRow = Math.max(2, Math.min(MAX_SHOWN, fit));

    const shown = new Set();
    beam.schedulers.forEach((s, i) => {
      const lane = this.lanes[i];
      const all = s.current ? [s.current, ...s.queue] : s.queue;
      const visible = all.slice(0, shownPerRow);
      const more = lane.querySelector(".more");
      visible.forEach((p, j) => {
        const el = this.chip(p);
        el.classList.toggle("running", p === s.current && j === 0);
        el.style.setProperty("--left", p === s.current ? s.left / beam.budget : 0);
        const since = this.arrived.get(p.pid);
        el.classList.toggle("arrived", since !== undefined && beam.time - since < ARRIVED);
        if (lane.children[j] !== el) lane.insertBefore(el, lane.children[j] ?? more);
        shown.add(p.pid);
      });
      const hidden = all.length - visible.length;
      more.textContent = hidden ? `+${number(hidden)}` : "";
    });
    for (const [pid, el] of this.chips) {
      if (!shown.has(pid)) el.remove();
      if (!beam.processes.has(pid)) {
        this.chips.delete(pid);
        this.arrived.delete(pid);
      }
    }

    for (const [pid, rect] of before) {
      const el = this.chips.get(pid);
      if (!el?.isConnected) continue;
      const now = el.getBoundingClientRect();
      const dx = rect.left - now.left;
      const dy = rect.top - now.top;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 450, easing: "ease-out" });
    }
    this.moves.clear();

    // The readout, like spread.exs prints
    const ids = beam.schedulers.map((s) => s.id);
    const waiting = beam.schedulers.map((s) => s.queue.length);
    const active = beam.schedulers.map((s) => s.queue.length + (s.current ? 1 : 0));
    const width = Math.max(...waiting, ...active).toString().length + 1;
    const pad = (values) => values.map((v) => String(v).padStart(width)).join("");
    const text = [
      `scheduler:          ${pad(ids)}`,
      `waiting:            ${pad(waiting)}`,
      `running or waiting: ${pad(active)}`,
    ].join("\n");
    if (this.$(".counts").textContent !== text) this.$(".counts").textContent = text;

    const alive = beam.processes.size;
    // Waiting processes never get a message, so the idle ones not in a
    // queue (on their way to their receive) are waiting
    const idleQueued = beam.schedulers.reduce((n, s) =>
      n + s.queue.filter((p) => p.kind === "idle").length + (s.current?.kind === "idle" ? 1 : 0), 0);
    const idleWaiting = this.idle - idleQueued;
    const memory = !alive ? "No processes yet."
      : `${number(alive)} ${alive === 1 ? "process" : "processes"} alive, ${megabytes(alive * BYTES_EACH)} or more.` +
        (idleWaiting ? ` ${number(idleWaiting)} of them are waiting for a message, in no run queue, taking no scheduler time.` : "");
    if (this.$(".memory").textContent !== memory) this.$(".memory").textContent = memory;

    this.$(".step").disabled = this.playing && this.visible;
    this.$(".idle").disabled = alive >= MAX_PROCESSES;
  }
});
