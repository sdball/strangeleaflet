// <link-scenes>: the four scenes of link.exs, animated. Each scene shows its
// code from link.exs, with the line that's running marked, and the processes
// it starts as boxes, with their links drawn between them. When a process
// exits, a dot carries its exit signal along each of its links, labelled with
// the reason, and the process at the other end does what the BEAM does with
// it: dies of it with the same reason, or drops it if the reason is :normal
// (nothing here traps exits). At 200 ms the scene ends with the line the
// script printed for it, copied from the run on the page.
//
// The rules are the Erlang reference manual's (Links, Receiving Exit
// Signals), as on the page. Times are the script's (sleep 100 ms, check at
// 200 ms), slowed down so each step can be read; in the BEAM a signal takes
// microseconds.
//
// It holds a static fallback (link.exs and its output: what feed readers and
// no-JS visitors see) and replaces it once this module runs. The first scene
// plays when the widget scrolls into view, unless the reader prefers reduced
// motion; then nothing plays until it's asked to, and the dots don't travel,
// but the same things happen in the same order.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const HOP = 1100; // ms an exit signal takes along a link
const HOP_REDUCED = 300;
const READ_MS = 38; // ms per character of a step's caption, to read it
const MIN_STEP = 1400;
const MAX_STEP = 4200;

const REASONS = {
  crash: { label: "RuntimeError", status: "RuntimeError" },
  normal: { label: ":normal", status: ":normal" },
};

// Each scene's code is link.exs's, without the IO.puts that names it. A step
// marks a line (or lines) of it, sets the clock, does something, and says
// what happened; the scene's processes are placed left to right.
const SCENES = [
  {
    title: "The child crashes",
    procs: ["parent", "child"],
    output: "parent alive? false",
    code: `parent =
  spawn(fn ->
    spawn_link(fn ->
      Process.sleep(100)
      raise "oops"
    end)

    idle.()
  end)

check.(parent: parent)`,
    async play(s) {
      await s.step({ lines: [0, 1], t: 0, say: "The script spawns `parent`.", run: () => s.spawn("parent") });
      await s.step({ lines: [2], say: "`parent` spawns `child` with `spawn_link`, so the two start out linked.", run: () => { s.spawn("child"); s.link("parent", "child"); } });
      await s.step({ lines: [3, 7], say: "`child` sleeps for 100 ms. `parent` waits forever.", run: () => { s.status("child", "sleeping"); s.status("parent", "waiting"); } });
      await s.step({ lines: [4], t: 100, say: "`child` raises. It exits with the error as its reason, and its link carries an exit signal with that reason to `parent`.", run: () => s.die("child", "crash") });
      await s.signal("child", "parent", "crash");
      await s.step({ lines: [4], say: "`parent` isn't trapping exits, so the signal kills it, with the same reason.", run: () => s.die("parent", "crash") });
      await s.step({ lines: [10], t: 200, say: "At 200 ms the script checks on `parent`. It's dead, killed by its child's crash.", run: () => s.print() });
    },
  },
  {
    title: "The parent crashes",
    procs: ["parent", "child"],
    output: "parent alive? false, child alive? false",
    code: `me = self()

parent =
  spawn(fn ->
    send(me, {:child, spawn_link(idle)})
    Process.sleep(100)
    raise "oops"
  end)

child = receive do: ({:child, pid} -> pid)
check.(parent: parent, child: child)`,
    async play(s) {
      await s.step({ lines: [0], t: 0, say: "The script keeps its own pid as `me`, so `parent` can send it `child`'s." });
      await s.step({ lines: [2, 3], say: "The script spawns `parent`.", run: () => s.spawn("parent") });
      await s.step({ lines: [4], say: "`parent` spawns `child`, linked, which waits forever. `parent` sends its pid back to the script.", run: () => { s.spawn("child", "waiting"); s.link("parent", "child"); } });
      await s.step({ lines: [9], say: "The script receives `child`'s pid, to check on it later." });
      await s.step({ lines: [5], say: "`parent` sleeps for 100 ms.", run: () => s.status("parent", "sleeping") });
      await s.step({ lines: [6], t: 100, say: "This time `parent` raises, and its link carries the exit signal to `child`.", run: () => s.die("parent", "crash") });
      await s.signal("parent", "child", "crash");
      await s.step({ lines: [6], say: "`child` isn't trapping exits either, so it dies too. A link works both ways, whichever process made it.", run: () => s.die("child", "crash") });
      await s.step({ lines: [10], t: 200, say: "At 200 ms the script checks: both are dead.", run: () => s.print() });
    },
  },
  {
    title: "The child finishes",
    procs: ["parent", "child"],
    output: "parent alive? true",
    code: `parent =
  spawn(fn ->
    spawn_link(fn -> Process.sleep(100) end)
    idle.()
  end)

check.(parent: parent)`,
    async play(s) {
      await s.step({ lines: [0, 1], t: 0, say: "The script spawns `parent`.", run: () => s.spawn("parent") });
      await s.step({ lines: [2], say: "`parent` spawns `child`, linked. `child` sleeps for 100 ms, and then it has no more code to run.", run: () => { s.spawn("child", "sleeping"); s.link("parent", "child"); } });
      await s.step({ lines: [3], say: "`parent` waits forever.", run: () => s.status("parent", "waiting") });
      await s.step({ lines: [2], t: 100, say: "`child` finishes. It exits with the reason `:normal`, and its link carries that to `parent`.", run: () => s.die("child", "normal") });
      await s.signal("child", "parent", "normal");
      await s.step({ lines: [3], say: "A process that isn't trapping exits drops an exit signal with the reason `:normal`. `parent` carries on waiting, linked to nothing now.", run: () => s.flash("parent") });
      await s.step({ lines: [6], t: 200, say: "At 200 ms the script checks: `parent` is still alive.", run: () => s.print() });
    },
  },
  {
    title: "A chain of three",
    procs: ["a", "b", "c"],
    output: "a alive? false, b alive? false, c alive? false",
    code: `a = spawn(idle)

b =
  spawn(fn ->
    Process.link(a)
    idle.()
  end)

c =
  spawn(fn ->
    Process.link(b)
    Process.sleep(100)
    raise "oops"
  end)

check.(a: a, b: b, c: c)`,
    async play(s) {
      await s.step({ lines: [0], t: 0, say: "The script spawns `a`, which waits forever.", run: () => s.spawn("a", "waiting") });
      await s.step({ lines: [2, 3, 4, 5], say: "It spawns `b`, which links itself to `a` and waits forever.", run: () => { s.spawn("b", "waiting"); s.link("a", "b"); } });
      await s.step({ lines: [8, 9, 10, 11], say: "It spawns `c`, which links itself to `b` and sleeps for 100 ms. `c` isn't linked to `a`.", run: () => { s.spawn("c", "sleeping"); s.link("b", "c"); } });
      await s.step({ lines: [12], t: 100, say: "`c` raises. Its only link carries the exit signal to `b`.", run: () => s.die("c", "crash") });
      await s.signal("c", "b", "crash");
      await s.step({ lines: [5], say: "`b` isn't trapping exits, so it dies with the same reason, and its own link carries a signal on to `a`.", run: () => s.die("b", "crash") });
      await s.signal("b", "a", "crash");
      await s.step({ lines: [0], say: "`a` dies too. It was never linked to `c`, but the crash came along the chain.", run: () => s.die("a", "crash") });
      await s.step({ lines: [15], t: 200, say: "At 200 ms the script checks: all three are dead.", run: () => s.print() });
    },
  },
];

const STATUS = {
  running: ["running", ""],
  sleeping: ["sleeping", "100 ms"],
  waiting: ["waiting", "forever"],
};

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// A caption's `code` as <code>
const inline = (s) => escape(s).replace(/`([^`]+)`/g, "<code>$1</code>");

// Just enough of an Elixir highlighter for these lines, with the classes
// Pygments gives the same tokens, so the theme colours them as it does the
// page's code blocks.
const TOKENS = /("[^"]*")|(:\w+)|(\w+)(?=: )|\b(fn|do|end|raise|receive)\b|\b([A-Z]\w*)\b|(\d+)|(->|=|\.)|([(){},;:])|(\w+)/g;
const CLASSES = ["s2", "ss", "ss", "k", "nc", "mi", "o", "p", "n"];
const highlight = (line) => {
  let html = "";
  let at = 0;
  for (const m of line.matchAll(TOKENS)) {
    const kind = CLASSES[m.slice(1).findIndex((g) => g !== undefined)];
    html += escape(line.slice(at, m.index)) + `<span class="${kind}">${escape(m[0])}</span>`;
    at = m.index + m[0].length;
  }
  return html + escape(line.slice(at));
};

let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  link-scenes:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: link-scenes / inline-size;
  }
  link-scenes .note {
    margin: 0 0 .9rem;
    font-size: .9rem;
    color: var(--muted);
  }
  link-scenes .scenes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: .4rem;
    margin: 0 0 1rem;
  }
  @container link-scenes (min-width: 40rem) {
    link-scenes .scenes { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  link-scenes button {
    min-height: 44px;
    padding: .35rem .7rem;
    font: inherit;
    font-family: var(--type);
    font-size: .88rem;
    line-height: 1.2;
    color: var(--ink);
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  link-scenes .scenes button {
    text-align: left;
  }
  link-scenes .scenes button[aria-pressed="true"] {
    border-color: var(--brass);
    background: var(--tint);
  }
  link-scenes button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  link-scenes .highlight {
    margin: 0;
  }
  link-scenes .highlight pre {
    margin: 0;
    font-size: clamp(.68rem, 2.6cqi, .85rem);
  }
  link-scenes .highlight .line {
    display: inline-block;
    min-width: 100%;
    margin: 0 -.5rem;
    padding: 0 .5rem;
    border-left: 3px solid transparent;
    transition: background-color .25s;
  }
  link-scenes .highlight .line.on {
    background: var(--code-mark);
    border-left-color: var(--brass);
  }
  link-scenes .stage {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--procs), minmax(0, 1fr));
    column-gap: clamp(2.25rem, 14cqi, 6rem);
    max-width: 32rem;
    margin: 2.25rem auto 0;
  }
  link-scenes .stage.three {
    column-gap: clamp(1.5rem, 10cqi, 4.5rem);
  }
  link-scenes .stage.three .proc {
    padding-inline: .4rem;
  }
  link-scenes .clock {
    position: absolute;
    top: -1.75rem;
    right: 0;
    font-family: var(--code);
    font-size: .8rem;
    color: var(--muted);
  }
  link-scenes .lines,
  link-scenes .dots {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  link-scenes .lines line {
    stroke: var(--ink);
    stroke-width: 2;
  }
  link-scenes .proc {
    position: relative;
    z-index: 1;
    display: grid;
    gap: .1rem;
    min-width: 0;
    padding: .45rem .5rem;
    color: var(--ink);
    background: var(--bg);
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    transition: opacity .3s;
  }
  link-scenes .proc.unborn {
    opacity: 0;
  }
  link-scenes .proc.dead {
    color: var(--muted);
    border-style: dashed;
    border-color: var(--line);
  }
  link-scenes .proc.dead.crashed {
    border-color: var(--code-error);
  }
  link-scenes .proc.hit {
    animation: link-scenes-hit .7s;
  }
  @keyframes link-scenes-hit {
    from { background: var(--selection); }
  }
  link-scenes .proc .name {
    font-family: var(--code);
    font-weight: 700;
    font-size: .95rem;
    line-height: 1.25;
  }
  link-scenes .proc .status {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-height: 1.35em;
    font-family: var(--code);
    font-size: clamp(.55rem, 2.7cqi, .78rem);
    line-height: 1.35;
    color: var(--muted);
  }
  link-scenes .proc.crashed .status { color: var(--code-error); }
  link-scenes .dot {
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
  link-scenes .dot.normal {
    background: var(--bg);
    border: 2.5px solid var(--ink);
  }
  /* The reason rides under the row of boxes, clear of their names */
  link-scenes .dot span {
    position: absolute;
    top: calc(var(--below) + 7px);
    left: 50%;
    transform: translateX(-50%);
    padding: 0 .25rem;
    font-family: var(--code);
    font-size: .72rem;
    line-height: 1.4;
    white-space: nowrap;
    color: var(--ink);
    background: var(--bg);
    border-radius: 3px;
  }
  link-scenes .key {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: .3rem 1.1rem;
    margin: 1.9rem 0 0;
    font-size: .85rem;
    color: var(--muted);
  }
  link-scenes .key span {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
  }
  link-scenes .key i {
    display: inline-block;
  }
  link-scenes .key .link-line { width: 1.6rem; border-top: 2px solid var(--ink); }
  link-scenes .key .crash-dot,
  link-scenes .key .normal-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--code-error); }
  link-scenes .key .normal-dot { background: none; border: 2.5px solid var(--ink); }
  link-scenes .say {
    min-height: 4.4em;
    margin: 1rem 0 0;
    font-size: .95rem;
  }
  link-scenes .output {
    margin: .5rem 0 0;
  }
  link-scenes .output pre {
    min-height: 1.5em;
    color: var(--code-ink);
  }
  link-scenes .output .waiting {
    color: var(--code-comment);
    font-style: italic;
  }
  link-scenes .controls {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    margin: .8rem 0 0;
  }
  link-scenes .controls .next {
    margin-left: auto;
  }
  link-scenes button:disabled {
    cursor: default;
    opacity: .45;
  }
  link-scenes code {
    font-size: .92em;
  }
  @media (prefers-reduced-motion: reduce) {
    link-scenes .proc,
    link-scenes .proc.hit,
    link-scenes .highlight .line {
      transition: none;
      animation: none;
    }
  }
</style>`);

class Cancelled extends Error {}

customElements.define("link-scenes", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.uid = `link-scenes-${++ids}`;

    this.innerHTML = `
      <p class="note">The four scenes from link.exs, slowed down so you can follow each exit signal. In the BEAM, a signal takes microseconds.</p>
      <div class="scenes" role="group" aria-label="Scenes">
        ${SCENES.map((scene, i) => `<button type="button" data-scene="${i}" aria-pressed="false">${i + 1}. ${scene.title}</button>`).join("")}
      </div>
      <div class="highlight code"><pre></pre></div>
      <div class="stage">
        <span class="clock"></span>
        <svg class="lines" aria-hidden="true"></svg>
        <div class="dots" aria-hidden="true"></div>
      </div>
      <p class="key" aria-hidden="true">
        <span><i class="link-line"></i>link</span>
        <span><i class="crash-dot"></i>exit signal: a crash</span>
        <span><i class="normal-dot"></i>exit signal: <code>:normal</code></span>
      </p>
      <p class="say" aria-live="polite"></p>
      <div class="highlight output" aria-label="What the script printed"><pre></pre></div>
      <div class="controls">
        <button type="button" class="play">Play</button>
        <button type="button" class="next">Next scene</button>
      </div>`;

    this.$ = (selector) => this.querySelector(selector);
    this.stage = this.$(".stage");
    this.lines = this.$(".lines");
    this.dots = this.$(".dots");
    this.timers = new Map(); // timeout -> its promise's reject
    this.run = 0;

    this.$(".scenes").addEventListener("click", (e) => {
      const button = e.target.closest("[data-scene]");
      if (button) this.play(Number(button.dataset.scene));
    });
    this.$(".play").addEventListener("click", () => this.play(this.scene));
    this.$(".next").addEventListener("click", () => this.play((this.scene + 1) % SCENES.length));

    this.resizer = new ResizeObserver(() => this.draw());
    this.resizer.observe(this.stage);

    this.load(0);

    // Play the first scene once, when the widget comes into view
    this.observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      this.observer.disconnect();
      if (!reducedMotion.matches && !this.played) this.play(0);
    }, { threshold: 0.5 });
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.resizer?.disconnect();
    this.observer?.disconnect();
    this.cancel();
  }

  cancel() {
    this.run += 1;
    for (const [t, reject] of this.timers) {
      clearTimeout(t);
      reject(new Cancelled());
    }
    this.timers.clear();
    for (const a of this.dots.getAnimations({ subtree: true })) a.cancel();
    this.dots.replaceChildren();
  }

  // Waits ms, or throws Cancelled if another scene starts first
  wait(ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.timers.delete(t);
        resolve();
      }, ms);
      this.timers.set(t, reject);
    });
  }

  // A scene, set out as it is before it runs
  load(i) {
    this.cancel();
    this.scene = i;
    const scene = SCENES[i];
    for (const b of this.querySelectorAll("[data-scene]")) b.setAttribute("aria-pressed", String(Number(b.dataset.scene) === i));

    this.$(".code pre").innerHTML = scene.code.split("\n").map((line) => `<span class="line">${highlight(line) || " "}</span>`).join("\n");
    this.codeLines = [...this.querySelectorAll(".code .line")];

    for (const el of this.stage.querySelectorAll(".proc")) el.remove();
    this.stage.style.setProperty("--procs", scene.procs.length);
    this.stage.classList.toggle("three", scene.procs.length === 3);
    this.procs = {};
    for (const name of scene.procs) {
      const el = document.createElement("div");
      el.className = "proc unborn";
      el.innerHTML = `<span class="name">${name}</span><span class="status"></span><span class="status"></span>`;
      this.stage.insertBefore(el, this.dots);
      this.procs[name] = { name, el, alive: false, born: false, state: "running", reason: null };
    }
    this.links = new Set();

    this.$(".clock").textContent = "";
    this.$(".say").textContent = "";
    this.$(".output pre").innerHTML = `<span class="waiting">(the output goes here)</span>`;
    this.$(".play").textContent = "Play";
    this.render();
  }

  async play(i) {
    this.played = true;
    this.load(i);
    const run = this.run;
    this.$(".play").textContent = "Play again";
    try {
      await SCENES[i].play(this.api());
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
      return;
    }
    if (run !== this.run) return;
    this.mark([]);
  }

  // What a scene's play() can do
  api() {
    return {
      step: async ({ lines, t, say, run }) => {
        run?.();
        this.mark(lines);
        if (t !== undefined) this.$(".clock").textContent = `t = ${t} ms`;
        this.$(".say").innerHTML = inline(say);
        this.render();
        const chars = say.replace(/`/g, "").length;
        await this.wait(Math.min(MAX_STEP, Math.max(MIN_STEP, chars * READ_MS)));
      },
      spawn: (name, state = "running") => {
        Object.assign(this.procs[name], { alive: true, born: true, state });
        this.flash(name);
      },
      status: (name, state) => {
        this.procs[name].state = state;
      },
      link: (a, b) => this.links.add(`${a}-${b}`),
      die: (name, reason) => {
        Object.assign(this.procs[name], { alive: false, reason });
        this.flash(name);
      },
      flash: (name) => this.flash(name),
      signal: (from, to, reason) => this.signal(from, to, reason),
      print: () => {
        this.$(".output pre").textContent = SCENES[this.scene].output;
      },
    };
  }

  mark(lines) {
    this.codeLines.forEach((el, n) => el.classList.toggle("on", lines.includes(n)));
  }

  render() {
    for (const p of Object.values(this.procs)) {
      const [one, two] = p.alive
        ? STATUS[p.state]
        : p.born ? ["exited:", REASONS[p.reason].status] : ["", ""];
      p.el.classList.toggle("unborn", !p.born);
      p.el.classList.toggle("dead", p.born && !p.alive);
      p.el.classList.toggle("crashed", p.born && !p.alive && p.reason === "crash");
      const [a, b] = p.el.querySelectorAll(".status");
      a.textContent = one;
      b.textContent = two;
    }
    this.draw();
  }

  // Where a process's box is, in the stage's coordinates
  box(name) {
    const g = this.stage.getBoundingClientRect();
    const r = this.procs[name].el.getBoundingClientRect();
    return { x: r.left - g.left + r.width / 2, y: r.top - g.top + r.height / 2, hw: r.width / 2, hh: r.height / 2 };
  }

  // The ends of the line between two boxes, side by side
  ends(from, to) {
    const a = this.box(from);
    const b = this.box(to);
    const dir = Math.sign(b.x - a.x);
    return [{ x: a.x + dir * a.hw, y: a.y }, { x: b.x - dir * b.hw, y: b.y }];
  }

  draw() {
    this.lines.innerHTML = [...this.links].map((key) => {
      const [p, q] = this.ends(...key.split("-"));
      return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`;
    }).join("");
  }

  // An exit signal travelling along the link from one process to the other.
  // It's gone once it arrives, and so is the link.
  async signal(from, to, reason) {
    const hop = reducedMotion.matches ? HOP_REDUCED : HOP;
    if (!reducedMotion.matches) {
      const [p, q] = this.ends(from, to);
      const dot = document.createElement("div");
      dot.className = `dot ${reason}`;
      dot.innerHTML = `<span>${REASONS[reason].label}</span>`;
      dot.style.setProperty("--below", `${this.box(from).hh + 4}px`);
      this.dots.append(dot);
      const anim = dot.animate(
        [{ transform: `translate(${p.x}px, ${p.y}px)` }, { transform: `translate(${q.x}px, ${q.y}px)` }],
        { duration: hop, easing: "ease-in-out", fill: "forwards" },
      );
      anim.finished.then(() => dot.remove(), () => dot.remove());
    }
    await this.wait(hop);
    this.links.delete(`${from}-${to}`);
    this.links.delete(`${to}-${from}`);
    this.flash(to);
    this.draw();
  }

  flash(name) {
    const el = this.procs[name].el;
    el.classList.remove("hit");
    void el.offsetWidth;
    el.classList.add("hit");
  }
});
