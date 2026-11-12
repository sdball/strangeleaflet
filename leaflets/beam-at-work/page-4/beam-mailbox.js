// <beam-mailbox>: page 4's widget. The slow consumer from slow-consumer.exs
// and slow-worker.mjs, side by side and slowed down: a producer sends
// messages at a steady rate to a consumer that works on each one for a few
// milliseconds. With "sends and moves on", whatever the consumer can't keep
// up with waits in its queue; with "waits for each reply", the producer
// sends one message and waits for the consumer's answer before the next.
//
// The headline figure is how long the oldest waiting message has waited:
// about how long any message waits before the consumer gets to it. When the
// producer outpaces the consumer it grows without limit; when the producer
// waits for each reply it stays near zero. The consumer shows how busy it's
// been over the last moment rather than each message's progress, which
// would flicker at these speeds, and each end shows its rate: the producer
// sends and the consumer handles so many a second, counted over the last
// WINDOW of simulated time. Waiting for replies doesn't raise the
// consumer's rate; it brings the producer's down to match.
//
// It's a simulation, not a replay, and both sides follow the same rules,
// because in the runs on the page they behaved the same. What differs is
// where the waiting messages are (the BEAM consumer's mailbox, part of the
// consumer; the worker's message queue in Node) and what each costs, from
// queue-memory.exs and queue-memory.mjs. It doesn't use ../beam-sim.js: this
// page is about milliseconds and rates, not reductions and schedulers.
//
// It holds a static fallback (what feed readers and no-JS visitors see) and
// replaces it once this module runs. It starts paused at zero, since the
// start (an empty queue beginning to fill) is the part worth watching, and
// a reader scrolling to it would otherwise miss it. Step moves it along a
// few milliseconds at a time while it's paused.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const RATES = [250, 500, 1000]; // messages a second
const WORKS = [1, 2, 4]; // ms the consumer spends on each message
// Simulated milliseconds per real millisecond
const SPEEDS = { "1/100": 0.01, "1/25": 0.04, "1/5": 0.2 };
const STEP = 5; // simulated ms per press of Step
const WINDOW = 400; // simulated ms the rates and the busy figure are measured over
// Measured memory per waiting message: queue-memory.exs (the consumer's
// process memory) and queue-memory.mjs (the Node process's RSS, 770 to 918
// bytes over five sizes and two runs)
const SIDES = {
  beam: {
    title: "BEAM",
    note: "Two processes. The waiting messages are in the consumer's mailbox, which is part of the consumer.",
    producer: "producer",
    consumer: "consumer",
    queue: "the consumer's mailbox, oldest first",
    bytes: 1719,
    memory: "consumer's mailbox",
  },
  node: {
    title: "Node",
    note: "The main thread and a worker thread. The waiting messages are in the worker's message queue.",
    producer: "main thread",
    consumer: "worker",
    queue: "the worker's message queue, oldest first",
    bytes: 800,
    memory: "worker's queue",
  },
};
const CHIP = 11; // px: a message in the queue
const CHIP_HEIGHT = 16;
const GAP = 3;
const ROWS = 4; // of messages shown; the rest are counted

const number = (n) => n.toLocaleString("en-US");
const duration = (ms) => (ms < 1000 ? `${number(Math.round(ms))} ms` : `${(ms / 1000).toFixed(2)} s`);
const size = (bytes) =>
  bytes >= 1e6 ? `${(bytes / 1e6).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`
  : bytes >= 1e3 ? `${number(Math.round(bytes / 1e3))} KB`
  : `${number(bytes)} bytes`;

let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  beam-mailbox:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: beam-mailbox / inline-size;
  }
  beam-mailbox .controls,
  beam-mailbox .settings {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
  }
  beam-mailbox .settings {
    margin-top: .75rem;
    gap: .5rem 1rem;
  }
  beam-mailbox button,
  beam-mailbox .choices label {
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
  beam-mailbox button.play {
    min-width: 5.5rem;
    border-color: var(--brass);
    font-weight: 700;
  }
  beam-mailbox button:disabled {
    cursor: default;
    opacity: .5;
  }
  beam-mailbox button:focus-visible,
  beam-mailbox .choices label:has(:focus-visible) {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  beam-mailbox .clock {
    margin-left: auto;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  beam-mailbox .clock output {
    display: inline-block;
    min-width: 6ch;
    text-align: right;
    color: var(--ink);
  }
  beam-mailbox .choices {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .35rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  beam-mailbox .choices legend {
    float: left;
    margin-right: .25rem;
    padding: 0;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  beam-mailbox .choices label {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-width: 44px;
    justify-content: center;
  }
  beam-mailbox .choices label:has(:checked) {
    border-color: var(--brass);
    background: var(--tint);
  }
  beam-mailbox .choices input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
  }
  beam-mailbox .note {
    margin: .6rem 0 0;
    font-size: .9rem;
    color: var(--muted);
  }
  beam-mailbox .side {
    margin-top: 1.25rem;
    padding-top: .75rem;
    border-top: 1.5px solid var(--line);
    min-width: 0;
  }
  /* Wide enough: the two runtimes side by side, to watch at once */
  @container beam-mailbox (min-width: 38rem) {
    beam-mailbox .sides {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 1.25rem;
    }
    /* Each side's rows line up with the other's */
    beam-mailbox .side {
      display: grid;
      grid-template-rows: subgrid;
      grid-row: span 5;
      align-content: start;
    }
  }
  beam-mailbox .side-title {
    margin: 0;
    font-family: var(--type);
    font-size: 1rem;
    font-weight: 700;
  }
  beam-mailbox .side-note {
    margin: .15rem 0 .6rem;
    font-size: .85rem;
    color: var(--muted);
  }
  beam-mailbox .flow {
    display: grid;
    gap: .4rem;
  }
  beam-mailbox .end {
    display: grid;
    gap: .1rem;
    padding: .25rem .5rem;
    border: 1.5px solid var(--line);
    border-radius: 4px;
    font-family: var(--type);
    font-size: .75rem;
    color: var(--muted);
  }
  beam-mailbox .end .name {
    font-family: var(--code);
    font-size: .8rem;
    font-weight: 700;
    color: var(--ink);
  }
  beam-mailbox .end.held {
    border-color: var(--brass);
  }
  /* Every word a status can be, stacked in one spot sized to the longest,
     so changing it never moves anything */
  beam-mailbox .states {
    display: grid;
  }
  beam-mailbox .states > span {
    grid-area: 1 / 1;
    opacity: 0;
    transition: opacity .15s;
  }
  beam-mailbox .states > span.on {
    opacity: 1;
  }
  beam-mailbox .states > span.alert {
    color: var(--brass);
    font-weight: 700;
  }
  beam-mailbox .end .top {
    display: flex;
    align-items: baseline;
    gap: .6rem;
  }
  beam-mailbox .end output {
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  /* The headline: how long the oldest waiting message has waited */
  beam-mailbox .age {
    display: grid;
    margin: .6rem 0 0;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  beam-mailbox .age output {
    font-size: 1.3rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  beam-mailbox .queue {
    padding: .4rem .5rem;
    border: 1.5px dashed var(--line);
    border-radius: 4px;
  }
  beam-mailbox .chips {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: ${GAP}px;
    height: calc(${ROWS} * ${CHIP_HEIGHT}px + ${ROWS - 1} * ${GAP}px);
    overflow: hidden;
  }
  beam-mailbox .more {
    height: 2.8em; /* two lines, filled or not */
    line-height: 1.4;
    overflow: hidden;
    margin-top: .3rem;
    font-family: var(--type);
    font-size: .75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  beam-mailbox .chip {
    flex: none;
    width: ${CHIP}px;
    height: ${CHIP_HEIGHT}px;
    border-radius: 2px;
    background: var(--code-string);
    visibility: hidden;
  }
  beam-mailbox .queue-name {
    display: block;
    margin-bottom: .3rem;
    font-family: var(--type);
    font-size: .75rem;
    color: var(--muted);
  }
  beam-mailbox .chip.on {
    visibility: visible;
  }
  beam-mailbox .chip.reply {
    background: var(--brass);
  }
  beam-mailbox .readout {
    margin: .5rem 0 0;
    border-collapse: collapse;
    font-family: var(--type);
    font-size: .85rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  beam-mailbox .readout tr,
  beam-mailbox .readout th,
  beam-mailbox .readout td {
    border: 0;
    background: none;
  }
  beam-mailbox .readout th,
  beam-mailbox .readout td {
    padding: .05rem .6rem .05rem 0;
    font-weight: normal;
  }
  beam-mailbox .readout th {
    text-align: left;
    color: var(--muted);
  }
  /* Wide enough for the longest values, so nothing moves */
  beam-mailbox .readout td {
    min-width: 8ch;
    text-align: right;
  }
  beam-mailbox .key {
    display: flex;
    flex-wrap: wrap;
    gap: .25rem 1rem;
    margin: 1rem 0 0;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  beam-mailbox .key span::before {
    content: "";
    display: inline-block;
    width: ${CHIP}px;
    height: .8rem;
    margin-right: .35rem;
    vertical-align: -.1rem;
    border-radius: 2px;
    background: var(--swatch);
  }
  @media (prefers-reduced-motion: reduce) {
    beam-mailbox .states > span {
      transition: none;
    }
  }
</style>`);

// One producer and one consumer, in simulated milliseconds. Message k is due
// at base + k * (1000 / rate), as in slow-consumer.exs: whatever's due is
// sent, so a producer that's held up catches up. While it waits for a reply
// it sends nothing. The consumer takes the oldest waiting message the moment
// it's free, and replies when it's done if the message asked for one.
class Pair {
  constructor() {
    this.t = 0;
    this.sent = 0;
    this.handled = 0;
    this.queue = []; // { at: when it was sent, reply: whether it wants one }
    this.head = 0; // the oldest waiting message's index in queue
    this.current = null; // { start, reply } while the consumer works
    this.awaiting = false;
    this.busy = 0; // ms the consumer has spent working, in all
    this.history = [[0, 0]]; // [t, busy] at the end of each advance, recent ones
    this.sends = []; // when each recent message was sent
    this.handles = []; // when each recent message was handled
    this.rebase();
  }

  get waiting() {
    return this.queue.length - this.head;
  }

  // Start the schedule over from now, after a change of rate or mode, so a
  // producer that was waiting doesn't send every message it missed at once
  rebase() {
    this.base = this.t;
    this.due = 0;
  }

  advance(to, { rate, work, mode }) {
    for (;;) {
      const send = this.awaiting ? Infinity : Math.max(this.t, this.base + (this.due * 1000) / rate);
      const finish = this.current ? this.current.start + work : Infinity;
      const next = Math.min(send, finish);
      if (next > to) break;
      if (this.current) this.busy += next - this.t;
      this.t = next;
      if (finish <= send) {
        if (this.current.reply) this.awaiting = false;
        this.current = null;
        this.handled++;
        this.handles.push(this.t);
      } else {
        const reply = mode === "call";
        this.queue.push({ at: this.t, reply });
        this.sent++;
        this.sends.push(this.t);
        this.due++;
        if (reply) this.awaiting = true;
      }
      if (!this.current && this.waiting) {
        this.current = { start: this.t, reply: this.queue[this.head++].reply };
        // Let go of messages already taken, now and then
        if (this.head > 4096) {
          this.queue = this.queue.slice(this.head);
          this.head = 0;
        }
      }
    }
    if (this.current) this.busy += to - this.t;
    this.t = to;
    this.history.push([to, this.busy]);
    while (this.history.length > 2 && this.history[1][0] <= to - WINDOW) this.history.shift();
    for (const times of [this.sends, this.handles]) {
      const old = times.findIndex((at) => at > to - WINDOW);
      times.splice(0, old === -1 ? times.length : old);
    }
  }

  // Messages a second over the last WINDOW, from the times in `times`
  rate(times) {
    const span = Math.min(WINDOW, this.t);
    return span ? (times.length * 1000) / span : 0;
  }

  // How long the oldest waiting message has waited
  get oldestAge() {
    return this.waiting ? this.t - this.queue[this.head].at : 0;
  }

  // The share of the last moment the consumer spent working
  get busyShare() {
    const [t0, busy0] = this.history[0];
    return this.t > t0 ? (this.busy - busy0) / (this.t - t0) : 0;
  }

  // The oldest n waiting messages, oldest first
  oldest(n) {
    return this.queue.slice(this.head, this.head + n);
  }
}

customElements.define("beam-mailbox", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const id = `beam-mailbox-${++ids}`;
    const radios = (name, values, checked, label = (v) => v) => values.map((v) =>
      `<label><input type="radio" name="${id}-${name}" value="${v}"${v === checked ? " checked" : ""}> ${label(v)}</label>`).join("");
    const side = (key) => {
      const s = SIDES[key];
      return `
        <section class="side" data-side="${key}">
          <h3 class="side-title">${s.title}</h3>
          <p class="side-note">${s.note}</p>
          <div class="flow" aria-hidden="true">
            <div class="end producer">
              <span class="top"><span class="name">${s.producer}</span><span class="states"><span data-state="sending"></span><span data-state="waiting" class="alert">waiting for a reply</span></span></span>
              <span>sends <output class="sends"></output> a second</span>
            </div>
            <div class="queue">
              <span class="queue-name">${s.queue}</span>
              <div class="chips"></div>
              <div class="more"></div>
            </div>
            <div class="end consumer">
              <span class="top"><span class="name">${s.consumer}</span></span>
              <span>handles <output class="handles"></output> a second, busy <output class="busy"></output></span>
            </div>
          </div>
          <p class="age"><span>the oldest waiting message has waited</span><output class="oldest"></output></p>
          <table class="readout" aria-label="${s.title}: messages so far">
            <tbody>
              <tr><th scope="row">sent</th><td class="sent"></td></tr>
              <tr><th scope="row">handled</th><td class="handled"></td></tr>
              <tr><th scope="row">waiting</th><td class="waiting"></td></tr>
              <tr><th scope="row">in the ${s.memory}</th><td class="memory"></td></tr>
            </tbody>
          </table>
        </section>`;
    };

    this.innerHTML = `
      <div class="controls">
        <button type="button" class="play"></button>
        <button type="button" class="step">Step</button>
        <button type="button" class="reset">Reset</button>
        <span class="clock">time <output></output></span>
      </div>
      <div class="settings">
        <fieldset class="choices" data-setting="mode"><legend>The producer</legend>${radios("mode", ["send", "call"], "send", (v) => (v === "send" ? "sends and moves on" : "waits for each reply"))}</fieldset>
        <fieldset class="choices" data-setting="rate"><legend>Sends a second</legend>${radios("rate", RATES.map(String), "1000", (v) => number(+v))}</fieldset>
        <fieldset class="choices" data-setting="work"><legend>Each message takes</legend>${radios("work", WORKS.map(String), "2", (v) => `${v} ms`)}</fieldset>
        <fieldset class="choices" data-setting="speed"><legend>Speed</legend>${radios("speed", Object.keys(SPEEDS), "1/25")}</fieldset>
      </div>
      <p class="note">A simulation of the runs above, slowed down to watch: at 1/25 a millisecond takes 25. Both sides follow the same rules. Watch how long the oldest waiting message has waited: that's about how long every message waits before the consumer gets to it. Then switch the producer to waiting for each reply, or reset and try 250 a second. The memory figures use what one waiting message cost in each runtime (<a href="queue-memory.exs">queue-memory.exs</a>, <a href="queue-memory.mjs">queue-memory.mjs</a>).</p>
      <div class="sides">${side("beam")}${side("node")}</div>
      <p class="key" aria-hidden="true">
        <span style="--swatch: var(--code-string)">a message</span>
        <span style="--swatch: var(--brass)">a message whose sender is waiting for the reply</span>
      </p>`;

    this.$ = (selector) => this.querySelector(selector);
    this.sides = Object.keys(SIDES).map((key) => {
      const el = this.querySelector(`[data-side="${key}"]`);
      return { key, el, bytes: SIDES[key].bytes, chips: el.querySelector(".chips"), more: el.querySelector(".more") };
    });
    this.settings = { mode: "send", rate: 1000, work: 2 };
    this.speed = SPEEDS["1/25"];
    this.playing = false;
    this.visible = false;

    this.$(".play").addEventListener("click", () => this.setPlaying(!this.playing));
    this.$(".step").addEventListener("click", () => {
      this.advance(STEP);
      this.render();
    });
    this.$(".reset").addEventListener("click", () => this.reset());
    this.$(".settings").addEventListener("change", (e) => {
      const setting = e.target.closest("[data-setting]").dataset.setting;
      if (setting === "speed") {
        this.speed = SPEEDS[e.target.value];
        return;
      }
      this.settings[setting] = setting === "mode" ? e.target.value : +e.target.value;
      for (const s of this.sides) s.pair.rebase();
      this.render();
    });
    this.onMotion = () => reducedMotion.matches && this.setPlaying(false);
    reducedMotion.addEventListener("change", this.onMotion);

    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.loop();
    });
    this.observer.observe(this);
    // As many messages as fit in the queue
    this.resizer = new ResizeObserver(() => this.layout());
    this.resizer.observe(this.sides[0].chips);

    this.reset();
    this.setPlaying(this.playing);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.resizer?.disconnect();
    reducedMotion.removeEventListener("change", this.onMotion);
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  reset() {
    for (const s of this.sides) s.pair = new Pair();
    this.carry = 0;
    this.render();
  }

  layout() {
    const fit = ROWS * Math.max(1, Math.floor((this.sides[0].chips.clientWidth + GAP) / (CHIP + GAP)));
    if (fit === this.fit) return;
    this.fit = fit;
    for (const s of this.sides) {
      s.chips.replaceChildren(...Array.from({ length: fit }, () => {
        const chip = document.createElement("span");
        chip.className = "chip";
        return chip;
      }));
    }
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
    this.advance(real * this.speed);
    this.render();
    this.loop();
  }

  advance(ms) {
    for (const s of this.sides) s.pair.advance(s.pair.t + ms, this.settings);
  }

  render() {
    if (!this.sides[0].pair) return;
    const t = this.sides[0].pair.t;
    const clock = `${(t / 1000).toFixed(3)} s`;
    const out = this.$(".clock output");
    if (out.textContent !== clock) out.textContent = clock;

    for (const s of this.sides) {
      const { pair, el } = s;
      const set = (selector, text) => {
        const node = el.querySelector(selector);
        if (node.textContent !== text) node.textContent = text;
      };
      set(".sent", number(pair.sent));
      set(".handled", number(pair.handled));
      set(".waiting", number(pair.waiting));
      set(".memory", size(pair.waiting * s.bytes));
      set(".oldest", pair.waiting ? duration(pair.oldestAge) : "none");
      set(".busy", `${Math.round(pair.busyShare * 100)}%`);
      // To the nearest 10: a window can catch one message more or less
      set(".sends", number(Math.round(pair.rate(pair.sends) / 10) * 10));
      set(".handles", number(Math.round(pair.rate(pair.handles) / 10) * 10));

      const state = (end, name) => el.querySelectorAll(`.${end} [data-state]`).forEach((span) => span.classList.toggle("on", span.dataset.state === name));
      state("producer", pair.awaiting ? "waiting" : "sending");
      el.querySelector(".producer").classList.toggle("held", pair.awaiting);

      // The oldest first, in reading order
      const chips = s.chips.children;
      const shown = pair.oldest(chips.length);
      for (let i = 0; i < chips.length; i++) {
        const message = shown[i];
        chips[i].className = !message ? "chip" : message.reply ? "chip on reply" : "chip on";
      }
      const hidden = pair.waiting - shown.length;
      // The message the producer is waiting on is the newest, so it's
      // among the hidden ones until the queue gets short
      const more = !hidden ? ""
        : pair.awaiting && !pair.current?.reply ? `and ${number(hidden)} more, the newest being the one the ${SIDES[s.key].producer} is waiting on`
        : `and ${number(hidden)} more`;
      if (s.more.textContent !== more) s.more.textContent = more;
    }

    this.$(".step").disabled = this.playing && this.visible;
  }
});
