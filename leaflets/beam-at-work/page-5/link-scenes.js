// <link-scenes>: four small animations of what a link does, one per scene of
// link.exs, each on a loop: the child crashes, the parent crashes, the child
// finishes, and a chain of three where the end one crashes. The processes are
// boxes with their links drawn between them. When a process exits, a dot
// carries its exit signal along each of its links, labelled with the reason,
// and the process at the other end does what the BEAM does with it: dies of
// it with the same reason, or drops it if the reason is :normal (nothing here
// traps exits). A line under each scene sums up what happened.
//
// The rules are the Erlang reference manual's (Links, Receiving Exit
// Signals), as on the page, and each scene ends as link.exs's does. It's
// slowed down so it can be followed; in the BEAM a signal takes microseconds.
//
// It holds a static fallback (link.exs and its output: what feed readers and
// no-JS visitors see) and replaces it once this module runs. The scenes loop
// while the widget is on screen. A reader who prefers reduced motion sees
// each scene's end instead, with a button that plays them once, without the
// dots travelling.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const HOP = 1100; // ms an exit signal takes along a link
const HOP_REDUCED = 300;
const STAGGER = 700; // ms between the scenes' starts, so they don't all fire at once
const HOLD = 3000; // ms the end of a scene stays up before it starts again

const REASONS = {
  crash: "RuntimeError",
  normal: ":normal",
};

// Each scene's processes, left to right, and what happens to them
const SCENES = [
  {
    title: "Child crashes",
    procs: ["parent", "child"],
    links: [["parent", "child"]],
    summary: "A parent and a child, linked. The child crashes, its exit signal reaches the parent, and the parent dies too, with the same reason.",
    async play(s) {
      await s.wait(1600);
      s.die("child", "crash");
      await s.wait(600);
      await s.signal("child", "parent", "crash");
      s.die("parent", "crash");
      s.say("The child's crash kills its parent.");
    },
  },
  {
    title: "Parent crashes",
    procs: ["parent", "child"],
    links: [["parent", "child"]],
    summary: "A parent and a child, linked. The parent crashes, its exit signal reaches the child, and the child dies too. A link works both ways.",
    async play(s) {
      await s.wait(1600);
      s.die("parent", "crash");
      await s.wait(600);
      await s.signal("parent", "child", "crash");
      s.die("child", "crash");
      s.say("Links work both ways: the child dies too.");
    },
  },
  {
    title: "Child finishes normally",
    procs: ["parent", "child"],
    links: [["parent", "child"]],
    summary: "A parent and a child, linked. The child runs out of code and exits with the reason :normal. The parent gets the exit signal, drops it, and carries on.",
    async play(s) {
      await s.wait(1600);
      s.die("child", "normal");
      await s.wait(600);
      await s.signal("child", "parent", "normal");
      s.flash("parent");
      s.say("A <code>:normal</code> exit kills nothing. The parent carries on.");
    },
  },
  {
    title: "A chain",
    procs: ["a", "b", "c"],
    links: [["a", "b"], ["b", "c"]],
    summary: "a is linked to b, and b to c. c crashes. Its exit signal kills b, b's kills a, and all three die, though a was never linked to c.",
    async play(s) {
      await s.wait(1600);
      s.die("c", "crash");
      await s.wait(600);
      await s.signal("c", "b", "crash");
      s.die("b", "crash");
      await s.wait(500);
      await s.signal("b", "a", "crash");
      s.die("a", "crash");
      s.say("The crash travels the chain, to <code>a</code> as well.");
    },
  },
];

document.head.insertAdjacentHTML("beforeend", `<style>
  link-scenes:defined {
    display: grid;
    gap: 1rem;
    margin: 1.75rem 0;
    container: link-scenes / inline-size;
  }
  link-scenes .scenes {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: .75rem;
  }
  @container link-scenes (min-width: 36rem) {
    link-scenes .scenes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  link-scenes .scene {
    margin: 0;
    padding: .8rem clamp(.6rem, 3cqi, .9rem) .7rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: link-scene / inline-size;
  }
  link-scenes .title {
    margin: 0;
    font-family: var(--type);
    font-weight: 700;
    font-size: .95rem;
  }
  link-scenes .stage {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--procs), minmax(0, 1fr));
    column-gap: clamp(2rem, 18cqi, 4.5rem);
    margin: .9rem 0 0;
  }
  /* Three boxes in a card a third of a phone wide: "RuntimeError" has to fit */
  link-scenes .stage.three {
    column-gap: clamp(1rem, 8cqi, 3rem);
  }
  link-scenes .stage.three .proc {
    padding-inline: .35rem;
  }
  link-scenes .stage.three .status {
    font-size: clamp(.5rem, 2.75cqi, .76rem);
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
    padding: .4rem .45rem;
    color: var(--ink);
    background: var(--bg);
    border: 2px solid var(--ink);
    border-radius: var(--radius);
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
    font-size: .9rem;
    line-height: 1.25;
  }
  link-scenes .proc .status {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-height: 1.35em;
    font-family: var(--code);
    font-size: clamp(.55rem, 3.6cqi, .76rem);
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
  link-scenes .say {
    min-height: 2.9em;
    margin: 1.7rem 0 0;
    font-size: .92rem;
    line-height: 1.45;
    transition: opacity .3s;
  }
  link-scenes .say:empty {
    opacity: 0;
  }
  link-scenes .key {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: .3rem 1.1rem;
    margin: 0;
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
  link-scenes .replay {
    justify-self: center;
    min-height: 44px;
    padding: .35rem .9rem;
    font: inherit;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--ink);
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  link-scenes .replay:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  link-scenes .replay:disabled {
    cursor: default;
    opacity: .45;
  }
  link-scenes [hidden] {
    display: none !important;
  }
  link-scenes code {
    font-size: .92em;
  }
  @media (prefers-reduced-motion: reduce) {
    link-scenes .proc.hit,
    link-scenes .say {
      transition: none;
      animation: none;
    }
  }
</style>`);

class Cancelled extends Error {}

// One scene: its boxes and links, and a run of its play() that a new run,
// or the widget leaving the screen, cancels
class Scene {
  constructor(el, scene) {
    this.el = el;
    this.scene = scene;
    this.stage = el.querySelector(".stage");
    this.lines = el.querySelector(".lines");
    this.dots = el.querySelector(".dots");
    this.sayEl = el.querySelector(".say");
    this.timers = new Map(); // timeout -> its promise's reject
    this.procs = {};
    for (const name of scene.procs) {
      const box = document.createElement("div");
      box.className = "proc";
      box.innerHTML = `<span class="name">${name}</span><span class="status"></span><span class="status"></span>`;
      this.stage.insertBefore(box, this.dots);
      this.procs[name] = { el: box };
    }
    this.stage.classList.toggle("three", scene.procs.length === 3);
  }

  cancel() {
    for (const [t, reject] of this.timers) {
      clearTimeout(t);
      reject(new Cancelled());
    }
    this.timers.clear();
    for (const a of this.dots.getAnimations({ subtree: true })) a.cancel();
    this.dots.replaceChildren();
  }

  reset() {
    this.cancel();
    for (const p of Object.values(this.procs)) Object.assign(p, { alive: true, reason: null });
    this.links = new Set(this.scene.links.map((pair) => pair.join("-")));
    this.sayEl.innerHTML = "";
    this.render();
  }

  // Plays the scene once; with instant, jumps to its end
  async play({ instant = false } = {}) {
    this.instant = instant;
    this.reset();
    await this.scene.play(this);
  }

  // Plays it over and over, after a delay, until cancelled
  async loop(delay) {
    try {
      await this.wait(delay);
      for (;;) {
        await this.play();
        await this.wait(HOLD);
      }
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
    }
  }

  wait(ms) {
    if (this.instant) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.timers.delete(t);
        resolve();
      }, ms);
      this.timers.set(t, reject);
    });
  }

  die(name, reason) {
    Object.assign(this.procs[name], { alive: false, reason });
    this.flash(name);
    this.render();
  }

  say(html) {
    this.sayEl.innerHTML = html;
  }

  flash(name) {
    if (this.instant) return;
    const el = this.procs[name].el;
    el.classList.remove("hit");
    void el.offsetWidth;
    el.classList.add("hit");
  }

  render() {
    for (const p of Object.values(this.procs)) {
      const [one, two] = p.alive ? ["running", ""] : ["exited:", REASONS[p.reason]];
      p.el.classList.toggle("dead", !p.alive);
      p.el.classList.toggle("crashed", !p.alive && p.reason === "crash");
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
    if (!this.instant) {
      const hop = reducedMotion.matches ? HOP_REDUCED : HOP;
      if (!reducedMotion.matches) {
        const [p, q] = this.ends(from, to);
        const dot = document.createElement("div");
        dot.className = `dot ${reason}`;
        dot.innerHTML = `<span>${REASONS[reason]}</span>`;
        dot.style.setProperty("--below", `${this.box(from).hh + 4}px`);
        this.dots.append(dot);
        const anim = dot.animate(
          [{ transform: `translate(${p.x}px, ${p.y}px)` }, { transform: `translate(${q.x}px, ${q.y}px)` }],
          { duration: hop, easing: "ease-in-out", fill: "forwards" },
        );
        anim.finished.then(() => dot.remove(), () => dot.remove());
      }
      await this.wait(hop);
    }
    this.links.delete(`${from}-${to}`);
    this.links.delete(`${to}-${from}`);
    this.flash(to);
    this.draw();
  }
}

customElements.define("link-scenes", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;

    this.innerHTML = `
      <div class="scenes">
        ${SCENES.map((scene) => `
          <figure class="scene" role="img" aria-label="${scene.title}. ${scene.summary}">
            <p class="title" aria-hidden="true">${scene.title}</p>
            <div class="stage" aria-hidden="true" style="--procs: ${scene.procs.length}">
              <svg class="lines"></svg>
              <div class="dots"></div>
            </div>
            <p class="say" aria-hidden="true"></p>
          </figure>`).join("")}
      </div>
      <p class="key" aria-hidden="true">
        <span><i class="link-line"></i>link</span>
        <span><i class="crash-dot"></i>exit signal: a crash</span>
        <span><i class="normal-dot"></i>exit signal: <code>:normal</code></span>
      </p>
      <button type="button" class="replay" hidden>Play the four scenes</button>`;

    const figures = [...this.querySelectorAll(".scene")];
    this.scenes = SCENES.map((scene, i) => new Scene(figures[i], scene));

    this.replay = this.querySelector(".replay");
    this.replay.addEventListener("click", () => this.playOnce());

    this.resizer = new ResizeObserver(() => this.scenes.forEach((s) => s.draw()));
    this.resizer.observe(this);

    this.visible = false;
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.start();
    }, { threshold: 0.2 });
    this.observer.observe(this);

    this.onMotion = () => this.start();
    reducedMotion.addEventListener("change", this.onMotion);

    this.start();
  }

  disconnectedCallback() {
    this.resizer?.disconnect();
    this.observer?.disconnect();
    reducedMotion.removeEventListener("change", this.onMotion);
    this.scenes?.forEach((s) => s.cancel());
  }

  // Each scene as it ends
  showEnds() {
    for (const s of this.scenes) s.play({ instant: true });
  }

  // Loops while on screen. Off screen, and under reduced motion, each scene
  // shows its end; reduced motion also gets a button to play them once.
  start() {
    this.replay.hidden = !reducedMotion.matches;
    for (const s of this.scenes) s.cancel();
    if (reducedMotion.matches || !this.visible) {
      this.replay.disabled = false;
      this.showEnds();
      return;
    }
    this.scenes.forEach((s, i) => {
      s.reset();
      s.loop(i * STAGGER);
    });
  }

  // Under reduced motion: each scene once, side by side, then their ends stay
  async playOnce() {
    this.replay.disabled = true;
    try {
      await Promise.all(this.scenes.map((s) => s.play()));
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
    }
    this.replay.disabled = false;
  }
});
