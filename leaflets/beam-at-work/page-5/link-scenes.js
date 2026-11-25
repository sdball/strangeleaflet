// <link-scenes>: small looping animations of what links and trapping exits
// do. Two sets, picked with the scenes attribute:
//
// - scenes="links" (the default), one per scene of link.exs: the child
//   crashes, the parent crashes, the child finishes normally, and a chain of
//   three where the end one crashes.
// - scenes="trap", one per scene of trap.exs: a parent that traps exits
//   whose two children crash and finish, a chain whose middle process traps
//   exits, and :kill sent to a process that traps exits.
// - scenes="monitors", one per scene of monitor.exs: a watcher monitoring a
//   process that crashes, finishes normally, is already gone, or is
//   monitored twice; the watcher crashing instead; and Process.exit with
//   :shutdown. A monitor is a dashed arrow from the watcher; when the watched
//   process exits, a :DOWN message travels back along it, and the monitor is
//   gone. Nothing dies of a :DOWN, and nothing travels the other way.
// - scenes="restart", two runs of restart.exs's restarter, which traps exits
//   and starts a new worker whenever its worker exits with any reason but
//   :normal, up to three times. In one the worker crashes once and the new
//   one finishes; in the other it keeps crashing and the restarter gives up
//   with :too_many_restarts. Each worker gets a box of its own, in a column
//   beside the restarter, showing its pid and its count; a crashed worker's
//   box stays, and each restart adds a new process below it, starting from
//   1. restart.exs's worker fails at random; these runs are fixed so each
//   makes its point.
//
// The processes are boxes with their links drawn between them; a process
// that traps exits has a brass border. When a process exits, a dot carries
// its exit signal along each of its links, labelled with the reason, and the
// process at the other end does what the BEAM does with it: dies of it with
// the same reason, drops it if the reason is :normal, or, if it traps exits,
// gets it as an {:EXIT, pid, reason} message, shown in the mailbox line
// (with the sender's name standing in for its pid). :kill can't be trapped
// and becomes :killed. A line under each scene sums up what happened.
//
// The rules are the Erlang reference manual's (Links, Sending and Receiving
// Exit Signals, Monitors), as on the page, and each scene ends as its script's does.
// It's slowed down so it can be followed; in the BEAM a signal takes
// microseconds.
//
// It holds a static fallback (the script and its output: what feed readers
// and no-JS visitors see) and replaces it once this module runs. The scenes
// loop while the widget is on screen. A reader who prefers reduced motion
// sees each scene's end instead, with a button that plays them once, without
// the dots travelling.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const HOP = 1100; // ms an exit signal takes along a link
const HOP_REDUCED = 300;
const STAGGER = 700; // ms between the scenes' starts, so they don't all fire at once
const HOLD = 3000; // ms the end of a scene stays up before it starts again

// Each reason as it's labelled on a dot and in a box, and whether its dot is
// the hollow :normal one
const REASONS = {
  crash: "RuntimeError",
  normal: ":normal",
  kill: ":kill",
  killed: ":killed",
  noproc: ":noproc",
  done: ":done",
  shutdown: ":shutdown",
  too_many_restarts: ":too_many_restarts",
};

// The reasons a box outlines in red
const VIOLENT = new Set(["crash", "killed"]);

const exitMessage = (from, reason) => `{:EXIT, ${from}, ${REASONS[reason]}}`;
const downMessage = (ref, from, reason) => `{:DOWN, ${ref}, :process, ${from}, ${REASONS[reason]}}`;

const COUNT_EVERY = 450; // ms between a worker's counts
const RESTART_AFTER = 500; // ms from the restarter's {:EXIT} to the new worker
const TRIES = 3; // restarts before the restarter gives up, as in restart.exs

// A run of restart.exs's restarter. Each number is how far a worker counts
// before it crashes; a worker without one counts to 5 and finishes. Worker
// n is box wn. onRestart runs as each new worker starts.
async function restarts(s, crashes, onRestart = () => {}) {
  let tries = TRIES;
  for (let life = 0; ; life++) {
    const worker = `w${life + 1}`;
    const crashAt = crashes[life];
    for (let n = 1; n <= (crashAt ?? 5); n++) {
      await s.wait(COUNT_EVERY);
      if (n === crashAt) break;
      s.count(worker, n);
    }
    if (crashAt === undefined) {
      s.die(worker, "normal");
      await s.signal(worker, "restarter", "normal");
      s.note("restarter", "worker finished");
      await s.wait(700);
      s.die("restarter", "normal");
      return;
    }
    s.die(worker, "crash");
    await s.signal(worker, "restarter", "crash");
    if (tries === 0) {
      await s.wait(RESTART_AFTER);
      s.die("restarter", "too_many_restarts");
      return;
    }
    tries -= 1;
    s.note("restarter", `restarts ${TRIES - tries}/${TRIES}`);
    await s.wait(RESTART_AFTER);
    const next = `w${life + 2}`;
    s.spawn(next);
    s.link("restarter", next);
    onRestart();
  }
}

// The restarter, top left, beside a column of n worker boxes; only the first
// is running at the start
const restartLayout = (n) => {
  const workers = Array.from({ length: n }, (_, i) => `w${i + 1}`);
  return {
    procs: ["restarter", ...workers],
    columns: "minmax(0, 1.25fr) minmax(0, 1fr)",
    place: Object.fromEntries([["restarter", "1 / 1"], ...workers.map((w, i) => [w, `${i + 1} / 2`])]),
    labels: Object.fromEntries(workers.map((w) => [w, "worker"])),
    pids: Object.fromEntries(workers.map((w, i) => [w, 110 + i])),
    unborn: workers.slice(1),
    links: [["restarter", "w1"]],
    trap: ["restarter"],
    notes: { restarter: `restarts 0/${TRIES}` },
    dotLabels: false,
    elbows: true,
  };
};

// Each scene's processes, left to right, its links, who traps exits, whose
// mailbox is shown, and what happens
const SETS = {
  links: {
    key: ["link", "crash", "normal"],
    scenes: [
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
    ],
  },
  trap: {
    key: ["link", "trap", "crash", "normal"],
    scenes: [
      {
        title: "Parent traps exits",
        procs: ["crashes", "parent", "finishes"],
        links: [["crashes", "parent"], ["parent", "finishes"]],
        trap: ["parent"],
        mailbox: "parent",
        summary: "A parent that traps exits, linked to two children. One crashes and the other finishes normally. Both exit signals arrive at the parent as {:EXIT} messages in its mailbox, and the parent lives.",
        async play(s) {
          await s.wait(1600);
          s.die("crashes", "crash");
          s.die("finishes", "normal");
          await s.wait(600);
          await Promise.all([
            s.signal("crashes", "parent", "crash").then(() => s.message("parent", exitMessage("crashes", "crash"))),
            s.signal("finishes", "parent", "normal").then(() => s.message("parent", exitMessage("finishes", "normal"))),
          ]);
          s.say("The parent lives. Both exits arrive as messages, the <code>:normal</code> one too.");
        },
      },
      {
        title: "A chain with a trap",
        procs: ["a", "b", "c"],
        links: [["a", "b"], ["b", "c"]],
        trap: ["b"],
        mailbox: "b",
        summary: "a is linked to b, and b to c, and b traps exits. c crashes. Its exit signal arrives at b as a message, b lives, and a never hears a thing.",
        async play(s) {
          await s.wait(1600);
          s.die("c", "crash");
          await s.wait(600);
          await s.signal("c", "b", "crash");
          s.message("b", exitMessage("c", "crash"));
          s.say("<code>b</code> gets a message and lives, so the crash stops there.");
        },
      },
      {
        title: "Kill ignores the trap",
        procs: ["parent", "child"],
        links: [["parent", "child"]],
        trap: ["parent", "child"],
        mailbox: "parent",
        summary: "A parent and a child, linked, and both trap exits. The parent sends the child :kill, which can't be trapped. The child dies with the reason :killed, and the parent gets that as a message.",
        async play(s) {
          await s.wait(1600);
          await s.signal("parent", "child", "kill", { keepLink: true });
          s.die("child", "killed");
          await s.wait(600);
          await s.signal("child", "parent", "killed");
          s.message("parent", exitMessage("child", "killed"));
          s.say("<code>:kill</code> can't be trapped. The child dies with <code>:killed</code>.");
        },
      },
    ],
  },
  monitors: {
    key: ["monitor", "down", "crash"],
    scenes: [
      {
        title: "Watched crashes",
        procs: ["watcher", "watched"],
        monitors: [["watcher", "watched"]],
        mailbox: "watcher",
        summary: "A watcher monitors another process. The watched process crashes, and a :DOWN message with the error comes back to the watcher, which carries on.",
        async play(s) {
          await s.wait(1600);
          s.die("watched", "crash");
          await s.wait(600);
          await s.down("watched", "watcher", "crash");
          s.say("The watcher gets a <code>:DOWN</code> message and carries on.");
        },
      },
      {
        title: "Watched finishes normally",
        procs: ["watcher", "watched"],
        monitors: [["watcher", "watched"]],
        mailbox: "watcher",
        summary: "A watcher monitors another process, which finishes normally. A :DOWN message with the reason :normal comes back to the watcher.",
        async play(s) {
          await s.wait(1600);
          s.die("watched", "normal");
          await s.wait(600);
          await s.down("watched", "watcher", "normal");
          s.say("Unlike a link, a monitor reports a <code>:normal</code> exit too.");
        },
      },
      {
        title: "Already gone",
        procs: ["watcher", "watched"],
        dead: { watched: "crash" },
        mailbox: "watcher",
        summary: "The watcher starts monitoring a process that has already exited. A :DOWN message with the reason :noproc comes back at once.",
        async play(s) {
          await s.wait(1600);
          s.monitor("watcher", "watched");
          await s.wait(300);
          await s.down("watched", "watcher", "noproc");
          s.say("Monitoring a process that's gone gets <code>:noproc</code> at once.");
        },
      },
      {
        title: "Monitored twice",
        procs: ["watcher", "watched"],
        monitors: [["watcher", "watched", "ref1"], ["watcher", "watched", "ref2"]],
        mailbox: "watcher",
        summary: "The watcher monitors the same process twice. The watched process calls exit(:done), and two :DOWN messages come back, each with its own reference.",
        async play(s) {
          await s.wait(1600);
          s.die("watched", "done");
          await s.wait(600);
          await Promise.all([s.down("watched", "watcher", "done", 0), s.down("watched", "watcher", "done", 1)]);
          s.say("<code>exit(:done)</code> comes back twice, once per monitor, each with its own ref.");
        },
      },
      {
        title: "Watcher crashes",
        procs: ["watcher", "watched"],
        monitors: [["watcher", "watched"]],
        summary: "The watcher, monitoring another process, crashes. Its monitor goes with it, and the watched process carries on, never told.",
        async play(s) {
          await s.wait(1600);
          s.die("watcher", "crash");
          await s.wait(900);
          s.flash("watched");
          s.say("Nothing reaches the watched process. A monitor goes one way.");
        },
      },
      {
        title: "Shut down by hand",
        procs: ["watcher", "watched"],
        monitors: [["watcher", "watched"]],
        mailbox: "watcher",
        summary: "The watcher started the watched process with spawn_monitor, then sends it Process.exit with the reason :shutdown. The watched process exits, and the :DOWN message says :shutdown.",
        async play(s) {
          await s.wait(1600);
          await s.signal("watcher", "watched", "shutdown", { keepLink: true });
          s.die("watched", "shutdown");
          await s.wait(600);
          await s.down("watched", "watcher", "shutdown");
          s.say("Whatever the reason, the <code>:DOWN</code> carries it.");
        },
      },
    ],
  },
  restart: {
    key: ["link", "trap", "crash", "normal"],
    scenes: [
      {
        title: "A restart",
        ...restartLayout(2),
        summary: "A restarter that traps exits, linked to a worker that counts. The worker crashes at 3. The restarter gets the exit as a message and starts a new worker, with a new pid, which counts from 1 to 5 and finishes. Then the restarter finishes too.",
        async play(s) {
          const fresh = "The new worker is a new process: a new pid, counting from 1.";
          await restarts(s, [3], () => s.say(fresh));
          s.say(`${fresh} It finishes, and then so does the restarter.`);
        },
      },
      {
        title: "Giving up",
        ...restartLayout(4),
        summary: "The same restarter and worker, but every worker crashes. The restarter starts a new one three times, and when the fourth crashes it gives up and exits with :too_many_restarts.",
        async play(s) {
          await restarts(s, [2, 4, 1, 3]);
          s.say("After three restarts, the restarter gives up and exits.");
        },
      },
    ],
  },
};

const KEY = {
  link: `<span><i class="link-line"></i>link</span>`,
  trap: `<span><i class="trap-box"></i>traps exits</span>`,
  crash: `<span><i class="crash-dot"></i>exit signal</span>`,
  normal: `<span><i class="normal-dot"></i>exit signal: <code>:normal</code></span>`,
  monitor: `<span><i class="monitor-line"></i>monitor</span>`,
  down: `<span><i class="down-dot"></i><code>:DOWN</code> message</span>`,
};

let ids = 0;

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
    row-gap: .7rem;
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
  link-scenes .stage.three .name {
    font-size: clamp(.72rem, 3.4cqi, .9rem);
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
  link-scenes .lines line,
  link-scenes .lines polyline {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
  }
  link-scenes .lines line.monitor {
    stroke: var(--muted);
    stroke-dasharray: 5 4;
  }
  link-scenes .lines marker path {
    fill: var(--muted);
  }
  link-scenes .proc {
    position: relative;
    z-index: 1;
    align-self: start;
    display: grid;
    gap: .1rem;
    min-width: 0;
    padding: .4rem .45rem;
    color: var(--ink);
    background: var(--bg);
    border: 2px solid var(--ink);
    border-radius: var(--radius);
  }
  link-scenes .proc.trapping {
    border-color: var(--brass);
    box-shadow: inset 0 0 0 2px var(--brass);
  }
  link-scenes .proc.trapping .status { color: var(--brass); }
  /* A box for a process that hasn't been started yet keeps its place */
  link-scenes .proc.unborn {
    visibility: hidden;
  }
  link-scenes .proc.dead {
    color: var(--muted);
    border-style: dashed;
    border-color: var(--line);
    box-shadow: none;
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
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
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
  link-scenes .proc.dead .status { color: var(--muted); }
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
  link-scenes .dot.down {
    background: var(--code-string);
    border: 0;
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
  link-scenes .mailbox {
    min-height: 2.9em;
    margin: 1.7rem 0 0;
    font-size: .85rem;
    line-height: 1.45;
    color: var(--muted);
  }
  link-scenes .mailbox code {
    display: inline-block;
    max-width: 100%;
    margin: .15rem .3rem 0 0;
    overflow-wrap: anywhere;
  }
  link-scenes .mailbox code.new {
    animation: link-scenes-new 1s;
  }
  @keyframes link-scenes-new {
    from { background: var(--code-mark); }
  }
  link-scenes .say {
    min-height: 2.9em;
    margin: 1.7rem 0 0;
    font-size: .92rem;
    line-height: 1.45;
    transition: opacity .3s;
  }
  link-scenes .mailbox + .say {
    margin-top: .5rem;
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
  link-scenes .key .monitor-line { width: 1.6rem; border-top: 2px dashed var(--muted); }
  link-scenes .key .down-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--code-string); }
  link-scenes .key .trap-box { width: 1rem; height: .8rem; border: 2px solid var(--brass); border-radius: 3px; box-shadow: inset 0 0 0 1px var(--brass); }
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
    link-scenes .mailbox code.new,
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
    this.mailboxEl = el.querySelector(".mailbox");
    this.timers = new Map(); // timeout -> its promise's reject
    this.uid = `link-scenes-${++ids}`;
    this.procs = {};
    for (const name of scene.procs) {
      const box = document.createElement("div");
      box.className = "proc";
      const lines = scene.pids?.[name] ? 3 : 2;
      box.innerHTML = `<span class="name">${scene.labels?.[name] ?? name}</span>${'<span class="status"></span>'.repeat(lines)}`;
      if (scene.place?.[name]) box.style.gridArea = scene.place[name];
      this.stage.insertBefore(box, this.dots);
      this.procs[name] = { el: box };
    }
    this.stage.classList.toggle("three", scene.procs.length === 3 && !scene.place);
    this.reset();
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
    for (const [name, p] of Object.entries(this.procs)) {
      const reason = this.scene.dead?.[name] ?? null;
      const pid = this.scene.pids?.[name] ?? null;
      Object.assign(p, {
        born: !this.scene.unborn?.includes(name),
        alive: !reason,
        reason,
        trap: !!this.scene.trap?.includes(name),
        pid,
        count: pid ? 0 : null,
        note: this.scene.notes?.[name] ?? "",
      });
    }
    this.links = new Set((this.scene.links ?? []).map((pair) => pair.join("-")));
    // Each monitor: who watches whom, and its reference as the message shows it
    this.monitors = (this.scene.monitors ?? []).map(([from, to, ref = "ref"]) => ({ from, to, ref }));
    this.messages = [];
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

  // A process exits. Monitors it held go with it; monitors on it stay
  // until their :DOWN messages are sent.
  die(name, reason) {
    Object.assign(this.procs[name], { alive: false, reason });
    this.monitors = this.monitors.filter((m) => m.from !== name);
    this.flash(name);
    this.render();
  }

  // A process in a box that's been waiting for it
  spawn(name) {
    Object.assign(this.procs[name], { born: true, alive: true, reason: null, count: 0 });
    this.flash(name);
    this.render();
  }

  link(a, b) {
    this.links.add(`${a}-${b}`);
    this.draw();
  }

  count(name, n) {
    this.procs[name].count = n;
    this.render();
  }

  note(name, text) {
    this.procs[name].note = text;
    this.render();
  }

  monitor(from, to) {
    this.monitors.push({ from, to, ref: "ref" });
    this.draw();
  }

  // The nth monitor that watcher holds on watched sends its :DOWN back along
  // it, and is gone
  async down(watched, watcher, reason, n = 0) {
    const m = this.monitors.filter((x) => x.from === watcher && x.to === watched)[n];
    const offset = this.offset(m);
    await this.travel(watched, watcher, "down", reason, offset);
    this.monitors = this.monitors.filter((x) => x !== m);
    this.message(watcher, downMessage(m.ref, watched, reason));
  }

  // How far a monitor's line sits from the middle, when there's more than one
  offset(m) {
    const pair = this.monitors.filter((x) => x.from === m.from && x.to === m.to);
    return (pair.indexOf(m) - (pair.length - 1) / 2) * 12;
  }

  // A trapped exit signal, now a message in the process's mailbox
  message(name, text) {
    this.messages.push(text);
    this.flash(name);
    this.render();
    if (!this.instant) this.mailboxEl?.querySelector("code:last-child")?.classList.add("new");
  }

  say(html) {
    this.sayEl.innerHTML = html;
  }

  // A dot, of a kind, labelled with a reason, from one box to the other
  async travel(from, to, kind, reason, dy = 0) {
    if (this.instant) return;
    const hop = reducedMotion.matches ? HOP_REDUCED : HOP;
    if (!reducedMotion.matches) {
      const points = this.route(from, to);
      const dot = document.createElement("div");
      dot.className = `dot ${kind}`;
      if (this.scene.dotLabels !== false) dot.innerHTML = `<span>${REASONS[reason]}</span>`;
      dot.style.setProperty("--below", `${this.box(from).hh + 4 - dy}px`);
      this.dots.append(dot);
      // A keyframe at each corner, spaced by distance so the dot keeps one speed
      const lengths = points.slice(1).map((q, i) => Math.hypot(q.x - points[i].x, q.y - points[i].y));
      const total = lengths.reduce((sum, n) => sum + n, 0) || 1;
      let along = 0;
      const frames = points.map((q, i) => {
        if (i) along += lengths[i - 1];
        return { transform: `translate(${q.x}px, ${q.y + dy}px)`, offset: along / total };
      });
      const anim = dot.animate(frames, { duration: hop, easing: "ease-in-out", fill: "forwards" });
      anim.finished.then(() => dot.remove(), () => dot.remove());
    }
    await this.wait(hop);
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
      // A process with a pid keeps it, and its count, after it exits
      const lines = p.pid
        ? [`#PID<0.${p.pid}.0>`, `count ${p.count}`, p.alive ? "running" : REASONS[p.reason]]
        : p.alive
          ? [p.trap ? "traps exits" : "running", p.note]
          : ["exited:", REASONS[p.reason]];
      p.el.classList.toggle("unborn", !p.born);
      p.el.classList.toggle("dead", !p.alive);
      p.el.classList.toggle("trapping", p.alive && p.trap);
      p.el.classList.toggle("crashed", !p.alive && VIOLENT.has(p.reason));
      p.el.querySelectorAll(".status").forEach((el, i) => (el.textContent = lines[i]));
    }
    if (this.mailboxEl) {
      const owner = this.scene.mailbox;
      this.mailboxEl.innerHTML = `${owner}'s mailbox: ${
        this.messages.length ? this.messages.map((m) => `<code>${m}</code>`).join("") : "empty"
      }`;
    }
    this.draw();
  }

  // Where a process's box is, in the stage's coordinates
  box(name) {
    const g = this.stage.getBoundingClientRect();
    const r = this.procs[name].el.getBoundingClientRect();
    return { x: r.left - g.left + r.width / 2, y: r.top - g.top + r.height / 2, hw: r.width / 2, hh: r.height / 2 };
  }

  // The point where the line from a's centre towards b's leaves a's box,
  // gap further on
  edge(a, b, gap = 0) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.min(dx ? (a.hw + gap) / Math.abs(dx) : Infinity, dy ? (a.hh + gap) / Math.abs(dy) : Infinity);
    return { x: a.x + dx * t, y: a.y + dy * t };
  }

  // The ends of the line between two boxes, with a gap before the second
  // for an arrowhead
  ends(from, to, gap = 0) {
    const a = this.box(from);
    const b = this.box(to);
    return [this.edge(a, b), this.edge(b, a, gap)];
  }

  // The points a link's line goes through, from one box to the other. In a
  // scene with elbows, a link between boxes in different rows goes down the
  // left box's column, then across to the right one, clear of the boxes in
  // between.
  route(from, to) {
    const a = this.box(from);
    const b = this.box(to);
    if (!this.scene.elbows || Math.abs(a.y - b.y) < a.hh) return [this.edge(a, b), this.edge(b, a)];
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    const points = [{ x: l.x, y: l.y + l.hh }, { x: l.x, y: r.y }, { x: r.x - r.hw, y: r.y }];
    return a === l ? points : points.reverse();
  }

  draw() {
    const links = [...this.links].map((key) => {
      const points = this.route(...key.split("-")).map((p) => `${p.x},${p.y}`).join(" ");
      return `<polyline points="${points}"/>`;
    });
    const monitors = this.monitors.map((m) => {
      const dy = this.offset(m);
      const [p, q] = this.ends(m.from, m.to, 3);
      return `<line class="monitor" x1="${p.x}" y1="${p.y + dy}" x2="${q.x}" y2="${q.y + dy}" marker-end="url(#${this.uid}-arrow)"/>`;
    });
    this.lines.innerHTML = `<defs><marker id="${this.uid}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>${links.join("")}${monitors.join("")}`;
  }

  // An exit signal travelling from one process to the other. One that a
  // process sends because it exited goes along their link, which is gone once
  // it arrives; one sent by hand (keepLink) leaves the link alone.
  async signal(from, to, reason, { keepLink = false } = {}) {
    await this.travel(from, to, reason, reason);
    if (!keepLink) {
      this.links.delete(`${from}-${to}`);
      this.links.delete(`${to}-${from}`);
    }
    this.flash(to);
    this.draw();
  }
}

customElements.define("link-scenes", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const set = SETS[this.getAttribute("scenes")] ?? SETS.links;

    this.innerHTML = `
      <div class="scenes">
        ${set.scenes.map((scene) => `
          <figure class="scene" role="img" aria-label="${scene.title}. ${scene.summary}">
            <p class="title" aria-hidden="true">${scene.title}</p>
            <div class="stage" aria-hidden="true" style="--procs: ${scene.procs.length}${scene.columns ? `; grid-template-columns: ${scene.columns}` : ""}">
              <svg class="lines"></svg>
              <div class="dots"></div>
            </div>
            ${scene.mailbox ? `<p class="mailbox" aria-hidden="true"></p>` : ""}
            <p class="say" aria-hidden="true"></p>
          </figure>`).join("")}
      </div>
      <p class="key" aria-hidden="true">${set.key.map((k) => KEY[k]).join("")}</p>
      <button type="button" class="replay" hidden>Play the ${["", "", "two", "three", "four", "five", "six"][set.scenes.length]} scenes</button>`;

    const figures = [...this.querySelectorAll(".scene")];
    this.scenes = set.scenes.map((scene, i) => new Scene(figures[i], scene));

    this.replay = this.querySelector(".replay");
    this.replay.addEventListener("click", () => this.playOnce());

    // A new width can rewrap the mailbox and summary lines, so their heights
    // are measured again; other size changes only move the lines and dots
    this.resizer = new ResizeObserver(() => {
      this.scenes.forEach((s) => s.draw());
      if (this.offsetWidth !== this.measuredWidth) this.remeasure();
    });
    this.resizer.observe(this);

    this.visible = false;
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.start();
    }, { threshold: 0.2 });
    this.observer.observe(this);

    this.onMotion = () => this.start();
    reducedMotion.addEventListener("change", this.onMotion);

    document.fonts?.ready.then(() => this.remeasure());
  }

  disconnectedCallback() {
    this.resizer?.disconnect();
    this.observer?.disconnect();
    reducedMotion.removeEventListener("change", this.onMotion);
    this.scenes?.forEach((s) => s.cancel());
  }

  // A card is at its tallest at the end of its scene, with every message in
  // its mailbox and its summary showing. Those heights are kept for the
  // mailbox and summary lines, so no card grows or shrinks as a scene plays.
  async measure() {
    this.measuredWidth = this.offsetWidth;
    for (const s of this.scenes) {
      s.cancel();
      for (const el of [s.mailboxEl, s.sayEl]) if (el) el.style.minHeight = "";
    }
    await Promise.all(this.scenes.map((s) => s.play({ instant: true })));
    for (const s of this.scenes) {
      for (const el of [s.mailboxEl, s.sayEl]) if (el) el.style.minHeight = `${el.offsetHeight}px`;
    }
  }

  async remeasure() {
    const run = (this.measuring = (this.measuring ?? 0) + 1);
    await this.measure();
    if (run === this.measuring) this.start();
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
