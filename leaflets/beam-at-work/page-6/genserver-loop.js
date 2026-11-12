// <genserver-loop>: page 6's first widget. A GenServer's state going round
// its loop, one message at a time. On the left, the reader sends the ticket
// server messages (buy a ticket, what's left?, add 2 tickets: the callbacks
// on the page just above) and sees the last turn's callback and what it
// returned. On the right, the state, large: each message takes a copy of the
// current state down a step, labelled with what happened to it, and it lands
// as the next state, changed or not. So a buy drops 2 and lands as 1, and
// "what's left?" drops 1 and lands as 1.
//
// No mailbox, no clients, no timing; the full process is the page's second
// widget, <genserver-state>. The state column has a fixed height and keeps
// the newest states at the bottom, fading the oldest out at the top, so the
// page doesn't grow as messages are sent.
//
// The fallback inside the element (what feed readers and no-JS visitors
// see) is a text version of the same sequence. Under reduced motion the new
// state appears in place, without the drop.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const START = 2; // tickets at start, as in genserver.exs
const ADD = 2; // tickets a cast adds
const KEPT = 6; // states kept in the column; the box shows the last few
const DROP = 450; // ms for a state to drop a step

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const atom = (a) => `<span class="a">${a}</span>`;
const num = (n) => `<span class="n">${n}</span>`;
const st = (v) => `<span class="sv">${escape(v)}</span>`;

const MESSAGES = {
  buy: { label: "buy a ticket", code: "call :buy" },
  left: { label: "what's left?", code: "call :left" },
  add: { label: `add ${ADD} tickets`, code: `cast {:add, ${ADD}}` },
};

// One turn of the loop, given the state it starts with
const turn = (request, left) => {
  if (request === "init") {
    return {
      label: "init", change: "the first state",
      callback: `init(${num(START)})`,
      returns: `{${atom(":ok")}, ${st(START)}}`,
      outcome: "the server is up",
      next: START,
    };
  }
  if (request === "buy") {
    const ok = left > 0;
    const next = ok ? left - 1 : 0;
    return {
      label: MESSAGES.buy.label, change: ok ? "−1" : "sold out, same",
      callback: `handle_call(${atom(":buy")}, from, ${st(left)})`,
      returns: `{${atom(":reply")}, ${atom(ok ? ":ok" : ":sold_out")}, ${st(next)}}`,
      outcome: `the caller gets ${ok ? ":ok" : ":sold_out"}`,
      next,
    };
  }
  if (request === "left") {
    return {
      label: MESSAGES.left.label, change: "same",
      callback: `handle_call(${atom(":left")}, from, ${st(left)})`,
      returns: `{${atom(":reply")}, ${num(left)}, ${st(left)}}`,
      outcome: `the caller gets ${left}`,
      next: left,
    };
  }
  return {
    label: MESSAGES.add.label, change: `+${ADD}`,
    callback: `handle_cast({${atom(":add")}, ${num(ADD)}}, ${st(left)})`,
    returns: `{${atom(":noreply")}, ${st(left + ADD)}}`,
    outcome: "no reply: nobody waits for a cast",
    next: left + ADD,
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
    container: genserver-loop / inline-size;
  }
  genserver-loop .parts {
    display: grid;
    gap: 1rem;
  }
  /* Wide enough: the messages on the left, the state on the right */
  @container genserver-loop (min-width: 32rem) {
    genserver-loop .parts {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }
  genserver-loop .heading {
    display: block;
    margin: 0 0 .4rem;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  genserver-loop .messages {
    display: grid;
    gap: .5rem;
  }
  genserver-loop button {
    min-height: 44px;
    padding: .35rem .8rem;
    font: inherit;
    font-family: var(--type);
    font-size: .95rem;
    text-align: left;
    color: var(--ink);
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  genserver-loop button small {
    display: block;
    font-family: var(--code);
    font-size: .72rem;
    color: var(--muted);
  }
  genserver-loop button.again {
    justify-self: start;
    font-size: .9rem;
  }
  genserver-loop button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  genserver-loop .last {
    display: grid;
    gap: .15rem;
    margin-top: .75rem;
    padding: .45rem .6rem;
    min-height: 6.2rem;
    border: 1.5px dashed var(--line);
    border-radius: 4px;
    font-family: var(--code);
    font-size: .75rem;
    overflow-wrap: break-word;
  }
  genserver-loop .last .word {
    font-family: var(--type);
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
  genserver-loop .tape {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    height: 19rem;
    padding-bottom: .75rem;
    overflow: hidden;
    border: 1.5px solid var(--line);
    border-radius: 4px;
    /* the oldest states fade out at the top */
    mask-image: linear-gradient(to bottom, transparent, #000 30%);
  }
  genserver-loop .entry {
    display: grid;
    justify-items: center;
    flex: none;
  }
  genserver-loop .step {
    padding: .25rem 0;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
    text-align: center;
  }
  genserver-loop .step::before {
    content: "↓ ";
    color: var(--brass);
  }
  genserver-loop .step b {
    color: var(--ink);
  }
  genserver-loop .value {
    min-width: 2.2ch;
    padding: .05em .35em;
    border-radius: 6px;
    font-family: var(--code);
    font-size: 2.6rem;
    font-weight: 700;
    line-height: 1.15;
    text-align: center;
    font-variant-numeric: tabular-nums;
    color: var(--bg);
    background: var(--brass);
    opacity: .55;
    transition: opacity .3s, box-shadow .4s;
  }
  genserver-loop .entry.current .value {
    opacity: 1;
  }
  genserver-loop .value.changed {
    box-shadow: 0 0 0 6px var(--selection);
  }
  genserver-loop .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* Narrow: the state goes under the messages, so keep it short enough to
     see the newest state while pressing them */
  @container genserver-loop not (min-width: 32rem) {
    genserver-loop .tape {
      height: 14rem;
    }
    genserver-loop .last {
      min-height: 7rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    genserver-loop .value {
      transition: none;
    }
  }
</style>`);

customElements.define("genserver-loop", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;

    this.innerHTML = `
      <div class="parts">
        <div>
          <span class="heading">Send the server a message</span>
          <div class="messages">
            ${Object.entries(MESSAGES).map(([request, m]) => `
              <button type="button" data-request="${request}">${m.label}<small>${m.code}</small></button>`).join("")}
            <button type="button" class="again">Start again</button>
          </div>
          <div class="last" aria-hidden="true"></div>
        </div>
        <div>
          <span class="heading">Its state, newest at the bottom</span>
          <div class="tape" role="list" aria-label="The server's states, oldest first"></div>
        </div>
      </div>
      <p class="sr" aria-live="polite"></p>`;

    this.tape = this.querySelector(".tape");
    this.last = this.querySelector(".last");
    this.live = this.querySelector(".sr");
    this.querySelectorAll("[data-request]").forEach((button) =>
      button.addEventListener("click", () => this.send(button.dataset.request)));
    this.querySelector(".again").addEventListener("click", () => this.reset());
    this.reset();
  }

  reset() {
    this.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    this.tape.innerHTML = "";
    this.state = null;
    this.send("init", true);
  }

  send(request, quiet = false) {
    const t = turn(request, this.state);
    const before = this.state;
    this.state = t.next;

    // The last turn, in code, on the left
    this.last.innerHTML = `
      <span>${t.callback}</span>
      <span><span class="word">returns</span> ${t.returns}</span>
      <span class="word">${escape(t.outcome)}</span>`;

    // Where everything in the column was, to slide it up from there
    const entries = [...this.tape.children];
    const was = new Map(entries.map((el) => [el, el.getBoundingClientRect().top]));
    const previous = entries.at(-1)?.querySelector(".value");
    const from = previous?.getBoundingClientRect();
    entries.forEach((el) => el.classList.remove("current"));

    // The new state: a copy of the old one, dropped a step, landing as the next
    const entry = document.createElement("div");
    entry.className = "entry current";
    entry.setAttribute("role", "listitem");
    entry.innerHTML = `
      ${before === null ? "" : `<span class="step"><b>${escape(t.label)}</b>: ${escape(t.change)}</span>`}
      <span class="value">${escape(before ?? t.next)}</span>`;
    this.tape.append(entry);
    while (this.tape.children.length > KEPT) this.tape.firstElementChild.remove();

    const value = entry.querySelector(".value");
    const land = () => {
      value.textContent = t.next;
      if (before !== null && before !== t.next) {
        value.classList.add("changed");
        setTimeout(() => value.classList.remove("changed"), 700);
      }
    };

    if (reducedMotion.matches || !from) {
      land();
    } else {
      for (const [el, top] of was) {
        if (!el.isConnected) continue;
        const dy = top - el.getBoundingClientRect().top;
        if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: DROP, easing: "ease-out" });
      }
      const to = value.getBoundingClientRect();
      entry.querySelector(".step")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DROP, easing: "ease-in" });
      const drop = value.animate(
        [{ transform: `translateY(${from.top - to.top}px)` }, { transform: "none" }],
        { duration: DROP, easing: "cubic-bezier(.5, 0, .75, 1)" },
      );
      drop.onfinish = land;
      drop.oncancel = land;
    }

    if (!quiet) {
      this.live.textContent = before === t.next
        ? `${t.label}: the state stays ${t.next}`
        : `${t.label}: the state goes from ${before} to ${t.next}`;
    }
  }
});
