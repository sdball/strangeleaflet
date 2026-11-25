// <one-bad-message>: page 5's opening widget. alone.exs and uncaught.mjs,
// scaled up: twelve connections to a server, each counting the messages
// it has handled, in the BEAM and in Node side by side. Then one message
// hits a bug that nothing catches.
//
// In the BEAM each connection is a process, and an error nobody catches
// ends that process only: its count stops, the other eleven carry on, and
// nothing notices (alone.exs; links and monitors, further down the page,
// are how something can). In Node every connection is callbacks in one
// process, and an uncaught exception ends the process by default, so every
// connection goes with it (uncaught.mjs; Node's docs: it prints the stack
// trace "and exiting with code 1"). There's no restart button on either
// side: the page's prose covers restarting, and Reset puts both back.
//
// It's a model of that one rule, not of either runtime's timing: each
// connection handles a message every second or two, on the same schedule on
// both sides. It holds a static fallback (what feed readers and no-JS
// visitors see) and replaces it once this module runs. Readers who prefer
// reduced motion don't get the flash as a message is handled; the counts
// still go up.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const PEOPLE = 12;
// Who the bad message comes from, press after press: the same person on
// both sides, spread around the grid
const ORDER = [5, 9, 2, 11, 7, 0, 4, 10, 1, 8, 3, 6];
// Each connection handles a message every PERIOD ms, give or take, starting
// at a different moment, so the grid looks like a server and not a clock
const period = (i) => 1100 + ((i * 337) % 900);
const phase = (i) => (i * 523) % period(i);

let ids = 0;

document.head.insertAdjacentHTML("beforeend", `<style>
  one-bad-message:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: one-bad-message / inline-size;
  }
  one-bad-message .intro-title {
    margin: 0;
    font-family: var(--type);
    font-size: 1.1rem;
    font-weight: 700;
  }
  one-bad-message .intro-text {
    margin: .3rem 0 0;
    font-size: .95rem;
  }
  one-bad-message .controls {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
    margin-top: .75rem;
  }
  one-bad-message button {
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
  one-bad-message button.bad {
    border-color: var(--brass);
    font-weight: 700;
  }
  one-bad-message button:disabled {
    cursor: default;
    opacity: .5;
  }
  one-bad-message button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  one-bad-message .note {
    margin: .6rem 0 0;
    font-size: .9rem;
    color: var(--muted);
  }
  one-bad-message .side {
    margin-top: 1.25rem;
    padding-top: .75rem;
    border-top: 1.5px solid var(--line);
    min-width: 0;
  }
  /* Wide enough: the two servers side by side, rows lined up */
  @container one-bad-message (min-width: 38rem) {
    one-bad-message .sides {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 1.25rem;
    }
    one-bad-message .side {
      display: grid;
      grid-template-rows: subgrid;
      grid-row: span 5;
      align-content: start;
    }
  }
  one-bad-message .side-title {
    margin: 0;
    font-family: var(--type);
    font-size: 1rem;
    font-weight: 700;
  }
  one-bad-message .side-note {
    margin: .15rem 0 0;
    font-size: .85rem;
    color: var(--muted);
  }
  /* The headline: how many are still connected */
  one-bad-message .connected {
    display: grid;
    margin: .6rem 0 0;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  one-bad-message .connected output {
    font-size: 1.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  one-bad-message .connected.none output {
    color: var(--code-error);
  }
  one-bad-message .people {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: .35rem;
    margin: .6rem 0 0;
    padding: 0;
    list-style: none;
  }
  one-bad-message .person {
    margin: 0; /* not the theme's space between list items: the grid has its own */
    display: grid;
    padding: .25rem .35rem;
    font-family: var(--type);
    font-size: .75rem;
    color: var(--muted);
    border: 1.5px solid var(--line);
    border-radius: 4px;
    transition: border-color .4s;
  }
  one-bad-message .person .count {
    font-size: 1.05rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  one-bad-message .person.flash {
    border-color: var(--brass);
    transition: none;
  }
  one-bad-message .person.gone {
    border-style: dashed;
    border-color: var(--code-error);
    background: color-mix(in srgb, var(--code-error) 8%, transparent);
  }
  one-bad-message .person.gone .count {
    color: var(--code-error);
  }
  /* The person whose message hit the bug: a heavier line drawn inside the
     border, so the tile doesn't change size */
  one-bad-message .person.hit {
    border-style: solid;
    box-shadow: inset 0 0 0 1.5px var(--code-error);
  }
  one-bad-message .verdict {
    margin: .6rem 0 0;
    min-height: 3.4em;
    font-size: .95rem;
  }
  one-bad-message .verdict.bad {
    color: var(--code-error);
    font-weight: 700;
  }
  @media (prefers-reduced-motion: reduce) {
    one-bad-message .person,
    one-bad-message .person.flash {
      transition: none;
      border-color: var(--line);
    }
  }
</style>`);

// How many messages a connection has handled after being up for `ms`
const handled = (i, ms) => (ms < phase(i) ? 0 : Math.floor((ms - phase(i)) / period(i)) + 1);

const SIDES = {
  beam: {
    title: "BEAM: 12 processes, 1 per connection",
    note: "The bug ends the process it happens in.",
  },
  node: {
    title: "Node: 1 process for all 12 connections",
    note: "An error nothing catches ends the process, by default.",
  },
};

customElements.define("one-bad-message", class extends HTMLElement {
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    const id = `one-bad-message-${++ids}`;

    const side = (key) => `
      <section class="side" data-side="${key}" aria-labelledby="${id}-${key}">
        <h3 class="side-title" id="${id}-${key}">${SIDES[key].title}</h3>
        <p class="side-note">${SIDES[key].note}</p>
        <p class="connected"><span>still connected</span><output></output></p>
        <ol class="people">
          ${Array.from({ length: PEOPLE }, (_, i) => `
            <li class="person"><span class="name">#${i + 1}</span><span class="count">0</span></li>`).join("")}
        </ol>
        <p class="verdict" role="status"></p>
      </section>`;

    this.innerHTML = `
      <p class="intro-title">One bad message</p>
      <p class="intro-text">Twelve people are connected to a server, and each connection counts the messages it has handled. Then someone sends a message that hits a bug, an error that nothing catches. Here's the same server in the BEAM and in Node.</p>
      <div class="controls">
        <button type="button" class="bad">Send a message that hits a bug</button>
        <button type="button" class="reset">Reset</button>
      </div>
      <p class="note">A simulation of the rule in <a href="alone.exs">alone.exs</a> and <a href="uncaught.mjs">uncaught.mjs</a>, with twelve counters instead of three.</p>
      <div class="sides">${side("beam")}${side("node")}</div>`;

    this.$ = (selector) => this.querySelector(selector);
    this.$(".bad").addEventListener("click", () => this.bug());
    this.$(".reset").addEventListener("click", () => this.reset());

    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.loop();
    });
    this.observer.observe(this);
    this.reset();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  // Each side: when its connections came up, and for each person, when (if)
  // they were disconnected, and whose message hit the bug
  reset() {
    const now = performance.now();
    this.next = 0;
    this.sides = {
      beam: { since: now, gone: Array(PEOPLE).fill(null), hit: new Set(), down: false },
      node: { since: now, gone: Array(PEOPLE).fill(null), hit: new Set(), down: false },
    };
    this.$(".bad").disabled = false;
    this.render(now);
  }

  // The next person's message hits the bug, on both sides at once
  bug() {
    const now = performance.now();
    const { beam, node } = this.sides;
    // The next person in ORDER still connected in the BEAM; once nobody is,
    // the next in ORDER, for Node's sake
    const rotation = ORDER.slice(this.next).concat(ORDER.slice(0, this.next));
    const who = rotation.find((i) => beam.gone[i] === null) ?? rotation[0];
    if (node.down && beam.gone[who] !== null) return;
    this.next = (ORDER.indexOf(who) + 1) % PEOPLE;
    if (beam.gone[who] === null) {
      beam.gone[who] = now;
      beam.hit.add(who);
    }
    if (!node.down) {
      node.down = true;
      node.hit = new Set([who]);
      node.gone = node.gone.map((g) => g ?? now);
    }
    // Nobody left to send one
    this.$(".bad").disabled = beam.gone.every((g) => g !== null);
    this.render(now);
  }

  loop() {
    if (this.visible && !this.frame) {
      this.frame = requestAnimationFrame((now) => {
        this.frame = null;
        if (!this.visible) return;
        this.render(now);
        this.loop();
      });
    }
  }

  render(now) {
    const flashes = !reducedMotion.matches;
    for (const key of Object.keys(SIDES)) {
      const s = this.sides[key];
      const el = this.$(`[data-side="${key}"]`);
      const people = el.querySelectorAll(".person");
      let up = 0;
      people.forEach((li, i) => {
        const until = s.gone[i] ?? now;
        const count = handled(i, until - s.since);
        const gone = s.gone[i] !== null;
        if (!gone) up += 1;
        const text = String(count);
        const countEl = li.querySelector(".count");
        if (countEl.textContent !== text) {
          countEl.textContent = text;
          // A message handled: a brief flash, unless the reader prefers less motion
          if (flashes && !gone && count > 0) {
            li.classList.add("flash");
            setTimeout(() => li.classList.remove("flash"), 120);
          }
        }
        li.classList.toggle("gone", gone);
        li.classList.toggle("hit", s.hit.has(i));
        const label = `#${i + 1}: ${count} handled, ${gone ? (s.hit.has(i) ? "its message hit the bug, disconnected" : "disconnected") : "connected"}`;
        if (li.getAttribute("aria-label") !== label) li.setAttribute("aria-label", label);
      });

      const connected = el.querySelector(".connected");
      connected.classList.toggle("none", up === 0);
      this.set(connected.querySelector("output"), `${up} of ${PEOPLE}`);

      const verdict = el.querySelector(".verdict");
      const hits = [...s.hit].map((i) => `#${i + 1}`);
      let text = "";
      if (key === "beam" && hits.length) {
        // A count past one, so the line never outgrows its two lines
        const left = PEOPLE - hits.length;
        const who = hits.length === 1 ? `${hits[0]}'s process`
          : left === 0 ? `All ${PEOPLE} processes` : `${hits.length} processes`;
        const rest = left === 0 ? "" : left === 1 ? " The last one carries on." : " The rest carry on.";
        text = `${who} crashed, and nothing noticed.${rest}`;
      } else if (key === "node" && s.down) {
        text = `The process exited, and everyone went with it, not just ${hits[0]}.`;
      }
      this.set(verdict, text);
      verdict.classList.toggle("bad", key === "node" && s.down);
    }
  }

  set(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }
});
