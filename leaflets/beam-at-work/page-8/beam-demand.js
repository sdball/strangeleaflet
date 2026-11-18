// <beam-demand>: page 8's widget. pipeline.exs slowed down: events arrive
// at a producer at a steady rate, and one to three consumers, each taking
// 2 ms over an event, ask the producer for them. The producer sends a
// consumer no more than it has asked for; events nobody has asked for wait
// in the producer's buffer, and once that's full the oldest are dropped.
//
// Each consumer shows its max_demand as a row of slots: the event it's
// working on, events it has been sent and not handled yet, events it has
// asked for and not been sent, and room it will ask for again once it
// finishes its current batch. The slots never overflow: that's the point.
//
// It's a simulation of GenStage's rules, not a replay, in simulated
// milliseconds. Messages between the stages take no time (in the BEAM they
// take microseconds). The rules, from GenStage 1.3.2's source:
// - On subscribing, a consumer asks for max_demand.
// - The producer emits each event as it arrives. The default dispatcher
//   (DemandDispatcher) sends it to the consumer that has asked for the
//   most; if nobody has asked, it goes in the buffer, and past buffer_size
//   the oldest is dropped (buffer_keep: :last).
// - When a consumer asks and the buffer has events, it's sent up to what it
//   asked for from the buffer, oldest first, in one message.
// - A consumer splits each message into batches of at most
//   max_demand - min_demand (min_demand is half of max_demand). Each batch
//   lowers what it's waiting for; when that reaches min_demand or below, it
//   will ask for enough to get back to max_demand, after handling that
//   batch (Utils.split_batches, consumer_dispatch).
//
// It holds a static fallback (what feed readers and no-JS visitors see) and
// replaces it once this module runs. It starts paused at zero.

const RATES = [500, 1000, 2000]; // events arriving a second
const CONSUMERS = [1, 2, 3];
const DEMANDS = [10, 50]; // max_demand
const BUFFERS = [200, 2000]; // buffer_size
const WORK = 2; // ms a consumer spends on each event
// Simulated milliseconds per real millisecond
const SPEEDS = { "1/100": 0.01, "1/25": 0.04, "1/5": 0.2 };
const STEP = 2; // simulated ms per press of Step
const WINDOW = 400; // simulated ms the rates are measured over

// The pipeline, in simulated milliseconds
export class Pipeline {
  constructor({ rate, consumers, maxDemand, bufferSize }) {
    this.t = 0;
    this.rate = rate;
    this.maxDemand = maxDemand;
    this.minDemand = Math.floor(maxDemand / 2);
    this.bufferSize = bufferSize;
    this.arrived = 0;
    this.handled = 0;
    this.dropped = 0;
    this.buffer = []; // arrival times, oldest first
    this.head = 0; // the oldest buffered event's index in buffer
    this.arrivals = []; // recent arrival times, for the rate
    this.handles = []; // recent handle times, for the rate
    this.consumers = Array.from({ length: consumers }, (_, i) => ({
      id: i + 1,
      asked: 0, // demand the producer holds for it: asked for, not sent
      pending: maxDemand, // what it's waiting for, as it counts it
      batches: [], // { events: [arrival times], ask }, oldest first
      current: null, // { start, at } while it works on an event
      handled: 0,
      lastSent: -Infinity, // when it was last sent events, for the view
      lastAsk: -Infinity, // when it last asked, for the view
    }));
    this.rebase();
    // Subscribing: each consumer asks for max_demand
    for (const c of this.consumers) this.ask(c, maxDemand);
  }

  get buffered() {
    return this.buffer.length - this.head;
  }

  // Events sent to consumers and not handled yet
  get inFlight() {
    return this.consumers.reduce((n, c) => n + this.held(c), 0);
  }

  // Events a consumer has been sent and not handled, the current one included
  held(c) {
    return c.batches.reduce((n, b) => n + b.events.length, 0) + (c.current ? 1 : 0);
  }

  // Start the arrival schedule over from now, after a change of rate
  rebase() {
    this.base = this.t;
    this.due = 0;
  }

  ask(c, n) {
    c.asked += n;
    c.lastAsk = this.t;
    // Events waiting in the buffer go out at once, oldest first
    const take = Math.min(c.asked, this.buffered);
    if (take) {
      this.deliver(c, this.buffer.slice(this.head, this.head + take));
      this.head += take;
      if (this.head > 4096) {
        this.buffer = this.buffer.slice(this.head);
        this.head = 0;
      }
    }
  }

  // The producer sends events to a consumer: one message, split into
  // batches by the consumer as it arrives
  deliver(c, events) {
    c.asked -= events.length;
    c.lastSent = this.t;
    const size = this.maxDemand - this.minDemand;
    for (let i = 0; i < events.length; i += size) {
      const batch = events.slice(i, i + size);
      c.pending -= batch.length;
      let ask = 0;
      if (c.pending <= this.minDemand) {
        ask = this.maxDemand - c.pending;
        c.pending = this.maxDemand;
      }
      c.batches.push({ events: batch, ask });
    }
    this.start(c);
  }

  // A free consumer starts on its next event
  start(c) {
    if (c.current || !c.batches.length) return;
    const batch = c.batches[0];
    c.current = { start: this.t, at: batch.events.shift() };
  }

  arrive() {
    this.arrived++;
    this.arrivals.push(this.t);
    // The consumer that has asked for the most gets it
    let best = null;
    for (const c of this.consumers) if (c.asked > 0 && (!best || c.asked > best.asked)) best = c;
    if (best) {
      this.deliver(best, [this.t]);
    } else {
      this.buffer.push(this.t);
      if (this.buffered > this.bufferSize) {
        this.head++;
        this.dropped++;
      }
    }
  }

  finish(c) {
    c.current = null;
    c.handled++;
    this.handled++;
    this.handles.push(this.t);
    const batch = c.batches[0];
    if (!batch.events.length) {
      // The batch is done: handle_events returns, and GenStage asks for more
      c.batches.shift();
      if (batch.ask) this.ask(c, batch.ask);
    }
    this.start(c);
  }

  advance(to) {
    for (;;) {
      let next = Math.max(this.t, this.base + (this.due * 1000) / this.rate);
      let who = null;
      for (const c of this.consumers) {
        if (c.current && c.current.start + WORK < next) {
          next = c.current.start + WORK;
          who = c;
        }
      }
      if (next > to) break;
      this.t = next;
      if (who) {
        this.finish(who);
      } else {
        this.due++;
        this.arrive();
      }
    }
    this.t = to;
    for (const times of [this.arrivals, this.handles]) {
      const old = times.findIndex((at) => at > to - WINDOW);
      times.splice(0, old === -1 ? times.length : old);
    }
  }

  // Events a second over the last WINDOW, from the times in `times`
  perSecond(times) {
    const span = Math.min(WINDOW, this.t);
    return span ? (times.length * 1000) / span : 0;
  }

  // How long the oldest event not handled yet has waited
  get oldestAge() {
    let oldest = this.buffered ? this.buffer[this.head] : Infinity;
    for (const c of this.consumers) {
      if (c.current) oldest = Math.min(oldest, c.current.at);
      else if (c.batches.length) oldest = Math.min(oldest, c.batches[0].events[0]);
    }
    return oldest === Infinity ? null : this.t - oldest;
  }
}

if (typeof customElements !== "undefined") define();

function define() {
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const number = (n) => n.toLocaleString("en-US");
const duration = (ms) => (ms < 1000 ? `${number(Math.round(ms))} ms` : `${(ms / 1000).toFixed(2)} s`);
let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  beam-demand:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: beam-demand / inline-size;
  }
  beam-demand .controls,
  beam-demand .settings {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
  }
  beam-demand .settings {
    margin-top: .75rem;
    gap: .5rem 1rem;
  }
  beam-demand button,
  beam-demand .choices label {
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
  beam-demand button.play {
    min-width: 5.5rem;
    border-color: var(--brass);
    font-weight: 700;
  }
  beam-demand button:disabled {
    cursor: default;
    opacity: .5;
  }
  beam-demand button:focus-visible,
  beam-demand .choices label:has(:focus-visible) {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  beam-demand .clock {
    margin-left: auto;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  beam-demand .clock output {
    display: inline-block;
    min-width: 6ch;
    text-align: right;
    color: var(--ink);
  }
  beam-demand .choices {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .35rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  beam-demand .choices legend {
    float: left;
    margin-right: .25rem;
    padding: 0;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
  }
  beam-demand .choices legend code {
    font-size: .85rem;
  }
  beam-demand .choices label {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-width: 44px;
    justify-content: center;
  }
  beam-demand .choices label:has(:checked) {
    border-color: var(--brass);
    background: var(--tint);
  }
  beam-demand .choices input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
  }
  beam-demand .note {
    margin: .6rem 0 0;
    font-size: .9rem;
    color: var(--muted);
  }
  beam-demand .stage {
    margin-top: 1rem;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0 .6rem;
  }
  beam-demand .box {
    padding: .4rem .5rem;
    border: 1.5px solid var(--line);
    border-radius: 4px;
    font-family: var(--type);
    font-size: .75rem;
    color: var(--muted);
    min-width: 0;
  }
  beam-demand .box .name {
    font-family: var(--code);
    font-size: .8rem;
    font-weight: 700;
    color: var(--ink);
  }
  beam-demand .box output {
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  beam-demand .producer {
    grid-column: 1 / -1;
    display: grid;
    gap: .3rem;
  }
  beam-demand .producer .top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: .2rem .8rem;
  }
  beam-demand .meter {
    position: relative;
    height: 14px;
    border: 1.5px dashed var(--line);
    border-radius: 3px;
    overflow: hidden;
  }
  beam-demand .meter .fill {
    position: absolute;
    inset: 0;
    background: var(--code-string);
    transform-origin: left;
    transform: scaleX(0);
  }
  beam-demand .meter.full .fill {
    background: var(--brass);
  }
  beam-demand .buffer-line {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 .8rem;
  }
  beam-demand .dropped.on output {
    color: var(--code-error);
    font-weight: 700;
  }
  /* Between the producer and each consumer: events go down, demand goes up */
  beam-demand .lane {
    display: flex;
    justify-content: center;
    gap: .9rem;
    padding: .25rem 0;
    font-family: var(--type);
    font-size: .7rem;
    color: var(--muted);
    white-space: nowrap;
  }
  beam-demand .lane span {
    padding: 0 .25rem;
    border-radius: 3px;
  }
  beam-demand .lane .pulse {
    animation: beam-demand-pulse .6s ease-out;
  }
  @keyframes beam-demand-pulse {
    from { background: var(--tint); color: var(--ink); }
    to { background: transparent; }
  }
  beam-demand .lane.off {
    visibility: hidden;
  }
  /* Narrow: the two labels one above the other */
  @container beam-demand (max-width: 34rem) {
    beam-demand .lane {
      flex-direction: column;
      align-items: center;
      gap: .1rem;
    }
  }
  beam-demand .consumer {
    display: grid;
    gap: .3rem;
    align-content: start;
  }
  beam-demand .consumer.off {
    border-style: dashed;
    opacity: .5;
  }
  beam-demand .consumer.off .slots,
  beam-demand .consumer.off .handled {
    visibility: hidden;
  }
  /* Always two lines, so a growing count never changes the box's height */
  beam-demand .consumer .handled {
    display: grid;
  }
  beam-demand .slots {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 2px;
  }
  beam-demand .slot {
    aspect-ratio: 1;
    border-radius: 2px;
    border: 1.5px solid transparent;
    background: var(--code-line, transparent);
  }
  beam-demand .slot.free {
    border: 1.5px dotted var(--line);
    background: none;
  }
  beam-demand .slot.asked {
    border-color: var(--code-string);
    background: none;
  }
  beam-demand .slot.held {
    background: var(--code-string);
  }
  beam-demand .slot.work {
    background: var(--brass);
  }
  beam-demand .age {
    display: grid;
    margin: .8rem 0 0;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  beam-demand .age output {
    font-size: 1.3rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  beam-demand .readout {
    margin: .5rem 0 0;
    border-collapse: collapse;
    font-family: var(--type);
    font-size: .85rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  beam-demand .readout tr,
  beam-demand .readout th,
  beam-demand .readout td {
    border: 0;
    background: none;
  }
  beam-demand .readout th,
  beam-demand .readout td {
    padding: .05rem .6rem .05rem 0;
    font-weight: normal;
  }
  beam-demand .readout th {
    text-align: left;
    color: var(--muted);
  }
  beam-demand .readout td {
    min-width: 8ch;
    text-align: right;
  }
  beam-demand .key {
    display: flex;
    flex-wrap: wrap;
    gap: .25rem 1rem;
    margin: 1rem 0 0;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  beam-demand .key .slot {
    display: inline-block;
    width: .8rem;
    margin-right: .35rem;
    vertical-align: -.1rem;
  }
  beam-demand .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    beam-demand .lane .pulse {
      animation: none;
    }
  }
</style>`);

customElements.define("beam-demand", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const id = `beam-demand-${++ids}`;
    const radios = (name, values, checked, label = (v) => v) => values.map((v) =>
      `<label><input type="radio" name="${id}-${name}" value="${v}"${String(v) === String(checked) ? " checked" : ""}> ${label(v)}</label>`).join("");
    const columns = [1, 2, 3];

    this.innerHTML = `
      <div class="controls">
        <button type="button" class="play">Play</button>
        <button type="button" class="step">Step</button>
        <button type="button" class="reset">Reset</button>
        <span class="clock">time <output></output></span>
      </div>
      <div class="settings">
        <fieldset class="choices" data-setting="rate"><legend>Events arriving a second</legend>${radios("rate", RATES, 1000, number)}</fieldset>
        <fieldset class="choices" data-setting="consumers"><legend>Consumers</legend>${radios("consumers", CONSUMERS, 1)}</fieldset>
        <fieldset class="choices" data-setting="maxDemand"><legend><code>max_demand</code></legend>${radios("maxDemand", DEMANDS, 10)}</fieldset>
        <fieldset class="choices" data-setting="bufferSize"><legend><code>buffer_size</code></legend>${radios("bufferSize", BUFFERS, 200, number)}</fieldset>
        <fieldset class="choices" data-setting="speed"><legend>Speed</legend>${radios("speed", Object.keys(SPEEDS), "1/25")}</fieldset>
      </div>
      <p class="note">A simulation of pipeline.exs, slowed down to watch: at 1/25 a millisecond takes 25. Each consumer takes 2 ms over an event. Changing the consumers, <code>max_demand</code>, or <code>buffer_size</code> starts it again from zero.</p>
      <div class="stage">
        <div class="box producer">
          <span class="top"><span class="name">producer</span><span>events arriving <output class="arriving"></output> a second</span></span>
          <div class="meter" aria-hidden="true"><div class="fill"></div></div>
          <span class="buffer-line"><span>buffer: <output class="buffered"></output> of <output class="size"></output></span><span class="dropped">dropped <output></output></span></span>
        </div>
        ${columns.map((n) => `<div class="lane" data-lane="${n}" aria-hidden="true"><span class="down">events ↓</span><span class="up">↑ demand</span></div>`).join("")}
        ${columns.map((n) => `
          <div class="box consumer" data-consumer="${n}">
            <span class="name">consumer ${n}</span>
            <div class="slots" aria-hidden="true"></div>
            <span class="handled"><span>handled</span><output></output></span>
            <span class="sr summary"></span>
          </div>`).join("")}
      </div>
      <p class="age"><span>the oldest event not handled yet has waited</span><output class="oldest"></output></p>
      <table class="readout" aria-label="Events so far">
        <tbody>
          <tr><th scope="row">arrived</th><td class="arrived"></td></tr>
          <tr><th scope="row">handled</th><td class="handled-all"></td></tr>
          <tr><th scope="row">in flight</th><td class="in-flight"></td></tr>
          <tr><th scope="row">buffered</th><td class="buffered-all"></td></tr>
          <tr><th scope="row">dropped</th><td class="dropped-all"></td></tr>
        </tbody>
      </table>
      <p class="key" aria-hidden="true">
        <span><span class="slot work"></span>working on it</span>
        <span><span class="slot held"></span>sent to it, waiting</span>
        <span><span class="slot asked"></span>asked for, not sent yet</span>
        <span><span class="slot free"></span>handled; asks again after this batch</span>
      </p>`;

    this.$ = (selector) => this.querySelector(selector);
    this.settings = { rate: 1000, consumers: 1, maxDemand: 10, bufferSize: 200 };
    this.speed = SPEEDS["1/25"];
    this.playing = false;
    this.visible = false;

    this.$(".play").addEventListener("click", () => this.setPlaying(!this.playing));
    this.$(".step").addEventListener("click", () => {
      this.pipeline.advance(this.pipeline.t + STEP);
      this.render();
    });
    this.$(".reset").addEventListener("click", () => this.reset());
    this.$(".settings").addEventListener("change", (e) => {
      const setting = e.target.closest("[data-setting]").dataset.setting;
      if (setting === "speed") {
        this.speed = SPEEDS[e.target.value];
        return;
      }
      this.settings[setting] = +e.target.value;
      if (setting === "rate") {
        this.pipeline.rate = this.settings.rate;
        this.pipeline.rebase();
        this.render();
      } else {
        this.reset();
      }
    });
    this.onMotion = () => reducedMotion.matches && this.setPlaying(false);
    reducedMotion.addEventListener("change", this.onMotion);

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
    reducedMotion.removeEventListener("change", this.onMotion);
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  reset() {
    this.pipeline = new Pipeline(this.settings);
    this.seen = {}; // what the lanes last pulsed for
    const max = this.settings.maxDemand;
    for (const box of this.querySelectorAll(".consumer .slots")) {
      if (box.children.length !== max) {
        box.replaceChildren(...Array.from({ length: max }, () => {
          const slot = document.createElement("span");
          slot.className = "slot free";
          return slot;
        }));
      }
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
    this.pipeline.advance(this.pipeline.t + real * this.speed);
    this.render();
    this.loop();
  }

  render() {
    const p = this.pipeline;
    if (!p) return;
    const set = (node, text) => {
      if (node.textContent !== text) node.textContent = text;
    };
    set(this.$(".clock output"), `${(p.t / 1000).toFixed(3)} s`);
    set(this.$(".arriving"), number(p.rate));
    set(this.$(".producer .buffered"), number(p.buffered));
    set(this.$(".producer .size"), number(p.bufferSize));
    set(this.$(".producer .dropped output"), number(p.dropped));
    this.$(".producer .dropped").classList.toggle("on", p.dropped > 0);
    const share = p.buffered / p.bufferSize;
    this.$(".meter .fill").style.transform = `scaleX(${share})`;
    this.$(".meter").classList.toggle("full", share >= 1);

    set(this.$(".arrived"), number(p.arrived));
    set(this.$(".handled-all"), number(p.handled));
    set(this.$(".in-flight"), number(p.inFlight));
    set(this.$(".buffered-all"), number(p.buffered));
    set(this.$(".dropped-all"), number(p.dropped));
    const age = p.oldestAge;
    set(this.$(".oldest"), age === null ? "none" : duration(age));

    const motion = !reducedMotion.matches;
    for (const n of [1, 2, 3]) {
      const c = p.consumers[n - 1];
      const box = this.querySelector(`[data-consumer="${n}"]`);
      const lane = this.querySelector(`[data-lane="${n}"]`);
      box.classList.toggle("off", !c);
      lane.classList.toggle("off", !c);
      if (!c) {
        set(box.querySelector(".summary"), "not started");
        continue;
      }
      set(box.querySelector(".handled output"), number(c.handled));
      // In order: the event it's working on, events waiting, asked for and
      // not sent, and the rest, handled and not asked for again yet
      const working = c.current ? 1 : 0;
      const held = p.held(c) - working;
      const slots = box.querySelector(".slots").children;
      for (let i = 0; i < slots.length; i++) {
        const kind = i < working ? "work" : i < working + held ? "held" : i < working + held + c.asked ? "asked" : "free";
        if (slots[i].className !== `slot ${kind}`) slots[i].className = `slot ${kind}`;
      }
      set(box.querySelector(".summary"),
        `${working ? "working on an event, " : ""}${held} waiting, ${c.asked} asked for and not sent yet`);
      // Pulse a lane's label when events went down it or demand came up it
      const seen = this.seen[n] ?? (this.seen[n] = { sent: c.lastSent, ask: c.lastAsk });
      for (const [key, cls] of [["sent", ".down"], ["ask", ".up"]]) {
        const at = key === "sent" ? c.lastSent : c.lastAsk;
        if (at !== seen[key]) {
          seen[key] = at;
          if (motion) {
            const label = lane.querySelector(cls);
            label.classList.remove("pulse");
            void label.offsetWidth;
            label.classList.add("pulse");
          }
        }
      }
    }

    this.$(".step").disabled = this.playing && this.visible;
  }
});
}
