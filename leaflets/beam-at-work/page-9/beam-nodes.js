// <beam-nodes>: down.exs as a simulation. Node a watches a counter on
// node b with a monitor, and the reader can send to the counter, close the
// connection, pause b, or halt it, and see what a's mailbox gets.
//
// The model, in simulated milliseconds, following the runs in down.exs
// and the Kernel docs:
// - Every message takes HOP ms to cross the connection.
// - Each node checks the connection every net tick time / 4. A node that
//   has sent nothing since the last check sends a tick. A node that has
//   heard nothing at 4 checks in a row takes the other to be down, and
//   closes the connection (so 1 to 1.25 net tick times after the last thing
//   it heard; the docs give 0.75 to 1.25).
// - A paused node does nothing at all: no ticks, no reading. Messages that
//   reach it wait unread, and are read when it carries on, even if the
//   other node has closed the connection in the meantime.
// - Closing the connection, or halting b, is seen by the running side at
//   once. Messages still crossing are lost.
// - Sending to b with no connection starts connecting. Connecting takes two
//   hops if b is running. If b is paused it waits, and gives up after
//   SETUP ms (net_setuptime), losing the messages that were waiting for it
//   (checked for real: a send to a paused b arrived if b carried on within
//   7 s and was lost if it carried on after 10). With b halted it fails at
//   once. A monitor that can't be set up fires :noconnection.

const HOP = 120;
const SETUP = 7000;
const CHECKS = 4;
const NODE_B = ":b@MacBookAir";
export const TICK_TIMES = [4000, 60000];

export class Cluster {
  constructor({ tickTime = 4000 } = {}) {
    this.tickTime = tickTime;
    this.t = 0;
    this.b = "running"; // running | paused | halted
    this.count = 0;
    this.unread = []; // reached b while it was paused
    this.wire = []; // crossing: { dir: "ab" | "ba", kind, sent, arrive, n }
    this.conn = "up"; // up | down | connecting
    this.pendingA = []; // a's messages waiting for a connection
    this.pendingB = []; // b's replies waiting for a connection
    this.handshakeAt = null;
    this.setupUntil = null;
    this.stale = false; // a gave up connecting while b was paused
    this.bUp = true; // a's view of b
    this.aUp = true; // b's view of a
    this.bLearns = false; // b, paused, hasn't seen the connection close yet
    this.monitor = true; // a's monitor on the counter
    this.lost = 0;
    this.log = [];
    this.nextCheck = this.interval;
    this.a = { missed: 0, got: false, sent: false, heard: 0 };
    this.bs = { missed: 0, got: false, sent: false, heard: 0 };
  }

  get interval() {
    return this.tickTime / CHECKS;
  }

  say(text, kind = "") {
    this.log.push({ t: this.t, text, kind });
    if (this.log.length > 50) this.log.shift();
  }

  down() {
    this.monitor = false;
    this.say("{:DOWN, ref, :process, counter, :noconnection}", "down");
  }

  put(dir, kind, n) {
    this.wire.push({ dir, kind, n, sent: this.t, arrive: this.t + HOP });
    (dir === "ab" ? this.a : this.bs).sent = true;
  }

  // a sends to the counter: "add", "get", or "monitor"
  sendA(kind) {
    if (kind === "monitor") this.monitor = true;
    if (this.conn === "up") return this.put("ab", kind);
    if (this.b === "halted") {
      if (kind === "monitor") this.down();
      else this.lost++;
      return;
    }
    this.pendingA.push(kind);
    if (this.conn === "down") this.connect();
  }

  replyB() {
    if (this.conn === "up") return this.put("ba", "reply", this.count);
    this.pendingB.push(this.count);
    if (this.conn === "down") this.connect();
  }

  connect() {
    this.conn = "connecting";
    this.setupUntil = this.t + SETUP;
    this.handshakeAt = this.b === "running" ? this.t + 2 * HOP : null;
  }

  connected() {
    this.conn = "up";
    this.handshakeAt = this.setupUntil = null;
    this.stale = false;
    this.bUp = this.aUp = true;
    this.bLearns = false;
    for (const side of [this.a, this.bs]) Object.assign(side, { missed: 0, got: false, sent: false, heard: this.t });
    this.say(`{:nodeup, ${NODE_B}}`, "up");
    for (const kind of this.pendingA.splice(0)) this.put("ab", kind);
    for (const n of this.pendingB.splice(0)) this.put("ba", "reply", n);
  }

  setupFailed() {
    this.conn = "down";
    this.handshakeAt = this.setupUntil = null;
    this.stale = true;
    for (const kind of this.pendingA.splice(0)) {
      if (kind === "monitor") this.down();
      else this.lost++;
    }
  }

  close() {
    this.conn = "down";
    for (const m of this.wire) if (m.kind !== "tick") this.lost++;
    this.wire = [];
    this.bUp = false;
    this.say(`{:nodedown, ${NODE_B}}`, "nodedown");
    if (this.monitor) this.down();
    if (this.b === "running") this.aUp = false;
    else if (this.b === "paused") this.bLearns = true;
  }

  disconnect() {
    if (this.conn === "up") this.close();
  }

  pause() {
    if (this.b !== "running") return;
    this.b = "paused";
    this.handshakeAt = null;
  }

  resume() {
    if (this.b !== "paused") return;
    this.b = "running";
    Object.assign(this.bs, { missed: 0, got: false });
    if (this.bLearns) {
      this.aUp = false;
      this.bLearns = false;
    }
    for (const m of this.unread.splice(0)) this.receiveB(m);
    if (this.conn === "down" && this.stale) this.connect();
    if (this.conn === "connecting") this.handshakeAt = this.t + 2 * HOP;
  }

  halt() {
    if (this.b === "halted") return;
    this.b = "halted";
    this.count = null;
    this.unread = [];
    if (this.conn === "up") this.close();
    else if (this.conn === "connecting") this.setupFailed();
    this.stale = false;
    this.pendingB = [];
  }

  receiveB(m) {
    this.bs.got = true;
    this.bs.heard = this.t;
    if (m.kind === "add") this.count++;
    if (m.kind === "get") this.replyB();
  }

  arrive(m) {
    this.wire.splice(this.wire.indexOf(m), 1);
    if (m.dir === "ab") {
      if (this.b === "paused") this.unread.push(m);
      else this.receiveB(m);
    } else {
      this.a.got = true;
      this.a.heard = this.t;
      if (m.kind === "reply") this.say(`{:count, ${m.n}}`, "reply");
    }
  }

  check() {
    this.nextCheck += this.interval;
    if (this.conn !== "up") return;
    const sides = [[this.a, "ab", `[error] ** Node ${NODE_B} not responding **`]];
    if (this.b === "running") sides.push([this.bs, "ba", null]);
    for (const [side, dir, error] of sides) {
      side.missed = side.got ? 0 : side.missed + 1;
      side.got = false;
      if (side.missed >= CHECKS) {
        if (error) this.say(error, "error");
        this.close();
        return;
      }
      if (!side.sent) this.put(dir, "tick");
      side.sent = false;
    }
  }

  advance(to) {
    for (;;) {
      let next = this.nextCheck;
      let what = "check";
      for (const m of this.wire) {
        if (m.arrive < next) {
          next = m.arrive;
          what = m;
        }
      }
      if (this.handshakeAt !== null && this.handshakeAt < next) {
        next = this.handshakeAt;
        what = "handshake";
      }
      if (this.setupUntil !== null && this.b === "paused" && this.setupUntil < next) {
        next = this.setupUntil;
        what = "setup";
      }
      if (next > to) break;
      this.t = next;
      if (what === "check") this.check();
      else if (what === "handshake") this.connected();
      else if (what === "setup") this.setupFailed();
      else this.arrive(what);
    }
    this.t = to;
  }

  // Messages, not ticks, that reached b while it was paused
  get unreadCount() {
    return this.unread.filter((m) => m.kind !== "tick").length;
  }
}

if (typeof customElements !== "undefined") define();

function define() {
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const SPEEDS = { "1×": 1, "4×": 4, "15×": 15 };
const STEP = 100;
const seconds = (ms) => `${(ms / 1000).toFixed(2)} s`;
let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  beam-nodes:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: beam-nodes / inline-size;
  }
  beam-nodes .controls,
  beam-nodes .settings {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
  }
  beam-nodes .settings {
    margin-top: .75rem;
    gap: .5rem 1rem;
  }
  beam-nodes button,
  beam-nodes .choices label {
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
  beam-nodes button.play {
    min-width: 5.5rem;
    border-color: var(--brass);
    font-weight: 700;
  }
  beam-nodes button:disabled {
    cursor: default;
    opacity: .5;
  }
  beam-nodes button:focus-visible,
  beam-nodes .choices label:has(:focus-visible) {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  beam-nodes .clock {
    margin-left: auto;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  beam-nodes .clock output {
    display: inline-block;
    min-width: 7ch;
    text-align: right;
    color: var(--ink);
  }
  beam-nodes .choices {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .35rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  beam-nodes .choices legend {
    float: left;
    margin-right: .25rem;
    padding: 0;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  beam-nodes .choices label {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
  }
  beam-nodes .choices label:has(:checked) {
    border-color: var(--brass);
    background: var(--tint);
  }
  beam-nodes .choices input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
  }
  beam-nodes .note {
    margin: .6rem 0 0;
    font-size: .9rem;
    color: var(--muted);
  }
  beam-nodes .stage {
    margin-top: 1rem;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: .6rem;
  }
  beam-nodes .node {
    display: grid;
    align-content: start;
    gap: .35rem;
    min-width: 0;
    padding: .5rem;
    border: 1.5px solid var(--line);
    border-radius: 4px;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  beam-nodes .node.paused {
    border-style: dashed;
  }
  beam-nodes .node.halted {
    border-style: dashed;
    opacity: .6;
  }
  beam-nodes .node .name {
    font-family: var(--code);
    font-size: .85rem;
    font-weight: 700;
    color: var(--ink);
  }
  beam-nodes .node output {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  beam-nodes .node .state output {
    font-weight: 700;
  }
  beam-nodes .node.paused .state output,
  beam-nodes .node.halted .state output,
  beam-nodes .view.down output {
    color: var(--code-error);
  }
  beam-nodes .line {
    display: block;
    min-height: 1.3em;
  }
  beam-nodes .pips {
    display: inline-flex;
    gap: 3px;
    margin-left: .3rem;
    vertical-align: -.1rem;
  }
  beam-nodes .pips span {
    width: .7rem;
    height: .7rem;
    border: 1.5px solid var(--line);
    border-radius: 2px;
  }
  beam-nodes .pips span.on {
    background: var(--brass);
    border-color: var(--brass);
  }
  beam-nodes .actions {
    display: grid;
    gap: .35rem;
    margin-top: .2rem;
  }
  beam-nodes .actions button {
    width: 100%;
    font-size: .85rem;
    padding: .3rem .5rem;
  }
  beam-nodes .actions code {
    font-size: .8rem;
  }
  /* The connection: a track from a (left) to b (right) */
  beam-nodes .connection {
    grid-column: 1 / -1;
    display: grid;
    gap: .35rem;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  beam-nodes .track {
    position: relative;
    height: 22px;
    margin: 0 .6rem;
  }
  beam-nodes .track::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    border-top: 2px solid var(--line);
  }
  beam-nodes .track.down::before {
    border-top-style: dotted;
    opacity: .5;
  }
  beam-nodes .track.connecting::before {
    border-top-style: dashed;
  }
  beam-nodes .dot {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    margin: -6px 0 0 -6px;
    border-radius: 50%;
    background: var(--ink);
  }
  beam-nodes .dot.tick {
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    background: var(--bg);
    border: 1.5px solid var(--muted);
  }
  beam-nodes .dot.add { background: var(--brass); }
  beam-nodes .dot.get,
  beam-nodes .dot.monitor { background: var(--link); }
  beam-nodes .dot.reply { background: var(--code-string); }
  beam-nodes .track-line {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: .2rem .8rem;
  }
  beam-nodes .connection .status output {
    color: var(--ink);
    font-weight: 700;
  }
  beam-nodes .connection button {
    justify-self: center;
    font-size: .85rem;
  }
  beam-nodes .mailbox {
    margin: 1rem 0 0;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  beam-nodes .log {
    display: grid;
    align-content: end;
    gap: .15rem;
    height: 9.5rem;
    margin: .3rem 0 0;
    padding: .4rem .5rem;
    overflow: hidden;
    border-radius: 4px;
    background: var(--code-bg);
    color: var(--code-ink);
    font-family: var(--code);
    font-size: .75rem;
    line-height: 1.35;
  }
  beam-nodes .log p {
    display: grid;
    grid-template-columns: 7ch minmax(0, 1fr);
    gap: .6rem;
    margin: 0;
    overflow-wrap: anywhere;
  }
  beam-nodes .log time {
    text-align: right;
    white-space: nowrap;
    color: var(--code-comment);
    font-variant-numeric: tabular-nums;
  }
  beam-nodes .log .down,
  beam-nodes .log .nodedown,
  beam-nodes .log .error {
    color: var(--code-error);
  }
  beam-nodes .log .up,
  beam-nodes .log .reply {
    color: var(--code-string);
  }
  beam-nodes .log .empty {
    color: var(--code-comment);
  }
  beam-nodes .lost {
    margin: .6rem 0 0;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  beam-nodes .lost output {
    color: var(--ink);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  beam-nodes .lost.on output {
    color: var(--code-error);
  }
  beam-nodes .key {
    display: flex;
    flex-wrap: wrap;
    gap: .25rem 1rem;
    margin: .8rem 0 0;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  beam-nodes .key .dot {
    position: static;
    display: inline-block;
    margin: 0 .35rem 0 0;
    vertical-align: -.05rem;
  }
  beam-nodes .key .dot.tick {
    margin: 0 .35rem 0 0;
    vertical-align: 0;
  }
  beam-nodes .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @container beam-nodes (max-width: 30rem) {
    beam-nodes .stage {
      gap: .4rem;
    }
    beam-nodes .node {
      padding: .4rem;
      font-size: .75rem;
    }
    beam-nodes .actions button {
      padding: .25rem .35rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    beam-nodes .track .dot {
      display: none;
    }
  }
</style>`);

customElements.define("beam-nodes", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const id = `beam-nodes-${++ids}`;
    const radios = (name, values, checked, label = (v) => v) => values.map((v) =>
      `<label><input type="radio" name="${id}-${name}" value="${v}"${String(v) === String(checked) ? " checked" : ""}> ${label(v)}</label>`).join("");

    this.innerHTML = `
      <div class="controls">
        <button type="button" class="play">Play</button>
        <button type="button" class="step">Step</button>
        <button type="button" class="reset">Reset</button>
        <span class="clock">time <output></output></span>
      </div>
      <div class="settings">
        <fieldset class="choices" data-setting="tickTime"><legend>Net tick time</legend>${radios("tick", TICK_TIMES, 4000, (ms) => `${ms / 1000} s`)}</fieldset>
        <fieldset class="choices" data-setting="speed"><legend>Speed</legend>${radios("speed", Object.keys(SPEEDS), "1×")}</fieldset>
      </div>
      <p class="note">A simulation of down.exs. Messages take 120 ms to cross here, so you can see them; in nodes.exs a round trip between two nodes took 27 µs. Changing the net tick time starts it again.</p>
      <div class="stage">
        <div class="node node-a">
          <span class="name">a@MacBookAir</span>
          <span class="line view">b: <output class="b-up"></output></span>
          <span class="line">last heard from b: <output class="heard-b"></output></span>
          <span class="line">checks with nothing <span class="pips" aria-hidden="true"><span></span><span></span><span></span><span></span></span><span class="sr missed-a"></span></span>
          <span class="line">monitor on the counter: <output class="monitor"></output></span>
          <div class="actions">
            <button type="button" data-do="add">send <code>{:add, 1}</code></button>
            <button type="button" data-do="get">send <code>{:get, self()}</code></button>
            <button type="button" data-do="monitor"><code>Process.monitor</code></button>
          </div>
        </div>
        <div class="node node-b">
          <span class="name">b@MacBookAir</span>
          <span class="line state">b is <output class="b-state"></output></span>
          <span class="line">counter at <output class="count"></output></span>
          <span class="line view a-view">a: <output class="a-up"></output></span>
          <span class="line">unread messages <output class="unread"></output></span>
          <div class="actions">
            <button type="button" data-do="pause">Pause b</button>
            <button type="button" data-do="halt">Halt b</button>
          </div>
        </div>
        <div class="connection">
          <div class="track" aria-hidden="true"></div>
          <span class="track-line">
            <span class="status">connection: <output class="conn"></output></span>
            <span>crossing: <output class="crossing"></output></span>
          </span>
          <button type="button" data-do="disconnect"><code>Node.disconnect(b)</code></button>
        </div>
      </div>
      <p class="mailbox">What a's mailbox gets</p>
      <div class="log" role="log" aria-label="What a's mailbox gets"></div>
      <p class="lost">Lost on the way, which a has no way of knowing: <output></output></p>
      <p class="key" aria-hidden="true">
        <span><span class="dot add"></span><code>{:add, 1}</code></span>
        <span><span class="dot get"></span><code>{:get, self()}</code> or a monitor</span>
        <span><span class="dot reply"></span>the counter's reply</span>
        <span><span class="dot tick"></span>a tick</span>
      </p>`;

    this.$ = (selector) => this.querySelector(selector);
    this.tickTime = 4000;
    this.speed = SPEEDS["1×"];
    this.playing = false;
    this.visible = false;

    this.$(".play").addEventListener("click", () => this.setPlaying(!this.playing));
    this.$(".step").addEventListener("click", () => {
      this.cluster.advance(this.cluster.t + STEP);
      this.render();
    });
    this.$(".reset").addEventListener("click", () => this.reset());
    this.$(".settings").addEventListener("change", (e) => {
      const setting = e.target.closest("[data-setting]").dataset.setting;
      if (setting === "speed") this.speed = SPEEDS[e.target.value];
      else {
        this.tickTime = +e.target.value;
        this.reset();
      }
    });
    this.addEventListener("click", (e) => {
      const button = e.target.closest("[data-do]");
      if (!button) return;
      const c = this.cluster;
      const action = button.dataset.do;
      if (action === "add" || action === "get" || action === "monitor") c.sendA(action);
      else if (action === "disconnect") c.disconnect();
      else if (action === "pause") (c.b === "paused" ? c.resume() : c.pause());
      else if (action === "halt") c.halt();
      this.render();
    });

    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.loop();
    });
    this.observer.observe(this);

    this.reset();
    this.setPlaying(false);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  reset() {
    this.cluster = new Cluster({ tickTime: this.tickTime });
    this.logged = -1;
    this.render();
  }

  setPlaying(playing) {
    this.playing = playing;
    this.$(".play").textContent = playing ? "Pause" : "Play";
    this.loop();
    this.render();
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
    const real = Math.min(100, now - this.last);
    this.last = now;
    this.cluster.advance(this.cluster.t + real * this.speed);
    this.render();
    this.loop();
  }

  render() {
    const c = this.cluster;
    if (!c) return;
    const set = (node, text) => {
      if (node.textContent !== text) node.textContent = text;
    };
    set(this.$(".clock output"), seconds(c.t));

    // a
    set(this.$(".b-up"), c.bUp ? "up" : "down");
    this.$(".node-a .view").classList.toggle("down", !c.bUp);
    set(this.$(".heard-b"), c.conn === "up" ? `${seconds(c.t - c.a.heard)} ago` : "–");
    const missed = c.conn === "up" ? c.a.missed : 0;
    this.querySelectorAll(".pips span").forEach((pip, i) => pip.classList.toggle("on", i < missed));
    set(this.$(".missed-a"), `${missed} of ${CHECKS}`);
    set(this.$(".monitor"), c.monitor ? "on" : "none");
    this.$('[data-do="monitor"]').disabled = c.monitor;

    // b
    const nodeB = this.$(".node-b");
    nodeB.classList.toggle("paused", c.b === "paused");
    nodeB.classList.toggle("halted", c.b === "halted");
    set(this.$(".b-state"), c.b);
    set(this.$(".count"), c.count === null ? "–" : String(c.count));
    set(this.$(".a-up"), c.b === "halted" ? "–" : c.aUp ? "up" : "down");
    this.$(".a-view").classList.toggle("down", c.b !== "halted" && !c.aUp);
    set(this.$(".unread"), String(c.unreadCount));
    const pause = this.$('[data-do="pause"]');
    set(pause, c.b === "paused" ? "Let b carry on" : "Pause b");
    pause.disabled = c.b === "halted";
    this.$('[data-do="halt"]').disabled = c.b === "halted";

    // The connection
    const track = this.$(".track");
    track.classList.toggle("down", c.conn === "down");
    track.classList.toggle("connecting", c.conn === "connecting");
    let status = c.conn === "up" ? "up" : c.conn === "down" ? "none" : "connecting";
    if (c.conn === "connecting" && c.b === "paused") status += `, gives up in ${seconds(c.setupUntil - c.t)}`;
    set(this.$(".conn"), status);
    const ab = c.wire.filter((m) => m.dir === "ab").length;
    set(this.$(".crossing"), `${ab} to b, ${c.wire.length - ab} to a`);
    this.$('[data-do="disconnect"]').disabled = c.conn !== "up";
    const dots = track.children;
    while (dots.length < c.wire.length) track.append(document.createElement("span"));
    for (let i = 0; i < dots.length; i++) {
      const m = c.wire[i];
      dots[i].hidden = !m;
      if (!m) continue;
      const share = Math.min(1, Math.max(0, (c.t - m.sent) / (m.arrive - m.sent)));
      dots[i].className = `dot ${m.kind}`;
      dots[i].style.left = `${(m.dir === "ab" ? share : 1 - share) * 100}%`;
    }

    // a's mailbox, newest last
    if (this.logged !== c.log.length || c.log.length === 50) {
      this.logged = c.log.length;
      const lines = c.log.slice(-6).map((entry) => {
        const p = document.createElement("p");
        const time = document.createElement("time");
        time.textContent = seconds(entry.t);
        const text = document.createElement("span");
        text.className = entry.kind;
        text.textContent = entry.text;
        p.append(time, text);
        return p;
      });
      if (!lines.length) {
        const p = document.createElement("p");
        p.innerHTML = `<time></time><span class="empty">nothing yet</span>`;
        lines.push(p);
      }
      const log = this.$(".log");
      if (log.textContent !== lines.map((p) => p.textContent).join("")) log.replaceChildren(...lines);
    }
    set(this.$(".lost output"), String(c.lost));
    this.$(".lost").classList.toggle("on", c.lost > 0);

    this.$(".step").disabled = this.playing && this.visible;
  }
});
}
