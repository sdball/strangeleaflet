// <beam-links>: page 5's widget. A handful of processes tied together with
// links and a monitor, as on the page: a restarter that traps exits (as in
// restart.exs) linked to a worker, the worker linked to two helpers it
// started, a watcher monitoring the worker, and a counter with no links at
// all. The reader picks a process and crashes it, lets it finish, or kills
// it, and watches what happens next:
//
// - A process that exits sends an exit signal along each of its links,
//   carrying its exit reason. A process that gets one dies of it with the
//   same reason, unless the reason is :normal (then it's dropped) or the
//   process traps exits (then it becomes an {:EXIT, pid, reason} message).
//   Its own death sends signals along its own links, so a crash spreads
//   along a chain until it reaches a process that traps exits.
// - Kill sends :kill, which can't be trapped; the process exits with
//   :killed, and that's the reason its links carry.
// - A monitor sends a :DOWN message when the watched process exits, for any
//   reason, and is then gone. Nothing dies of a :DOWN.
// - The restarter, when it gets {:EXIT, worker, reason} with any reason but
//   :normal, starts a new worker, which starts two new helpers. After three
//   restarts it gives up and exits with :too_many_restarts, as restart.exs
//   does. The watcher's monitor was on the old worker, so it isn't watching
//   the new one until the reader has it monitor the worker again.
//
// The rules are the Erlang reference manual's (Receiving Exit Signals,
// Monitors), as on the page. It's a simulation: signals take a moment to
// travel here so they can be followed, where in the BEAM they take
// microseconds. Whether the restarter and the worker trap exits can be
// switched; the others don't, since they have no links worth trapping.
//
// It holds a static fallback (what feed readers and no-JS visitors see) and
// replaces it once this module runs. The processes are buttons in a grid;
// the links and the monitor are drawn between them in an SVG layer, and a
// dot travels along a line for each signal. Under reduced motion the dots
// don't travel and signals arrive sooner; the same things happen in the
// same order.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const HOP = 900; // ms a signal takes along a line
const HOP_REDUCED = 350;
const RESTART_AFTER = 600; // ms from the restarter's {:EXIT} to the new worker
const SPAWN_AFTER = 450; // ms from a new worker to its helpers
const TRIES = 3; // restarts before the restarter gives up, as in restart.exs

// The places in the picture, and who starts there (in the grid: the
// watcher, restarter, and counter on top, the worker under the restarter,
// and its helpers below)
const ROLES = {
  restarter: { name: "restarter", trap: true, canTrap: true },
  watcher: { name: "watcher" },
  worker: { name: "worker", canTrap: true },
  counter: { name: "counter" },
  helper1: { name: "helper 1" },
  helper2: { name: "helper 2" },
};

const REASONS = {
  crash: { code: '{%RuntimeError{message: "oops"}, stacktrace}', short: "RuntimeError" },
  normal: { code: ":normal", short: ":normal" },
  killed: { code: ":killed", short: ":killed" },
  too_many_restarts: { code: ":too_many_restarts", short: ":too_many_restarts" },
};

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const code = (s) => `<code>${escape(s)}</code>`;

let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  beam-links:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: beam-links / inline-size;
  }
  beam-links .note {
    margin: 0 0 1rem;
    font-size: .9rem;
    color: var(--muted);
  }
  beam-links .graph {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-areas:
      "watcher restarter counter"
      ".       worker    .      "
      "helper1 .         helper2";
    gap: 2.75rem .5rem;
    max-width: 34rem;
    margin: 0 auto;
  }
  beam-links .lines,
  beam-links .dots {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  beam-links .lines line {
    stroke: var(--ink);
    stroke-width: 2;
  }
  beam-links .lines line.monitor {
    stroke: var(--muted);
    stroke-dasharray: 5 4;
  }
  beam-links .lines line.lit {
    stroke: var(--brass);
    stroke-width: 3;
  }
  beam-links .lines marker path {
    fill: var(--muted);
  }
  beam-links .node {
    position: relative;
    z-index: 1;
    display: grid;
    gap: .1rem;
    align-content: start;
    min-width: 0;
    padding: .4rem .45rem;
    font: inherit;
    text-align: left;
    color: var(--ink);
    background: var(--bg);
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    cursor: pointer;
    transition: opacity .3s;
  }
  beam-links .node[aria-pressed="true"] {
    outline: 3px solid var(--link);
    outline-offset: 2px;
  }
  beam-links .node:focus-visible {
    outline: 3px solid var(--link);
    outline-offset: 2px;
  }
  beam-links .node.trapping {
    border-color: var(--brass);
    box-shadow: inset 0 0 0 2px var(--brass);
  }
  beam-links .node.dead {
    color: var(--muted);
    border-style: dashed;
    border-color: var(--line);
    box-shadow: none;
  }
  beam-links .node.hit {
    animation: beam-links-hit .6s;
  }
  @keyframes beam-links-hit {
    from { background: var(--selection); }
  }
  beam-links .node .name {
    font-family: var(--type);
    font-weight: 700;
    font-size: .9rem;
    line-height: 1.2;
  }
  /* Four lines in every box, none of them wrapping, so a box never changes
     size; the code is sized to fit a pid in a third of a phone's width */
  beam-links .node > span:not(.badge) {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  beam-links .node .pid,
  beam-links .node .status {
    font-family: var(--code);
    font-size: clamp(.6rem, 2.9cqi, .76rem);
    line-height: 1.35;
  }
  beam-links .node .status {
    color: var(--muted);
    min-height: 1.35em;
  }
  beam-links .node.trapping .status { color: var(--brass); }
  beam-links .node .badge {
    position: absolute;
    top: -.6rem;
    right: -.4rem;
    min-width: 1.4rem;
    padding: 0 .3rem;
    font-family: var(--code);
    font-size: .72rem;
    line-height: 1.4rem;
    text-align: center;
    color: var(--bg);
    background: var(--code-string);
    border-radius: .7rem;
  }
  beam-links .node .badge:empty { display: none; }
  beam-links .dot {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 2;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    border-radius: 50%;
    background: var(--code-error);
    box-shadow: 0 0 0 2px var(--bg);
  }
  beam-links .dot.down {
    background: var(--code-string);
  }
  beam-links .key {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: .3rem 1.1rem;
    margin: 1rem 0 0;
    font-size: .85rem;
    color: var(--muted);
  }
  beam-links .key span {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
  }
  beam-links .key i {
    display: inline-block;
    font-style: normal;
  }
  beam-links .key .link-line { width: 1.6rem; border-top: 2px solid var(--ink); }
  beam-links .key .monitor-line { width: 1.6rem; border-top: 2px dashed var(--muted); }
  beam-links .key .signal-dot,
  beam-links .key .down-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--code-error); }
  beam-links .key .down-dot { background: var(--code-string); }
  beam-links .key .trap-box { width: 1rem; height: .8rem; border: 2px solid var(--brass); border-radius: 3px; box-shadow: inset 0 0 0 1px var(--brass); }
  beam-links .detail {
    margin-top: 1.25rem;
    padding-top: .75rem;
    border-top: 1.5px solid var(--line);
  }
  beam-links [hidden] {
    display: none !important;
  }
  beam-links .who {
    margin: 0;
    min-height: 3.3em;
    font-size: .95rem;
  }
  beam-links .actions {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    margin: .6rem 0 0;
  }
  beam-links button.action,
  beam-links label.action {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
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
  beam-links label.action input {
    width: 1.1rem;
    height: 1.1rem;
    margin: 0;
    accent-color: var(--brass);
  }
  beam-links label.action:has(:checked) {
    border-color: var(--brass);
    background: var(--tint);
  }
  beam-links button.action:disabled,
  beam-links label.action:has(:disabled) {
    cursor: default;
    opacity: .45;
  }
  beam-links button.action:focus-visible,
  beam-links label.action:has(:focus-visible) {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  beam-links button.reset {
    margin-left: auto;
  }
  beam-links .mailbox {
    margin: .6rem 0 0;
    min-height: 1.5em;
    font-size: .85rem;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  beam-links .log {
    height: 11.5rem;
    margin: 1rem 0 0;
    padding: .5rem .7rem;
    overflow-y: auto;
    list-style: none;
    font-size: .85rem;
    line-height: 1.45;
    background: var(--code-bg);
    border: 1px solid var(--code-line);
    border-radius: var(--radius);
    overflow-wrap: anywhere;
  }
  beam-links .log li::first-letter {
    text-transform: uppercase;
  }
  beam-links .log li + li {
    margin-top: .3rem;
  }
  beam-links .log li.new {
    animation: beam-links-new 1s;
  }
  @keyframes beam-links-new {
    from { background: var(--code-mark); }
  }
  beam-links code {
    font-size: .92em;
  }
  @media (prefers-reduced-motion: reduce) {
    beam-links .node,
    beam-links .node.hit,
    beam-links .log li.new {
      transition: none;
      animation: none;
    }
  }
</style>`);

customElements.define("beam-links", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.uid = `beam-links-${++ids}`;

    this.innerHTML = `
      <p class="note">A simulation, with the BEAM's rules for exit signals and monitors. Signals travel slowly here so you can follow them; in the BEAM they take microseconds. Pick a process, then crash it, let it finish, or kill it.</p>
      <div class="graph">
        <svg class="lines" aria-hidden="true">
          <defs>
            <marker id="${this.uid}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z"/>
            </marker>
          </defs>
          <g class="drawn"></g>
        </svg>
        ${Object.keys(ROLES).map((role) => `
          <button type="button" class="node" data-role="${role}" style="grid-area: ${role}" aria-pressed="false">
            <span class="name">${ROLES[role].name}</span>
            <span class="pid"></span>
            <span class="status"></span>
            <span class="status more"></span>
            <span class="badge" aria-hidden="true"></span>
          </button>`).join("")}
        <div class="dots" aria-hidden="true"></div>
      </div>
      <p class="key" aria-hidden="true">
        <span><i class="link-line"></i>link</span>
        <span><i class="monitor-line"></i>monitor</span>
        <span><i class="trap-box"></i>traps exits</span>
        <span><i class="signal-dot"></i>exit signal</span>
        <span><i class="down-dot"></i><code>:DOWN</code> message</span>
      </p>
      <div class="detail">
        <p class="who" aria-live="polite"></p>
        <div class="actions">
          <button type="button" class="action" data-act="crash"></button>
          <button type="button" class="action" data-act="finish"></button>
          <button type="button" class="action" data-act="kill"></button>
          <label class="action"><input type="checkbox" data-act="trap"> traps exits</label>
          <button type="button" class="action" data-act="monitor">monitor the worker</button>
          <button type="button" class="action reset" data-act="reset">Reset</button>
        </div>
        <p class="mailbox"></p>
      </div>
      <ol class="log" role="log" aria-label="What happened"></ol>`;

    this.$ = (selector) => this.querySelector(selector);
    this.graph = this.$(".graph");
    this.drawn = this.$(".drawn");
    this.dots = this.$(".dots");
    this.logList = this.$(".log");
    this.nodes = Object.fromEntries([...this.querySelectorAll(".node")].map((el) => [el.dataset.role, el]));
    this.timers = new Set();

    this.graph.addEventListener("click", (e) => {
      const node = e.target.closest(".node");
      if (node) this.select(node.dataset.role);
    });
    this.$(".actions").addEventListener("click", (e) => {
      const act = e.target.closest("button[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "reset") return this.reset();
      if (act === "monitor") return this.monitorWorker();
      const p = this.current(this.selected);
      if (!p?.alive) return;
      if (act === "crash") this.exit(p, "crash", `${p.name} raised ${code('"oops"')}`);
      if (act === "finish") this.exit(p, "normal", `${p.name} ran out of code to run`);
      if (act === "kill") this.kill(p);
    });
    this.$('[data-act="trap"]').addEventListener("change", (e) => {
      const p = this.current(this.selected);
      if (!p?.alive) return;
      p.trap = e.target.checked;
      this.log(`${p.name} now runs ${code(`Process.flag(:trap_exit, ${p.trap})`)}.`);
      this.render();
    });

    this.resizer = new ResizeObserver(() => this.draw());
    this.resizer.observe(this.graph);
    this.ticker = setInterval(() => this.tick(), 1000);

    this.reset();
  }

  disconnectedCallback() {
    this.resizer?.disconnect();
    clearInterval(this.ticker);
    this.clearTimers();
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const a of this.dots.getAnimations({ subtree: true })) a.cancel();
    this.dots.replaceChildren();
  }

  after(ms, fn) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  hop() {
    return reducedMotion.matches ? HOP_REDUCED : HOP;
  }

  reset() {
    this.clearTimers();
    this.nextPid = 110;
    this.nextRef = 101;
    this.procs = new Map(); // pid number -> process
    this.slots = {}; // role -> pid number
    this.links = new Set(); // "a-b" with a < b
    this.monitors = []; // { ref, from, to }
    this.restarts = 0;
    this.logList.replaceChildren();

    for (const role of ["restarter", "watcher", "counter"]) this.spawn(role);
    const worker = this.spawn("worker");
    this.link(this.current("restarter"), worker);
    for (const role of ["helper1", "helper2"]) this.link(worker, this.spawn(role));
    this.monitors.push({ ref: this.nextRef++, from: this.slots.watcher, to: worker.pid });

    this.log(`The restarter traps exits and started the worker, ${code(this.pidText(worker))}, which started two helpers. The watcher monitors the worker. The counter counts, linked to nothing.`);
    this.select(this.selected ?? "helper1");
  }

  // Processes

  spawn(role) {
    const p = {
      pid: this.nextPid++,
      role,
      name: ROLES[role].name,
      alive: true,
      trap: !!ROLES[role].trap,
      reason: null,
      mailbox: [],
      count: 0,
    };
    this.procs.set(p.pid, p);
    this.slots[role] = p.pid;
    return p;
  }

  current(role) {
    return this.procs.get(this.slots[role]);
  }

  pidText(p) {
    return `#PID<0.${p.pid}.0>`;
  }

  linkKey(a, b) {
    return a.pid < b.pid ? `${a.pid}-${b.pid}` : `${b.pid}-${a.pid}`;
  }

  link(a, b) {
    this.links.add(this.linkKey(a, b));
  }

  linkedTo(p) {
    const out = [];
    for (const key of this.links) {
      const [a, b] = key.split("-").map(Number);
      if (a === p.pid) out.push(this.procs.get(b));
      if (b === p.pid) out.push(this.procs.get(a));
    }
    return out;
  }

  // p exits with reason. Each link carries an exit signal to the other end,
  // and each monitor on p sends a :DOWN; monitors p held go with it.
  exit(p, reason, why) {
    if (!p.alive) return;
    p.alive = false;
    p.reason = reason;
    p.mailbox = [];
    this.log(`${why}: it exits with ${code(REASONS[reason].code)}.`);
    this.flash(p);

    for (const q of this.linkedTo(p)) {
      const key = this.linkKey(p, q);
      this.send(p, q, "signal", () => {
        this.links.delete(key);
        this.receiveExit(q, p, reason);
      });
    }
    for (const m of this.monitors.filter((m) => m.to === p.pid)) {
      const watcher = this.procs.get(m.from);
      this.send(p, watcher, "down", () => {
        this.monitors = this.monitors.filter((x) => x !== m);
        this.receiveDown(watcher, p, m, reason);
      });
    }
    this.monitors = this.monitors.filter((m) => m.from !== p.pid || m.to === p.pid);
    this.render();
  }

  kill(p) {
    this.log(`You: ${code(`Process.exit(${this.pidText(p)}, :kill)`)}. ${p.trap ? "Trapping exits doesn't help: " : ""}${code(":kill")} can't be trapped.`);
    this.exit(p, "killed", `${p.name} was killed`);
  }

  // What a process does with an exit signal from a link
  receiveExit(q, from, reason) {
    if (!q.alive) {
      this.render();
      return;
    }
    const message = `{:EXIT, ${this.pidText(from)}, ${REASONS[reason].code}}`;
    if (q.trap) {
      if (q.role === "restarter") {
        this.log(`The restarter traps exits, so the signal became a message, and it received ${code(message)}.`);
        this.flash(q);
        this.restarterHandles(q, from, reason);
      } else {
        q.mailbox.push(message);
        this.log(`${q.name} traps exits, so the signal became a message in its mailbox: ${code(message)}.`);
        this.flash(q);
      }
      this.render();
      return;
    }
    if (reason === "normal") {
      this.log(`${q.name} got an exit signal from ${from.name} with the reason ${code(":normal")}, and dropped it.`);
      this.render();
      return;
    }
    this.exit(q, reason, `${q.name} got an exit signal from ${from.name}, and isn't trapping exits`);
  }

  receiveDown(watcher, from, m, reason) {
    if (!watcher.alive) {
      this.render();
      return;
    }
    this.log(`The watcher received ${code(`{:DOWN, #Reference<0.0.0.${m.ref}>, :process, ${this.pidText(from)}, ${REASONS[reason].code}}`)}. Its monitor is gone with the process.`);
    this.flash(watcher);
    this.render();
  }

  // The restarter's receive, from restart.exs
  restarterHandles(r, from, reason) {
    if (from.pid !== this.slots.worker) return;
    if (reason === "normal") {
      this.log("The worker finished, so the restarter has nothing to do.");
      return;
    }
    if (this.restarts >= TRIES) {
      this.after(RESTART_AFTER, () => {
        if (r.alive) this.exit(r, "too_many_restarts", `The worker crashed again after ${TRIES} restarts, so the restarter gives up`);
      });
      return;
    }
    this.after(RESTART_AFTER, () => {
      if (!r.alive) return;
      this.restarts += 1;
      const worker = this.spawn("worker");
      this.link(r, worker);
      this.log(`The restarter started a new worker, ${code(this.pidText(worker))} (restart ${this.restarts} of ${TRIES}).`);
      this.flash(worker);
      this.render();
      this.after(SPAWN_AFTER, () => {
        if (!worker.alive) return;
        const started = [];
        for (const role of ["helper1", "helper2"]) {
          if (this.current(role)?.alive) continue;
          const h = this.spawn(role);
          this.link(worker, h);
          this.flash(h);
          started.push(`${h.name}, ${code(this.pidText(h))}`);
        }
        if (started.length) this.log(`The new worker started ${started.join(", and ")}.`);
        this.render();
      });
    });
  }

  monitorWorker() {
    const watcher = this.current("watcher");
    const worker = this.current("worker");
    if (!watcher.alive || !worker.alive || this.watching()) return;
    const ref = this.nextRef++;
    this.monitors.push({ ref, from: watcher.pid, to: worker.pid });
    this.log(`The watcher: ${code(`Process.monitor(${this.pidText(worker)})`)}, which returned ${code(`#Reference<0.0.0.${ref}>`)}.`);
    this.render();
  }

  watching() {
    return this.monitors.some((m) => m.from === this.slots.watcher && m.to === this.slots.worker);
  }

  tick() {
    const c = this.current("counter");
    if (!c?.alive) return;
    c.count += 1;
    this.nodes.counter.querySelector(".status").textContent = `count ${c.count}`;
  }

  // Drawing

  select(role) {
    this.selected = role;
    for (const [r, el] of Object.entries(this.nodes)) el.setAttribute("aria-pressed", String(r === role));
    this.render();
  }

  // The two status lines in a process's box
  status(p) {
    if (!p.alive) return ["exited:", REASONS[p.reason].short];
    if (p.role === "counter") return [`count ${p.count}`, ""];
    const restarts = p.role === "restarter" ? `restarts ${this.restarts}/${TRIES}` : "";
    return [p.trap ? "traps exits" : "running", restarts];
  }

  render() {
    for (const [role, el] of Object.entries(this.nodes)) {
      const p = this.current(role);
      el.classList.toggle("dead", !p.alive);
      el.classList.toggle("trapping", p.alive && p.trap);
      el.querySelector(".pid").textContent = this.pidText(p);
      const [status, more] = this.status(p);
      el.querySelector(".status").textContent = status;
      el.querySelector(".more").textContent = more;
      el.querySelector(".badge").textContent = p.mailbox.length ? `✉ ${p.mailbox.length}` : "";
      el.setAttribute("aria-label", `${p.name}, ${this.pidText(p)}, ${[status, more].filter(Boolean).join(" ")}${p.mailbox.length ? `, ${p.mailbox.length} in its mailbox` : ""}`);
    }

    const p = this.current(this.selected);
    const linked = this.linkedTo(p).map((q) => q.name);
    const watchedBy = this.monitors.filter((m) => m.to === p.pid).map((m) => this.procs.get(m.from).name);
    const watches = this.monitors.filter((m) => m.from === p.pid).map((m) => this.procs.get(m.to).name);
    const facts = [
      p.alive ? (p.trap ? "running, trapping exits" : "running") : `exited with ${code(REASONS[p.reason].code)}`,
      linked.length ? `linked to ${linked.join(", ")}` : p.alive ? "linked to nothing" : "",
      watches.length ? `monitoring ${watches.join(", ")}` : "",
      watchedBy.length ? `monitored by ${watchedBy.join(", ")}` : "",
    ].filter(Boolean);
    this.$(".who").innerHTML = `<strong>${p.name}</strong> ${code(this.pidText(p))}: ${facts.join("; ")}.`;

    const act = (name) => this.$(`[data-act="${name}"]`);
    act("crash").textContent = `Crash ${p.name}`;
    act("finish").textContent = `Let ${p.name} finish`;
    act("kill").textContent = `Kill ${p.name}`;
    for (const name of ["crash", "finish", "kill"]) act(name).disabled = !p.alive;
    const trap = act("trap");
    const trapLabel = trap.closest("label");
    trapLabel.hidden = !ROLES[p.role].canTrap;
    trap.checked = p.trap;
    trap.disabled = !p.alive;
    const monitor = act("monitor");
    monitor.hidden = p.role !== "watcher";
    monitor.disabled = !p.alive || !this.current("worker").alive || this.watching();

    this.$(".mailbox").innerHTML = p.mailbox.length
      ? `mailbox: ${p.mailbox.map(code).join(" ")}`
      : p.alive ? "mailbox: empty" : "";

    this.draw();
  }

  // Where a node's box is, in the graph's coordinates
  box(role) {
    const g = this.graph.getBoundingClientRect();
    const r = this.nodes[role].getBoundingClientRect();
    return { x: r.left - g.left + r.width / 2, y: r.top - g.top + r.height / 2, hw: r.width / 2, hh: r.height / 2 };
  }

  // The point where the line from a's centre towards b leaves a's box
  edge(a, b, gap = 0) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.min(dx ? (a.hw + gap) / Math.abs(dx) : Infinity, dy ? (a.hh + gap) / Math.abs(dy) : Infinity);
    return { x: a.x + dx * t, y: a.y + dy * t };
  }

  ends(fromRole, toRole) {
    const a = this.box(fromRole);
    const b = this.box(toRole);
    return [this.edge(a, b), this.edge(b, a, 3)];
  }

  draw() {
    const lines = [];
    for (const key of this.links) {
      const [a, b] = key.split("-").map((n) => this.procs.get(Number(n)));
      if (this.slots[a.role] !== a.pid || this.slots[b.role] !== b.pid) continue;
      const [p, q] = this.ends(a.role, b.role);
      lines.push(`<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`);
    }
    for (const m of this.monitors) {
      const a = this.procs.get(m.from);
      const b = this.procs.get(m.to);
      if (this.slots[a.role] !== a.pid || this.slots[b.role] !== b.pid) continue;
      const [p, q] = this.ends(a.role, b.role);
      lines.push(`<line class="monitor" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" marker-end="url(#${this.uid}-arrow)"/>`);
    }
    this.drawn.innerHTML = lines.join("");
  }

  // A signal or a :DOWN travelling from one process to another, then done()
  send(from, to, kind, done) {
    const hop = this.hop();
    if (!reducedMotion.matches) {
      const [p, q] = this.ends(from.role, to.role);
      const dot = document.createElement("div");
      dot.className = `dot${kind === "down" ? " down" : ""}`;
      this.dots.append(dot);
      const anim = dot.animate(
        [{ transform: `translate(${p.x}px, ${p.y}px)` }, { transform: `translate(${q.x}px, ${q.y}px)` }],
        { duration: hop, easing: "ease-in-out", fill: "forwards" },
      );
      anim.finished.then(() => dot.remove(), () => dot.remove());
    }
    this.after(hop, done);
  }

  flash(p) {
    const el = this.nodes[p.role];
    el.classList.remove("hit");
    void el.offsetWidth;
    el.classList.add("hit");
  }

  log(html) {
    const li = document.createElement("li");
    li.innerHTML = html;
    for (const old of this.logList.querySelectorAll(".new")) old.classList.remove("new");
    li.className = "new";
    this.logList.append(li);
    this.logList.scrollTop = this.logList.scrollHeight;
  }
});
