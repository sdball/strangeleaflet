// <two-machines>: page 6's opening widget. down.exs and remote.mjs, side by
// side: a program on machine a keeps a count on machine b, and then
// something happens to b. The question is when a finds out.
//
// - Close the connection: both find out at once (the BEAM's :nodedown and
//   :DOWN with :noconnection; Node's 'close' event).
// - Freeze b (down.exs's kill -STOP, which looks to a just like a hung
//   machine or a pulled cable): nothing arrives and nothing closes. The
//   BEAM's nodes send each other a tick whenever a connection has been
//   quiet, and a takes b to be down once it has heard nothing for about the
//   net tick time. Here that's 4 seconds, as in down.exs (4.7 s there; the
//   docs give 3/4 to 5/4 of it), modelled as checks every T/4 with b's ticks
//   arriving between them, giving up at 4 quiet checks in a row. Node's
//   socket has no timeout by default, so a never finds out. "Node with a
//   timeout" is socket.setTimeout(4000) and code of your own that acts on
//   its 'timeout' event.
// - Shut b down: both find out at once, since the operating system closes
//   the connection.
//
// It runs in real time, and only while on screen. It holds a static fallback
// (what feed readers and no-JS visitors see) and replaces it once this module
// runs. Nothing moves but numbers and words, so reduced motion changes
// nothing.

const T = 4000; // ms: the net tick time, as in down.exs
const CHECK = T / 4; // ms between a's checks of the connection
const QUIET = 4; // quiet checks in a row before a gives up on b
const NODE_TIMEOUT = 4000; // ms: socket.setTimeout, for "Node with a timeout"

let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  two-machines:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: two-machines / inline-size;
  }
  two-machines .intro-title {
    margin: 0;
    font-family: var(--type);
    font-size: 1.1rem;
    font-weight: 700;
  }
  two-machines .intro-text {
    margin: .3rem 0 0;
    font-size: .95rem;
  }
  two-machines .controls {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
    margin-top: .75rem;
  }
  two-machines button {
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
  two-machines button.what {
    border-color: var(--brass);
    font-weight: 700;
  }
  two-machines button[aria-pressed=true] {
    border-color: var(--brass);
    background: var(--tint);
  }
  two-machines button:disabled {
    cursor: default;
    opacity: .5;
  }
  two-machines button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  two-machines .note {
    margin: .6rem 0 0;
    font-size: .9rem;
    color: var(--muted);
  }
  two-machines .side {
    margin-top: 1.25rem;
    padding-top: .75rem;
    border-top: 1.5px solid var(--line);
    min-width: 0;
  }
  /* Wide enough: the two side by side, rows lined up */
  @container two-machines (min-width: 38rem) {
    two-machines .sides {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 1.25rem;
    }
    two-machines .side {
      display: grid;
      grid-template-rows: subgrid;
      grid-row: span 5;
      align-content: start;
    }
  }
  two-machines .side-title {
    margin: 0;
    font-family: var(--type);
    font-size: 1rem;
    font-weight: 700;
  }
  /* Every note a side can have, stacked in one spot sized to the longest */
  two-machines .side-note {
    display: grid;
    margin: .15rem 0 0;
    font-size: .85rem;
    color: var(--muted);
  }
  two-machines .side-note > span {
    grid-area: 1 / 1;
    visibility: hidden;
  }
  two-machines .side-note > span.on {
    visibility: visible;
  }
  /* a, the link between them, and b */
  two-machines .machines {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: .4rem;
    margin-top: .7rem;
    font-family: var(--type);
    font-size: .8rem;
  }
  two-machines .machine {
    display: grid;
    min-width: 5.5rem;
    padding: .3rem .5rem;
    border: 1.5px solid var(--line);
    border-radius: 4px;
    text-align: center;
  }
  two-machines .machine .name {
    font-weight: 700;
  }
  two-machines .machine .state {
    color: var(--muted);
  }
  two-machines .b.frozen {
    border-color: var(--link);
    border-style: dashed;
  }
  two-machines .b.off {
    border-color: var(--code-error);
    border-style: dashed;
  }
  two-machines .link {
    position: relative;
    height: 1.4rem;
    text-align: center;
    color: var(--muted);
    font-size: .7rem;
  }
  two-machines .link::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    border-top: 2px solid var(--ink);
  }
  two-machines .link.closed::before {
    border-top: 2px dashed var(--line);
  }
  two-machines .link span {
    position: relative;
    padding: 0 .3rem;
    background: var(--bg);
  }
  /* The headline: what a thinks of b */
  two-machines .view {
    display: grid;
    margin: .7rem 0 0;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  two-machines .view output {
    font-size: 1.3rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  two-machines .view.down output {
    color: var(--code-error);
  }
  two-machines .verdict {
    margin: .5rem 0 0;
    min-height: 4.9em;
    font-size: .95rem;
    font-variant-numeric: tabular-nums;
  }
</style>`);

const SIDES = {
  beam: {
    title: "BEAM: two nodes",
    notes: ["a watches a counter on b with a monitor."],
  },
  node: {
    title: "Node: two processes and a socket",
    notes: [
      "a talks to a counter on b over TCP.",
      "a talks to a counter on b over TCP, with a timeout on the socket.",
    ],
  },
};

const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

// When a gives up on a b that froze at `at`, in the BEAM: b's last tick
// arrived halfway between two checks; the check after it saw it, and the
// next QUIET checks see nothing.
const beamGivesUp = (at) => {
  const lastTick = Math.floor((at - CHECK / 2) / CHECK) * CHECK + CHECK / 2;
  return Math.ceil(lastTick / CHECK) * CHECK + QUIET * CHECK;
};

customElements.define("two-machines", class extends HTMLElement {
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    const id = `two-machines-${++ids}`;

    const side = (key) => `
      <section class="side" data-side="${key}" aria-labelledby="${id}-${key}">
        <h3 class="side-title" id="${id}-${key}">${SIDES[key].title}</h3>
        <p class="side-note">${SIDES[key].notes.map((n) => `<span>${n}</span>`).join("")}</p>
        <div class="machines" aria-hidden="true">
          <span class="machine a"><span class="name">a</span><span class="state">running</span></span>
          <span class="link"><span></span></span>
          <span class="machine b"><span class="name">b</span><span class="state"></span></span>
        </div>
        <p class="view"><span>a thinks b is</span><output></output></p>
        <p class="verdict" role="status"></p>
      </section>`;

    this.innerHTML = `
      <p class="intro-title">Is the other machine still there?</p>
      <p class="intro-text">A program on machine a keeps a count on machine b. Then something happens to b. Here's when a finds out, in the BEAM and in Node.</p>
      <div class="controls">
        <button type="button" class="what" data-what="close">Close the connection</button>
        <button type="button" class="what" data-what="freeze">Freeze b</button>
        <button type="button" class="what" data-what="off">Shut b down</button>
        <button type="button" class="reset">Reset</button>
        <button type="button" class="timeout" aria-pressed="false">Node with a timeout</button>
      </div>
      <p class="note">A simulation of <a href="down.exs">down.exs</a> and <a href="remote.mjs">remote.mjs</a>, in real time. To the other machine, a frozen one looks the same as a hung one or a pulled network cable. The BEAM's net tick time is 4 seconds here, as in down.exs; the default is 60, which takes 45 to 75 seconds to notice.</p>
      <div class="sides">${side("beam")}${side("node")}</div>`;

    this.$ = (selector) => this.querySelector(selector);
    this.timeout = false;
    this.clock = 0; // ms, only while on screen
    this.reset();

    this.querySelectorAll("button.what").forEach((b) => b.addEventListener("click", () => this.happen(b.dataset.what)));
    this.$(".reset").addEventListener("click", () => this.reset());
    this.$(".timeout").addEventListener("click", (e) => {
      this.timeout = !this.timeout;
      e.currentTarget.setAttribute("aria-pressed", String(this.timeout));
      this.reset();
    });

    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.loop();
    });
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  reset() {
    this.what = null;
    this.at = null;
    this.querySelectorAll("button.what").forEach((b) => (b.disabled = false));
    this.render();
  }

  // One thing happens to b, on both sides at once
  happen(what) {
    this.what = what;
    this.at = this.clock;
    this.querySelectorAll("button.what").forEach((b) => (b.disabled = true));
    this.render();
  }

  // When each side's a takes b to be down, or Infinity for never
  foundOut() {
    if (this.what === null) return { beam: Infinity, node: Infinity };
    if (this.what !== "freeze") return { beam: this.at, node: this.at };
    return { beam: beamGivesUp(this.at), node: this.timeout ? this.at + NODE_TIMEOUT : Infinity };
  }

  loop() {
    if (this.visible && !this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((now) => this.tick(now));
    }
  }

  tick(now) {
    this.frame = null;
    if (!this.visible) return;
    this.clock += Math.min(100, Math.max(0, now - this.last));
    this.last = now;
    this.render();
    this.loop();
  }

  render() {
    const { what, at, clock } = this;
    const found = this.foundOut();
    for (const key of Object.keys(SIDES)) {
      const el = this.$(`[data-side="${key}"]`);
      const notes = el.querySelectorAll(".side-note > span");
      notes.forEach((n, i) => {
        const on = i === Math.min(notes.length - 1, this.timeout ? 1 : 0);
        n.classList.toggle("on", on);
        n.setAttribute("aria-hidden", String(!on));
      });

      const b = el.querySelector(".b");
      b.classList.toggle("frozen", what === "freeze");
      b.classList.toggle("off", what === "off");
      this.set(b.querySelector(".state"), what === "freeze" ? "frozen" : what === "off" ? "shut down" : "running");
      const knows = clock >= found[key];

      // A BEAM node that gives up on another drops the connection ("Removing
      // (timedout) connection" in down.exs). Node's timeout doesn't: "the
      // connection will not be severed".
      const link = el.querySelector(".link");
      const dropped = key === "beam" && what === "freeze" && knows;
      const closed = what === "close" || what === "off" || dropped;
      link.classList.toggle("closed", closed);
      this.set(link.querySelector("span"), dropped ? "dropped by a" : closed ? "closed" : key === "beam" ? "connected" : "socket open");
      const view = el.querySelector(".view");
      view.classList.toggle("down", knows);
      this.set(view.querySelector("output"), knows ? "down" : "up");

      const waited = at === null ? 0 : clock - at;
      let verdict = "";
      if (what === "close") {
        verdict = key === "beam" ? "The connection closed, and a knew at once: :nodedown, and :DOWN with :noconnection." : "The socket closed, and a knew at once: a 'close' event.";
      } else if (what === "off") {
        verdict = key === "beam" ? "b's operating system closed its connections, so a knew at once." : "b's operating system closed the socket, so a knew at once.";
      } else if (what === "freeze") {
        if (knows) {
          verdict = key === "beam" ? `a heard nothing from b, not even a tick, and gave up on it after ${secs(found.beam - at)}. b is only frozen, but a can't tell.`
            : `a's timeout went off after ${secs(NODE_TIMEOUT)} of quiet. What to do now is up to a's code.`;
        } else {
          verdict = key === "beam" ? `b has gone quiet. a has heard nothing for ${secs(waited)}.`
            : `b has gone quiet, and nothing tells a. Nothing for ${secs(waited)}, and counting.`;
        }
      }
      this.set(el.querySelector(".verdict"), verdict);
    }
  }

  set(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }
});
