// <ticket-race>: page 4's opening widget. wait-inside.exs and wait-inside.mjs
// side by side and slowed down: three buyers ask at the same moment for the
// last two tickets, and each sale waits 100 ms for a card payment before it
// takes a ticket.
//
// In the BEAM the seller is a process. It takes one request from its
// mailbox, checks what's left, waits for that payment in a receive that only
// the payment's reply matches, and only then looks at the next request. In
// Node the seller is an object with an async buy(): each call checks what's
// left, then awaits the payment, which hands the thread to the next buyer,
// so all three check before any of them takes a ticket. "Node with a queue"
// is wait-inside-queue.mjs, where each buy() waits for the one before it,
// and matches the BEAM exactly.
//
// Each buyer shows what it saw when its request was checked, which is where
// the race is. The sales are worked out up front from those rules and played
// back slowed down; times are the model's (100 ms a payment), and the real
// runs on the page took a few milliseconds more. It doesn't use
// ../beam-sim.js: this is about who checks what, when, not about schedulers.
//
// It holds a static fallback (what feed readers and no-JS visitors see) and
// replaces it once this module runs. Nothing moves but the payment bars,
// which readers who prefer reduced motion don't get; the sale still plays
// out over time, as text.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const TICKETS = 2;
const BUYERS = 3;
const PAY = 100; // ms a payment takes, as in the scripts
const SLOW = 15; // real ms per simulated ms: a payment takes 1.5 s to watch
const HOLD = 40; // simulated ms the clock keeps going after the last sale

let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  ticket-race:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: ticket-race / inline-size;
  }
  ticket-race .intro-title {
    margin: 0;
    font-family: var(--type);
    font-size: 1.1rem;
    font-weight: 700;
  }
  ticket-race .intro-text {
    margin: .3rem 0 0;
    font-size: .95rem;
  }
  ticket-race .controls {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
    margin-top: .75rem;
  }
  ticket-race button {
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
  ticket-race button.go {
    border-color: var(--brass);
    font-weight: 700;
  }
  ticket-race button[aria-pressed=true] {
    border-color: var(--brass);
    background: var(--tint);
  }
  ticket-race button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  ticket-race .clock {
    margin-left: auto;
    font-family: var(--type);
    font-size: .9rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  ticket-race .clock output {
    display: inline-block;
    min-width: 6ch;
    text-align: right;
    color: var(--ink);
  }
  ticket-race .note {
    margin: .6rem 0 0;
    font-size: .9rem;
    color: var(--muted);
  }
  ticket-race .side {
    margin-top: 1.25rem;
    padding-top: .75rem;
    border-top: 1.5px solid var(--line);
    min-width: 0;
  }
  /* Wide enough: the two sellers side by side, rows lined up */
  @container ticket-race (min-width: 38rem) {
    ticket-race .sides {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 1.25rem;
    }
    ticket-race .side {
      display: grid;
      grid-template-rows: subgrid;
      grid-row: span 6;
      align-content: start;
    }
  }
  ticket-race .side-title {
    margin: 0;
    font-family: var(--type);
    font-size: 1rem;
    font-weight: 700;
  }
  /* Every note a side can have, stacked in one spot sized to the longest,
     so switching the queue on and off never moves anything */
  ticket-race .side-note {
    display: grid;
    margin: .15rem 0 0;
    font-size: .85rem;
    color: var(--muted);
  }
  ticket-race .side-note > span {
    grid-area: 1 / 1;
    visibility: hidden;
  }
  ticket-race .side-note > span.on {
    visibility: visible;
  }
  /* The headline: how many tickets are left */
  ticket-race .left {
    display: grid;
    margin: .6rem 0 0;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  ticket-race .left output {
    font-size: 1.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  ticket-race .left.oversold output {
    color: var(--code-error);
  }
  ticket-race .seller {
    display: grid;
    gap: .3rem;
    margin-top: .6rem;
    padding: .5rem .6rem;
    border: 1.5px dashed var(--line);
    border-radius: 4px;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  /* A label, then its buyers on a line of their own, so three names
     never wrap into a second line and the box never changes height */
  ticket-race .seller .list {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: .3rem;
    height: 1.6rem;
    margin-top: .15rem;
  }
  ticket-race .chip {
    line-height: 1.2;
    padding: .05rem .4rem;
    font-family: var(--code);
    font-size: .75rem;
    color: var(--ink);
    background: var(--tint);
    border: 1.5px solid var(--line);
    border-radius: 4px;
  }
  ticket-race .chip.paying {
    border-color: var(--brass);
  }
  ticket-race .buyers {
    display: grid;
    gap: .4rem;
    margin: .6rem 0 0;
    padding: 0;
    list-style: none;
  }
  /* Two fixed lines, what the buyer saw and how it ended, then the bar */
  ticket-race .buyer {
    margin: 0; /* not the theme's space between list items: the grid has its own */
    display: grid;
    grid-template-columns: 4.6rem 1fr;
    gap: .1rem .5rem;
    align-items: center;
    padding: .25rem 0;
    border-top: 1px solid var(--line);
    font-family: var(--type);
    font-size: .85rem;
  }
  ticket-race .buyer .who {
    grid-row: span 2;
    font-weight: 700;
  }
  ticket-race .buyer .what {
    display: grid;
    color: var(--muted);
  }
  /* A fixed line height, so an empty line is as tall as a full one */
  ticket-race .buyer .what span {
    height: 1.45em;
    line-height: 1.45;
    white-space: nowrap;
  }
  ticket-race .buyer.ok .what {
    color: var(--ink);
  }
  ticket-race .buyer.no .what {
    color: var(--brass);
  }
  ticket-race .buyer.extra .what {
    color: var(--code-error);
    font-weight: 700;
  }
  ticket-race .bar {
    grid-column: 2;
    height: .35rem;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
    visibility: hidden;
  }
  ticket-race .bar i {
    display: block;
    height: 100%;
    width: calc(var(--paid, 0) * 100%);
    background: var(--brass);
  }
  ticket-race .buyer.paying .bar {
    visibility: visible;
  }
  /* Two lines whatever it says, so the sale ending moves nothing */
  ticket-race .verdict {
    margin: .6rem 0 0;
    min-height: 3.4em;
    font-size: .95rem;
  }
  ticket-race .verdict.bad {
    color: var(--code-error);
    font-weight: 700;
  }
  @media (prefers-reduced-motion: reduce) {
    ticket-race .bar {
      display: none;
    }
  }
</style>`);

// Every buyer's sale, worked out from the seller's rules. "process" and
// "queue" take one request at a time, start to finish; "await" checks every
// request at once and takes the tickets when the payments come back.
function sell(kind) {
  const buyers = [];
  let left = TICKETS;
  if (kind === "await") {
    // Every buy() checks before any payment comes back...
    for (let i = 0; i < BUYERS; i++) buyers.push({ check: 0, saw: left });
    // ...and each takes a ticket when its payment does, whatever's left by then
    for (const b of buyers) {
      if (b.saw === 0) {
        Object.assign(b, { pays: false, done: 0 });
      } else {
        Object.assign(b, { pays: true, done: PAY, extra: left <= 0 });
        left -= 1;
      }
    }
  } else {
    let t = 0;
    for (let i = 0; i < BUYERS; i++) {
      const b = { check: t, saw: left };
      if (left === 0) {
        Object.assign(b, { pays: false, done: t });
      } else {
        t += PAY;
        left -= 1;
        Object.assign(b, { pays: true, done: t, extra: false });
      }
      buyers.push(b);
    }
  }
  return buyers;
}

// Each side's notes: the first without the queue, the second with it
const SIDES = {
  beam: {
    title: "BEAM: the seller is a process",
    notes: ["Each request is a message in its mailbox, and it handles one at a time."],
    paying: "waiting for the payment from",
    waiting: "in its mailbox",
    kind: () => "process",
  },
  node: {
    title: "Node: the seller is an object",
    notes: [
      "Its async buy() checks, awaits the payment, then takes a ticket.",
      "Its async buy() checks, awaits the payment, then takes a ticket. A queue makes each buy() wait for the one before.",
    ],
    paying: "awaiting the payment from",
    waiting: "in the queue",
    kind: (queued) => (queued ? "queue" : "await"),
  },
};

const buyerName = (i) => `buyer ${i + 1}`;
const chips = (list, cls = "") => list.length ? list.map((i) => `<span class="chip ${cls}">${buyerName(i)}</span>`).join("") : "<span>nobody</span>";

customElements.define("ticket-race", class extends HTMLElement {
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    const id = `ticket-race-${++ids}`;

    const side = (key) => `
      <section class="side" data-side="${key}" aria-labelledby="${id}-${key}">
        <h3 class="side-title" id="${id}-${key}">${SIDES[key].title}</h3>
        <p class="side-note">${SIDES[key].notes.map((n) => `<span>${n}</span>`).join("")}</p>
        <p class="left"><span>tickets left</span><output></output></p>
        <div class="seller">
          <div class="paying-line"><span>${SIDES[key].paying}</span><span class="list"></span></div>
          <div class="waiting-line"><span>${SIDES[key].waiting}</span><span class="list"></span></div>
        </div>
        <ol class="buyers">
          ${Array.from({ length: BUYERS }, (_, i) => `
            <li class="buyer"><span class="who">${buyerName(i)}</span><span class="what"><span class="saw"></span><span class="then"></span></span><span class="bar" aria-hidden="true"><i></i></span></li>`).join("")}
        </ol>
        <p class="verdict" role="status"></p>
      </section>`;

    this.innerHTML = `
      <p class="intro-title">Three buyers, two tickets</p>
      <p class="intro-text">Three people try to buy the last two tickets at the same moment, and each sale has to wait 100 ms for a card payment before it takes a ticket. Here's the same seller in the BEAM and in Node.</p>
      <div class="controls">
        <button type="button" class="go">Three buyers at once</button>
        <button type="button" class="queue" aria-pressed="false">Node with a queue</button>
        <span class="clock">time <output></output></span>
      </div>
      <p class="note">A simulation of <a href="wait-inside.exs">wait-inside.exs</a> and <a href="wait-inside.mjs">wait-inside.mjs</a>, slowed down: a 100 ms payment takes a second and a half here.</p>
      <div class="sides">${side("beam")}${side("node")}</div>`;

    this.$ = (selector) => this.querySelector(selector);
    this.queued = false;
    this.t = null; // simulated ms since the buyers asked; null before the first sale
    this.visible = false;

    this.$(".go").addEventListener("click", () => this.start());
    this.$(".queue").addEventListener("click", (e) => {
      this.queued = !this.queued;
      e.currentTarget.setAttribute("aria-pressed", String(this.queued));
      this.stop();
      this.t = null;
      this.plan();
      this.render();
    });

    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.loop();
    });
    this.observer.observe(this);

    this.plan();
    this.render();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.stop();
  }

  plan() {
    this.sales = Object.fromEntries(Object.entries(SIDES).map(([key, s]) => [key, sell(s.kind(this.queued))]));
    this.end = Math.max(...Object.values(this.sales).flat().map((b) => b.done)) + HOLD;
  }

  start() {
    this.stop();
    this.t = 0;
    this.running = true;
    this.render();
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  // The sale only moves while it's on screen, so scrolling away and back
  // picks up where it was rather than skipping ahead
  loop() {
    if (this.running && this.visible && !this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((now) => this.tick(now));
    }
  }

  tick(now) {
    this.frame = null;
    if (!this.running || !this.visible) return;
    const elapsed = Math.min(100, Math.max(0, now - this.last));
    this.last = now;
    this.t = Math.min(this.end, this.t + elapsed / SLOW);
    if (this.t >= this.end) this.running = false;
    this.render();
    this.loop();
  }

  render() {
    const t = this.t;
    this.text(".clock output", t === null ? "–" : `${Math.round(Math.min(t, this.end - HOLD))} ms`);
    for (const [key, s] of Object.entries(SIDES)) {
      const el = this.$(`[data-side="${key}"]`);
      const buyers = this.sales[key];
      const notes = el.querySelectorAll(".side-note > span");
      notes.forEach((n, i) => {
        const on = i === Math.min(notes.length - 1, this.queued ? 1 : 0);
        n.classList.toggle("on", on);
        n.setAttribute("aria-hidden", String(!on));
      });

      const sold = t === null ? 0 : buyers.filter((b) => b.pays && b.done <= t).length;
      const left = TICKETS - sold;
      el.querySelector(".left").classList.toggle("oversold", left < 0);
      this.set(el.querySelector(".left output"), String(left).replace("-", "−"));

      const paying = t === null ? [] : buyers.flatMap((b, i) => (b.pays && b.check <= t && t < b.done ? [i] : []));
      const waiting = t === null ? [] : buyers.flatMap((b, i) => (t < b.check ? [i] : []));
      this.html(el.querySelector(".paying-line .list"), chips(paying, "paying"));
      this.html(el.querySelector(".waiting-line .list"), chips(waiting));

      buyers.forEach((b, i) => {
        const row = el.querySelectorAll(".buyer")[i];
        let saw, then, state;
        if (t === null) {
          [saw, then] = ["about to ask", ""];
        } else if (t < b.check) {
          [saw, then] = ["asked", key === "beam" ? "waiting in the mailbox" : "waiting in the queue"];
        } else if (t < b.done) {
          [saw, then, state] = [`saw ${b.saw} left`, "paying…", "paying"];
        } else if (b.pays) {
          [saw, then, state] = [`saw ${b.saw} left`, `got a ticket at ${b.done} ms`, b.extra ? "extra" : "ok"];
        } else {
          [saw, then, state] = [`saw ${b.saw} left`, `sold out at ${b.done} ms`, "no"];
        }
        this.set(row.querySelector(".saw"), saw);
        this.set(row.querySelector(".then"), then);
        for (const c of ["paying", "ok", "no", "extra"]) row.classList.toggle(c, c === state);
        const paid = b.pays && t !== null ? Math.max(0, Math.min(1, (t - b.check) / PAY)) : 0;
        row.querySelector(".bar i").style.setProperty("--paid", paid.toFixed(3));
      });

      const done = t !== null && t >= this.end - HOLD;
      const verdict = el.querySelector(".verdict");
      const turnedAway = buyers.filter((b) => !b.pays).length;
      this.set(verdict, !done ? (t === null ? "" : "Selling…")
        : left < 0 ? `${sold} tickets sold, and there were only ${TICKETS}.`
        : `${sold} tickets sold, and ${turnedAway === 1 ? "one buyer was" : `${turnedAway} buyers were`} told they're sold out.`);
      verdict.classList.toggle("bad", done && left < 0);
    }
  }

  set(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  html(el, html) {
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  text(selector, text) {
    this.set(this.$(selector), text);
  }
});
