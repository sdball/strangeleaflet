// <genserver-loop>: page 6's first widget. A GenServer's loop unrolled,
// one turn per request, to show the state going round: each callback is
// called with the state the last one returned, and returns a tuple that says
// what to do (reply or not) and what the next state is. Between turns,
// loop(N) carries that state on, the way loop(left) did in the server by
// hand.
//
// The reader starts the ticket server (init(2)) and sends it calls and
// casts: call :buy, call :left, cast {:add, 2}, the callbacks on the page
// just above. No mailbox, no clients, no timing; the full process is the
// page's second widget, <genserver-state>. The newest turn has its tuple's
// parts labelled. The last few turns are shown, in a box of fixed height,
// so the page doesn't grow as turns are added.
//
// The fallback inside the element (what feed readers and no-JS visitors
// see) is a text snapshot of the same chain. Under reduced motion new turns
// appear without fading in.

const START = 2; // tickets at start, as in genserver.exs
const ADD = 2; // tickets a cast adds
const SHOWN = 3; // turns shown; earlier ones are counted

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const atom = (a) => `<span class="a">${a}</span>`;
const num = (n) => `<span class="n">${n}</span>`;
const st = (v) => `<span class="sv">${escape(v)}</span>`; // the state, drawn the same everywhere

// One turn of the loop, given the state it starts with
const turn = (request, left) => {
  if (request === "init") {
    return {
      callback: `init(${num(START)})`,
      tag: atom(":ok"), tagLabel: "started",
      reply: null,
      next: START, nextLabel: "the first state",
      note: "the server is up",
    };
  }
  if (request === "buy") {
    const ok = left > 0;
    const next = ok ? left - 1 : 0;
    return {
      callback: `handle_call(${atom(":buy")}, from, ${st(left)})`,
      tag: atom(":reply"), tagLabel: "send a reply",
      reply: atom(ok ? ":ok" : ":sold_out"), replyLabel: "the reply",
      next, nextLabel: "the next state",
      note: `the caller gets ${ok ? ":ok" : ":sold_out"}`,
    };
  }
  if (request === "left") {
    return {
      callback: `handle_call(${atom(":left")}, from, ${st(left)})`,
      tag: atom(":reply"), tagLabel: "send a reply",
      reply: num(left), replyLabel: "the reply",
      next: left, nextLabel: "the next state",
      note: `the caller gets ${left}`,
    };
  }
  return {
    callback: `handle_cast({${atom(":add")}, ${num(ADD)}}, ${st(left)})`,
    tag: atom(":noreply"), tagLabel: "don't reply",
    reply: null,
    next: left + ADD, nextLabel: "the next state",
    note: "no reply: a cast doesn't wait for one",
  };
};

document.head.insertAdjacentHTML("beforeend", `<style>
  genserver-loop:defined {
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }
  genserver-loop .controls {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
  }
  genserver-loop button {
    min-height: 44px;
    padding: .35rem .8rem;
    font: inherit;
    font-family: var(--code);
    font-size: .8rem;
    color: var(--ink);
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  genserver-loop button.again {
    margin-left: auto;
    font-family: var(--type);
    font-size: .9rem;
  }
  genserver-loop button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  genserver-loop .chain {
    display: grid;
    align-content: end;
    gap: .35rem;
    margin-top: .9rem;
  }
  genserver-loop .earlier {
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  genserver-loop .turn {
    display: grid;
    gap: .2rem;
    padding: .45rem .6rem;
    border: 1.5px solid var(--line);
    border-radius: 4px;
    font-family: var(--code);
    font-size: .8rem;
  }
  genserver-loop .turn.fresh {
    animation: genserver-loop-in .35s ease-out;
  }
  genserver-loop .turn.newest {
    border-color: var(--brass);
  }
  genserver-loop .turn .line {
    display: block;
  }
  genserver-loop .turn .arrow,
  genserver-loop .turn .note,
  genserver-loop .turn .legend {
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  genserver-loop .turn .legend code {
    font-family: var(--code);
    color: var(--ink);
    background: none;
    padding: 0;
  }
  genserver-loop .connector {
    padding-left: 1.2rem;
    font-family: var(--code);
    font-size: .8rem;
    color: var(--muted);
  }
  genserver-loop .connector::before {
    content: "↓ ";
    color: var(--brass);
  }
  genserver-loop .connector code {
    color: var(--ink);
    background: none;
    padding: 0;
    font-size: inherit;
  }
  genserver-loop .waiting {
    padding-left: 1.2rem;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  genserver-loop .a { color: var(--code-symbol); }
  genserver-loop .n { color: var(--code-number); }
  genserver-loop .sv {
    padding: 0 .25em;
    border-radius: 3px;
    font-weight: 700;
    color: var(--bg);
    background: var(--brass);
  }
  genserver-loop .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @keyframes genserver-loop-in {
    from { opacity: 0; transform: translateY(.5rem); }
  }
  @media (prefers-reduced-motion: reduce) {
    genserver-loop .turn.fresh {
      animation: none;
    }
  }
</style>`);

customElements.define("genserver-loop", class extends HTMLElement {
  connectedCallback() {
    if (this.built) {
      this.resized?.observe(this);
      return;
    }
    this.built = true;

    this.innerHTML = `
      <div class="controls">
        <button type="button" data-request="buy">call :buy</button>
        <button type="button" data-request="left">call :left</button>
        <button type="button" data-request="add">cast {:add, ${ADD}}</button>
        <button type="button" class="again">Start again</button>
      </div>
      <div class="chain" role="list" aria-label="The server's loop, one turn per message"></div>
      <p class="sr" aria-live="polite"></p>`;

    this.chain = this.querySelector(".chain");
    this.live = this.querySelector(".sr");
    this.querySelectorAll("[data-request]").forEach((button) =>
      button.addEventListener("click", () => this.add(button.dataset.request)));
    this.querySelector(".again").addEventListener("click", () => this.reset());
    this.reset();
    this.measure();
    let width = this.offsetWidth;
    this.resized = new ResizeObserver(() => {
      if (this.offsetWidth === width) return;
      width = this.offsetWidth;
      this.measure();
    });
    this.resized.observe(this);
  }

  disconnectedCallback() {
    this.resized?.disconnect();
  }

  reset() {
    this.turns = [];
    this.state = null;
    this.add("init", true);
  }

  add(request, quiet = false) {
    const t = turn(request, this.state);
    this.turns.push(t);
    this.state = t.next;
    this.render(true);
    if (!quiet) this.live.textContent = `${t.note}; the next state is ${t.next}`;
  }

  render(fresh = false, turns = this.turns) {
    const shown = turns.slice(-SHOWN);
    const earlier = turns.length - shown.length;
    const html = shown.map((t, i) => {
      const newest = i === shown.length - 1;
      const parts = [t.tag];
      if (t.reply) parts.push(t.reply);
      parts.push(st(t.next));
      const legend = [`<code>${t.tag}</code>: ${t.tagLabel}`];
      if (t.reply) legend.push(`<code>${t.reply}</code>: ${t.replyLabel}`);
      legend.push(`${st(t.next)}: ${t.nextLabel}`);
      return `
        <div class="turn${newest ? " newest" : ""}${newest && fresh ? " fresh" : ""}" role="listitem">
          <span class="line">${t.callback}</span>
          <span class="line"><span class="arrow">returns</span> {${parts.join(", ")}}</span>
          ${newest ? `<span class="legend">${legend.join(" · ")}</span>` : ""}
          <span class="note">${escape(t.note)}</span>
        </div>
        <div class="connector"><code>loop(${st(t.next)})</code> waits for the next message with ${st(t.next)} as its state</div>`;
    });
    this.chain.innerHTML =
      (earlier ? `<div class="earlier">${earlier} earlier ${earlier === 1 ? "turn" : "turns"} not shown</div>` : "")
      + html.join("");
  }

  // The chain's height when it's full: the tallest of every combination of
  // SHOWN kinds of turn (a sold-out buy, a buy, :left, a cast reaching two
  // digits) after an earlier one, measured at the current width, so the page
  // doesn't move as turns are added
  measure() {
    const kinds = [["buy", 0], ["buy", 5], ["left", 5], ["add", 9]];
    const combinations = (n) => (n === 0 ? [[]] : combinations(n - 1).flatMap((c) => kinds.map((k) => [...c, k])));
    this.chain.style.minHeight = "";
    let tallest = 0;
    for (const combination of combinations(SHOWN)) {
      this.render(false, [turn("init", null), ...combination.map(([request, left]) => turn(request, left))]);
      tallest = Math.max(tallest, this.chain.offsetHeight);
    }
    this.chain.style.minHeight = `${tallest}px`;
    this.render();
  }
});
