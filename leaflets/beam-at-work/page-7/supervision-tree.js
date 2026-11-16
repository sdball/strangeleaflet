// <supervision-tree>: page 7's widget. The tree from tree.exs: a top
// supervisor with two children, a worker called counter and a second
// supervisor, Pair, which has three workers of its own, x, y, and z. The
// reader picks a process and crashes it, lets it finish, or (for a
// supervisor) kills it, chooses each supervisor's strategy and each worker's
// restart value, and watches the supervisors deal with it:
//
// - A worker that exits sends an exit signal along its link to its
//   supervisor, which traps exits, so it arrives as {:EXIT, pid, reason}.
//   A supervisor handles one message at a time; any that arrive while it's
//   busy wait in its mailbox.
// - The child's restart value decides whether it's restarted: :permanent
//   always, :transient unless the reason is :normal or :shutdown,
//   :temporary never.
// - Restarts are counted: more than 3 in the last 5 seconds (real seconds,
//   here) and the supervisor gives up. It stops its children in reverse
//   order and exits with :shutdown, which its own supervisor gets as an
//   {:EXIT} from a child. When the top supervisor gives up, the application
//   stops.
// - Otherwise the strategy decides what's restarted. :one_for_one restarts
//   the child; :one_for_all stops the others in reverse order and starts all
//   of them in order; :rest_for_one does that for the children started after
//   the one that died.
// - Stopping a child is Process.exit(pid, :shutdown). These workers don't
//   trap exits, so they die of it at once. A supervisor that's stopped
//   stops its own children first.
// - Killing a supervisor (:kill can't be trapped) sends :killed along all its
//   links: up to its supervisor, and down to its children, which die of it.
//   A supervisor's death takes its whole subtree with it.
//
// The rules are those of Elixir's Supervisor docs and OTP's supervisor.erl,
// as on the page. It's a simulation: signals and starts take a moment here so
// they can be followed, where in the BEAM they take microseconds. A worker's
// count is its state, which goes back to 0 when it's restarted.
//
// It holds a static fallback (what feed readers and no-JS visitors see) and
// replaces it once this module runs. The processes are buttons in a grid,
// the links are lines in an SVG layer, and a dot travels along a line for
// each signal. Under reduced motion the dots don't travel and each step is
// quicker; the same things happen in the same order.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const HOP = 650; // ms a signal takes along a line
const HOP_REDUCED = 250;
const START = 450; // ms for a child's start_link to return
const START_REDUCED = 200;
const MAX_RESTARTS = 3;
const MAX_SECONDS = 5;

const ROLES = {
  top: { name: "top", sup: true, children: ["counter", "pair"] },
  pair: { name: "Pair", sup: true, parent: "top", children: ["x", "y", "z"] },
  counter: { name: "counter", parent: "top" },
  x: { name: "x", parent: "pair" },
  y: { name: "y", parent: "pair" },
  z: { name: "z", parent: "pair" },
};
const ORDER = ["top", "counter", "pair", "x", "y", "z"]; // start order

const STRATEGIES = ["one_for_one", "one_for_all", "rest_for_one"];
const RESTARTS = ["permanent", "transient", "temporary"];

const REASONS = {
  crash: (name) => ({ code: `{%RuntimeError{message: "${name} crashed"}, stacktrace}`, short: "RuntimeError" }),
  normal: () => ({ code: ":normal", short: ":normal" }),
  shutdown: () => ({ code: ":shutdown", short: ":shutdown" }),
  killed: () => ({ code: ":killed", short: ":killed" }),
};

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const code = (s) => `<code>${escape(s)}</code>`;

let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  supervision-tree:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: supervision-tree / inline-size;
  }
  supervision-tree .note {
    margin: 0 0 1rem;
    font-size: .9rem;
    color: var(--muted);
  }
  supervision-tree .graph {
    position: relative;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-areas:
      "top     top top top"
      ".       pair pair pair"
      "counter x   y   z";
    gap: 2.5rem .45rem;
    max-width: 36rem;
    margin: 0 auto;
  }
  supervision-tree .lines,
  supervision-tree .dots {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  supervision-tree .lines line {
    stroke: var(--ink);
    stroke-width: 2;
  }
  supervision-tree .node {
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
  supervision-tree .node.sup {
    justify-self: center;
    width: min(12.5rem, 100%);
    border-color: var(--brass);
    box-shadow: inset 0 0 0 2px var(--brass);
  }
  supervision-tree .node[data-role="pair"] {
    width: min(12.5rem, 66%);
  }
  supervision-tree .node[aria-pressed="true"],
  supervision-tree .node:focus-visible {
    outline: 3px solid var(--link);
    outline-offset: 2px;
  }
  supervision-tree .node.dead {
    color: var(--muted);
    border-style: dashed;
    border-color: var(--line);
    box-shadow: none;
  }
  supervision-tree .node.hit {
    animation: supervision-tree-hit .6s;
  }
  supervision-tree .node.born {
    animation: supervision-tree-born .9s;
  }
  @keyframes supervision-tree-hit {
    from { background: var(--selection); }
  }
  @keyframes supervision-tree-born {
    from { background: var(--tint); }
  }
  supervision-tree .node .name {
    font-family: var(--type);
    font-weight: 700;
    font-size: .9rem;
    line-height: 1.2;
  }
  /* Four lines in every box, none of them wrapping, so a box never changes
     size; the code is sized to fit a pid in a quarter of a phone's width */
  supervision-tree .node > span:not(.badge) {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  supervision-tree .node .pid,
  supervision-tree .node .status {
    font-family: var(--code);
    font-size: clamp(.58rem, 2.6cqi, .76rem);
    line-height: 1.35;
  }
  supervision-tree .node .status {
    color: var(--muted);
    min-height: 1.35em;
  }
  supervision-tree .node.sup .status { color: var(--brass); }
  supervision-tree .node.dead .status { color: var(--muted); }
  /* On a phone, counter moves up beside Pair, so the workers get a third of
     the width each */
  @container supervision-tree (width < 30rem) {
    supervision-tree .graph {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-areas:
        "top     top  top"
        "counter pair pair"
        "x       y    z";
    }
    supervision-tree .node[data-role="pair"] {
      width: 100%;
    }
    supervision-tree .node:not(.sup) .pid .prefix { display: none; }
  }
  supervision-tree .node .badge {
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
  supervision-tree .node .badge:empty { display: none; }
  supervision-tree .dot {
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
  supervision-tree .dot.shutdown {
    background: var(--muted);
  }
  supervision-tree .key {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: .3rem 1.1rem;
    margin: 1rem 0 0;
    font-size: .85rem;
    color: var(--muted);
  }
  supervision-tree .key span {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
  }
  supervision-tree .key i {
    display: inline-block;
    font-style: normal;
  }
  supervision-tree .key .link-line { width: 1.6rem; border-top: 2px solid var(--ink); }
  supervision-tree .key .sup-box { width: 1rem; height: .8rem; border: 2px solid var(--brass); border-radius: 3px; box-shadow: inset 0 0 0 1px var(--brass); }
  supervision-tree .key .signal-dot,
  supervision-tree .key .shutdown-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--code-error); }
  supervision-tree .key .shutdown-dot { background: var(--muted); }
  supervision-tree .detail {
    margin-top: 1.25rem;
    padding-top: .75rem;
    border-top: 1.5px solid var(--line);
  }
  supervision-tree [hidden] {
    display: none !important;
  }
  supervision-tree .who {
    margin: 0;
    min-height: 3.3em;
    font-size: .95rem;
  }
  supervision-tree .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .5rem;
    margin: .6rem 0 0;
  }
  supervision-tree button.action,
  supervision-tree label.action {
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
  supervision-tree label.action select {
    min-height: 32px;
    font: inherit;
    font-family: var(--code);
    font-size: .85rem;
    color: var(--ink);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: calc(var(--radius) / 2);
  }
  supervision-tree button.action:disabled,
  supervision-tree label.action:has(:disabled) {
    cursor: default;
    opacity: .45;
  }
  supervision-tree button.action:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  supervision-tree button.reset {
    margin-left: auto;
  }
  supervision-tree .log {
    height: 12.5rem;
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
  supervision-tree .log li + li {
    margin-top: .3rem;
  }
  supervision-tree .log li.new {
    animation: supervision-tree-new 1s;
  }
  supervision-tree .log li.stop {
    font-weight: 700;
  }
  @keyframes supervision-tree-new {
    from { background: var(--code-mark); }
  }
  supervision-tree code {
    font-size: .92em;
  }
  @media (prefers-reduced-motion: reduce) {
    supervision-tree .node,
    supervision-tree .node.hit,
    supervision-tree .node.born,
    supervision-tree .log li.new {
      transition: none;
      animation: none;
    }
  }
</style>`);

customElements.define("supervision-tree", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.uid = `supervision-tree-${++ids}`;

    this.innerHTML = `
      <p class="note">A simulation, with the rules of Elixir's supervisors. Signals and starts are slowed down so you can follow them; in the BEAM they take microseconds. Restarts are counted in real seconds: more than ${MAX_RESTARTS} in ${MAX_SECONDS} seconds is too many, the default. Pick a process, then crash it.</p>
      <div class="graph">
        <svg class="lines" aria-hidden="true"><g class="drawn"></g></svg>
        ${ORDER.map((role) => `
          <button type="button" class="node${ROLES[role].sup ? " sup" : ""}" data-role="${role}" style="grid-area: ${role}" aria-pressed="false">
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
        <span><i class="sup-box"></i>supervisor (traps exits)</span>
        <span><i class="signal-dot"></i>exit signal</span>
        <span><i class="shutdown-dot"></i><code>:shutdown</code> from a supervisor</span>
      </p>
      <div class="detail">
        <p class="who" aria-live="polite"></p>
        <div class="actions">
          <button type="button" class="action" data-act="crash"></button>
          <button type="button" class="action" data-act="finish"></button>
          <button type="button" class="action" data-act="kill"></button>
          <label class="action" data-for="strategy">strategy <select data-act="strategy">${STRATEGIES.map((s) => `<option value="${s}">:${s}</option>`).join("")}</select></label>
          <label class="action" data-for="restart">restart <select data-act="restart">${RESTARTS.map((s) => `<option value="${s}">:${s}</option>`).join("")}</select></label>
          <button type="button" class="action reset" data-act="reset">Reset</button>
        </div>
      </div>
      <ol class="log" role="log" aria-label="What happened"></ol>`;

    this.$ = (selector) => this.querySelector(selector);
    this.graph = this.$(".graph");
    this.drawn = this.$(".drawn");
    this.dots = this.$(".dots");
    this.logList = this.$(".log");
    this.nodes = Object.fromEntries([...this.querySelectorAll(".node")].map((el) => [el.dataset.role, el]));
    this.timers = new Set();
    this.gen = 0;

    this.graph.addEventListener("click", (e) => {
      const node = e.target.closest(".node");
      if (node) this.select(node.dataset.role);
    });
    this.$(".actions").addEventListener("click", (e) => {
      const act = e.target.closest("button[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "reset") return this.reset();
      const p = this.p[this.selected];
      if (!p?.alive) return;
      if (act === "crash") this.exit(p, REASONS.crash(p.name), `${this.n(p)} raised an error`);
      if (act === "finish") this.exit(p, REASONS.normal(), `${this.n(p)} ran out of code to run`);
      if (act === "kill") {
        this.log(`You: ${code(`Process.exit(${this.pidText(p)}, :kill)`)}. ${code(":kill")} can't be trapped, so trapping exits doesn't help ${this.n(p)}.`);
        this.exit(p, REASONS.killed(), `${this.n(p)} was killed`);
      }
    });
    this.$('[data-act="strategy"]').addEventListener("change", (e) => {
      this.strategy[this.selected] = e.target.value;
      this.log(`${code(ROLES[this.selected].name)}'s strategy is now ${code(`:${e.target.value}`)}.`);
      this.render();
    });
    this.$('[data-act="restart"]').addEventListener("change", (e) => {
      this.restartType[this.selected] = e.target.value;
      this.log(`${code(ROLES[this.selected].name)}'s child spec now says ${code(`restart: :${e.target.value}`)}.`);
      this.render();
    });

    this.resizer = new ResizeObserver(() => this.draw());
    this.resizer.observe(this.graph);
    this.ticker = setInterval(() => this.tick(), 1000);
    this.clock = setInterval(() => this.renderRestarts(), 250);

    this.reset();
  }

  disconnectedCallback() {
    this.resizer?.disconnect();
    clearInterval(this.ticker);
    clearInterval(this.clock);
    this.clearTimers();
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const a of this.dots.getAnimations({ subtree: true })) a.cancel();
    this.dots.replaceChildren();
  }

  // A pause that never ends if the widget is reset meanwhile, so whatever
  // was waiting on it stops there
  wait(ms) {
    const gen = this.gen;
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.timers.delete(t);
        if (gen === this.gen) resolve();
      }, ms);
      this.timers.add(t);
    });
  }

  hop() {
    return reducedMotion.matches ? HOP_REDUCED : HOP;
  }

  startTime() {
    return reducedMotion.matches ? START_REDUCED : START;
  }

  reset() {
    this.gen += 1;
    this.clearTimers();
    // Settings that outlive a restart: they're in the child specs and the
    // supervisors' init/1, not in the processes
    this.strategy = { top: "one_for_one", pair: "one_for_one" };
    this.restartType = { counter: "permanent", x: "permanent", y: "permanent", z: "permanent" };
    this.nextPid = 110;
    this.p = {}; // role -> its current process
    this.appStopped = false;
    this.logList.replaceChildren();
    this.startTree("top", true);
    this.log(`The top supervisor started ${code("counter")} and ${code("Pair")}, and ${code("Pair")} started ${code("x")}, ${code("y")}, and ${code("z")}, each in order. Every worker counts once a second; that count is its state.`);
    this.select(this.selected ?? "x");
  }

  // Processes

  newProc(role) {
    const p = {
      pid: this.nextPid++,
      role,
      name: ROLES[role].name,
      alive: true,
      reason: null,
      count: 0,
      restarts: [], // a supervisor's restart times, ms
      mailbox: 0, // {:EXIT} messages waiting while a supervisor's busy
      queue: Promise.resolve(),
    };
    this.p[role] = p;
    return p;
  }

  // At reset, the whole tree at once
  startTree(role) {
    this.newProc(role);
    for (const child of ROLES[role].children ?? []) this.startTree(child);
  }

  pidText(p) {
    return `#PID<0.${p.pid}.0>`;
  }

  isCurrent(p) {
    return this.p[p.role] === p && p.alive;
  }

  // A child starting: start_link, then init/1. A supervisor's init/1 starts
  // its own children, in order, before it returns.
  async start(sup, role) {
    const p = this.newProc(role);
    this.flash(p, "born");
    this.render();
    if (ROLES[role].sup) {
      this.log(`${this.n(sup)} started ${this.n(p)}, ${code(this.pidText(p))}, whose ${code("init/1")} starts its children.`);
      for (const child of ROLES[role].children) {
        await this.wait(this.startTime());
        if (!this.isCurrent(p)) return;
        await this.start(p, child);
      }
    } else {
      this.log(`${this.n(sup)} started ${this.n(p)}, ${code(this.pidText(p))}, its count back at 0.`);
    }
    await this.wait(this.startTime());
  }

  // p exits on its own (a crash, finishing, or being killed): its links carry
  // the reason up to its supervisor and down to any children
  exit(p, reason, why) {
    if (!p.alive) return;
    this.die(p, reason);
    this.log(`${why}: it exits with ${code(reason.code)}.`);
    const parent = this.p[ROLES[p.role].parent];
    if (parent?.alive) {
      this.send(p, parent, "signal").then(() => this.receiveExit(parent, p, reason));
    }
    for (const role of ROLES[p.role].children ?? []) {
      const child = this.p[role];
      if (child.alive) this.send(p, child, "signal").then(() => this.parentDied(child, p, reason));
    }
    if (!parent) this.applicationStops();
    this.render();
  }

  die(p, reason) {
    p.alive = false;
    p.reason = reason;
    p.mailbox = 0;
    this.flash(p, "hit");
  }

  // A child's supervisor died. A worker dies of the signal (unless it's
  // :normal); a supervisor, trapping exits, stops its children and then
  // exits with the same reason.
  async parentDied(child, parent, reason) {
    if (!this.isCurrent(child)) return;
    if (ROLES[child.role].sup) {
      this.log(`${this.n(child)} received ${code(`{:EXIT, ${this.pidText(parent)}, ${reason.code}}`)} from its own supervisor, so it stops its children and exits too.`);
      await this.stopChildren(child, ROLES[child.role].children);
      if (!this.isCurrent(child)) return;
      this.die(child, reason);
      this.log(`${this.n(child)} exits with ${code(reason.code)}.`);
    } else {
      this.die(child, reason);
      this.log(`${this.n(child)} got an exit signal from ${this.n(parent)}, isn't trapping exits, and exits with ${code(reason.code)}.`);
    }
    this.render();
  }

  // A supervisor, trapping exits, gets {:EXIT, pid, reason} as a message,
  // and handles its messages one at a time
  receiveExit(sup, from, reason) {
    if (!sup.alive) return;
    sup.mailbox += 1;
    this.render();
    sup.queue = sup.queue.then(async () => {
      // A moment in the mailbox, so the message can be seen arriving
      await this.wait(this.hop() / 2);
      if (!this.isCurrent(sup)) return;
      sup.mailbox -= 1;
      this.flash(sup, "hit");
      this.render();
      await this.handleExit(sup, from, reason);
      this.render();
    });
  }

  async handleExit(sup, from, reason) {
    const message = code(`{:EXIT, ${this.pidText(from)}, ${reason.code}}`);
    // A pid it no longer supervises (stopped and replaced since): nothing
    // to do, as in supervisor.erl
    if (this.p[from.role] !== from) {
      this.log(`${this.n(sup)} received ${message}, from a process that's no longer its child, and ignores it.`);
      return;
    }
    const type = ROLES[from.role].sup ? "permanent" : this.restartType[from.role];
    const normal = reason.short === ":normal" || reason.short === ":shutdown";
    if (type === "temporary" || (type === "transient" && normal)) {
      this.log(`${this.n(sup)} received ${message}. ${this.n(from)} is ${code(`:${type}`)}, so it isn't restarted.`);
      return;
    }

    const now = performance.now();
    sup.restarts = sup.restarts.filter((t) => t > now - MAX_SECONDS * 1000);
    if (sup.restarts.length >= MAX_RESTARTS) {
      this.log(`${this.n(sup)} received ${message}. That would be its ${MAX_RESTARTS + 1}th restart in ${MAX_SECONDS} seconds, too many, so it gives up: it stops its children in reverse order and exits with ${code(":shutdown")}.`, "stop");
      await this.stopChildren(sup, ROLES[sup.role].children);
      if (!this.isCurrent(sup)) return;
      this.exit(sup, REASONS.shutdown(), `${this.n(sup)} gave up`);
      return;
    }
    sup.restarts.push(now);

    const children = ROLES[sup.role].children;
    const strategy = this.strategy[sup.role];
    const at = children.indexOf(from.role);
    // Who's restarted: the child alone, every child, or the child and those
    // started after it. Temporary children that are stopped aren't started
    // again.
    const restart =
      strategy === "one_for_one" ? [from.role] :
      strategy === "one_for_all" ? children :
      children.slice(at);
    const stop = restart.filter((role) => role !== from.role);
    const restartText = `restart ${sup.restarts.length} of ${MAX_RESTARTS} in ${MAX_SECONDS} seconds`;
    if (stop.length) {
      this.log(`${this.n(sup)} received ${message}. Its strategy is ${code(`:${strategy}`)}, so it stops ${this.names([...stop].reverse())} first (${restartText}).`);
    } else {
      this.log(`${this.n(sup)} received ${message}. Its strategy is ${code(`:${strategy}`)}, so it restarts ${this.n(from)} alone (${restartText}).`);
    }
    await this.stopChildren(sup, stop);
    if (!this.isCurrent(sup)) return;
    for (const role of restart) {
      if (role !== from.role) {
        if (this.p[role].alive) continue;
        // A temporary child that's stopped is dropped, never started again
        if (!ROLES[role].sup && this.restartType[role] === "temporary") continue;
      }
      await this.start(sup, role);
      if (!this.isCurrent(sup)) return;
    }
  }

  // A process's name in the log, as code
  n(p) {
    return code(p.name);
  }

  names(roles) {
    const names = roles.map((r) => code(ROLES[r].name));
    return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  }

  // A supervisor stops some of its children, last started first, with
  // Process.exit(pid, :shutdown).
  async stopChildren(sup, roles) {
    for (const role of [...roles].reverse()) {
      const child = this.p[role];
      if (!child.alive) continue;
      await this.send(sup, child, "shutdown");
      if (!this.isCurrent(sup) || !this.isCurrent(child)) continue;
      if (ROLES[role].sup) {
        this.log(`${this.n(child)} received ${code(`{:EXIT, ${this.pidText(sup)}, :shutdown}`)} from its supervisor, so it stops its children first.`);
        await this.stopChildren(child, ROLES[role].children);
        if (!this.isCurrent(child)) continue;
      }
      this.die(child, REASONS.shutdown());
      this.log(`${this.n(sup)} stopped ${this.n(child)} with ${code(":shutdown")}.`);
      this.render();
    }
  }

  applicationStops() {
    this.appStopped = true;
    this.log(`The top supervisor has exited, so the application stops. In a release, the whole node shuts down with it, and something outside has to start it again. Reset to start over.`, "stop");
  }

  tick() {
    for (const role of ["counter", "x", "y", "z"]) {
      const p = this.p[role];
      if (p?.alive) p.count += 1;
    }
    this.render();
  }

  renderRestarts() {
    for (const role of ["top", "pair"]) {
      const p = this.p[role];
      if (!p?.alive) continue;
      this.nodes[role].querySelector(".more").textContent = this.status(p)[1];
    }
  }

  // Drawing

  select(role) {
    this.selected = role;
    for (const [r, el] of Object.entries(this.nodes)) el.setAttribute("aria-pressed", String(r === role));
    this.render();
  }

  recentRestarts(p) {
    const now = performance.now();
    return p.restarts.filter((t) => t > now - MAX_SECONDS * 1000).length;
  }

  // The two status lines in a process's box
  status(p) {
    if (ROLES[p.role].sup) {
      const strategy = `:${this.strategy[p.role]}`;
      if (!p.alive) return [`exited: ${p.reason.short}`, strategy];
      return [strategy, `restarts ${this.recentRestarts(p)}/${MAX_RESTARTS} in ${MAX_SECONDS} s`];
    }
    const type = `:${this.restartType[p.role]}`;
    if (!p.alive) return [`✕ ${p.reason.short}`, type];
    return [`count ${p.count}`, type];
  }

  render() {
    for (const [role, el] of Object.entries(this.nodes)) {
      const p = this.p[role];
      el.classList.toggle("dead", !p.alive);
      el.querySelector(".pid").innerHTML = `<span class="prefix">#PID</span>&lt;0.${p.pid}.0&gt;`;
      const [status, more] = this.status(p);
      el.querySelector(".status").textContent = status;
      el.querySelector(".more").textContent = more;
      el.querySelector(".badge").textContent = p.mailbox ? `✉ ${p.mailbox}` : "";
      el.setAttribute("aria-label", `${p.name}, ${this.pidText(p)}, ${status.replace("✕", "exited:")}, ${more}${p.mailbox ? `, ${p.mailbox} in its mailbox` : ""}`);
    }

    const p = this.p[this.selected];
    const role = ROLES[p.role];
    const parent = role.parent ? ROLES[role.parent].name : null;
    const facts = [
      role.sup ? `a supervisor, trapping exits, with the strategy ${code(`:${this.strategy[p.role]}`)}` : `a worker, ${code(`restart: :${this.restartType[p.role]}`)}`,
      parent ? `child of ${parent}` : "the top of the tree",
      role.sup ? `children ${this.names(role.children)}` : "",
      p.alive ? (role.sup ? "running" : `running, count ${p.count}`) : `exited with ${code(p.reason.code)}`,
    ].filter(Boolean);
    this.$(".who").innerHTML = `<strong>${p.name}</strong> ${code(this.pidText(p))}: ${facts.join("; ")}.`;

    const act = (name) => this.$(`[data-act="${name}"]`);
    act("crash").textContent = `Crash ${p.name}`;
    act("finish").textContent = `Let ${p.name} finish`;
    act("kill").textContent = `Kill ${p.name}`;
    act("crash").hidden = !!role.sup;
    act("finish").hidden = !!role.sup;
    act("kill").hidden = !role.sup;
    for (const name of ["crash", "finish", "kill"]) act(name).disabled = !p.alive;
    this.$('[data-for="strategy"]').hidden = !role.sup;
    this.$('[data-for="restart"]').hidden = !!role.sup;
    if (role.sup) act("strategy").value = this.strategy[p.role];
    else act("restart").value = this.restartType[p.role];
    act("strategy").disabled = this.appStopped;
    act("restart").disabled = this.appStopped;

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

  // A link is drawn while both ends are alive
  draw() {
    const lines = [];
    for (const role of ORDER) {
      const parent = ROLES[role].parent;
      if (!parent || !this.p[role]?.alive || !this.p[parent]?.alive) continue;
      const [a, b] = this.ends(parent, role);
      lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    }
    this.drawn.innerHTML = lines.join("");
  }

  // A signal travelling from one process to another
  send(from, to, kind) {
    const hop = this.hop();
    if (!reducedMotion.matches) {
      const [p, q] = this.ends(from.role, to.role);
      const dot = document.createElement("div");
      dot.className = `dot${kind === "shutdown" ? " shutdown" : ""}`;
      this.dots.append(dot);
      const anim = dot.animate(
        [{ transform: `translate(${p.x}px, ${p.y}px)` }, { transform: `translate(${q.x}px, ${q.y}px)` }],
        { duration: hop, easing: "ease-in-out", fill: "forwards" },
      );
      anim.finished.then(() => dot.remove(), () => dot.remove());
    }
    return this.wait(hop);
  }

  flash(p, kind) {
    const el = this.nodes[p.role];
    el.classList.remove("hit", "born");
    void el.offsetWidth;
    el.classList.add(kind);
  }

  log(html, kind) {
    const li = document.createElement("li");
    li.innerHTML = html;
    for (const old of this.logList.querySelectorAll(".new")) old.classList.remove("new");
    li.className = `new${kind ? ` ${kind}` : ""}`;
    this.logList.append(li);
    this.logList.scrollTop = this.logList.scrollHeight;
  }
});
