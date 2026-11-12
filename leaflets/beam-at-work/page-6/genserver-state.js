// <genserver-state>: page 6's widget. The ticket server from state.exs,
// started and sent requests by the reader, one step at a time, to show where
// a GenServer's state lives: nowhere but in the loop. init returns the first
// state; each callback gets the current state as its last argument and
// returns the next one, and the loop goes round again with it.
//
// The reader is a client that can call {:buy, n} or :left, or cast
// {:add, n}. The module itself is on the page above the widget. A request flies to the server's mailbox in the form GenServer
// really sends it ({:"$gen_call", from, request} or {:"$gen_cast", request}),
// and waits there until the server takes it. Then four steps: receive; the
// clause that matches, with what its variables are bound to (the state among
// them); what its body returns; and the reply (which flies back, for a call)
// and the new state. While a call waits for
// its reply the client can't send anything, because a caller is blocked in
// receive; casts return at once, so several can wait in the mailbox. The
// state is drawn in brass wherever it appears, so it can be followed around
// the loop: at the last step it flies up into the state box, which changes
// when it lands, and every state so far is listed under the server.
//
// It's a simulation of state.exs, whose :sys.trace output shows the same
// states. It holds a static fallback (what feed readers and no-JS visitors
// see) and replaces it once this module runs. The rows of steps are always
// there, so the layout doesn't shift as text changes. Under reduced motion,
// requests and replies don't fly and highlights don't fade; the steps still
// go one at a time, and Pause and Step work as usual.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Milliseconds between steps
const SPEEDS = { slow: 2200, normal: 1300, fast: 600 };
const START = 3; // tickets at start, as in state.exs
const AMOUNTS = [1, 2, 3];
const SHOWN = 3; // messages shown in the mailbox; the rest are counted

// Each clause of the module (the whole module is on the page above the
// widget): its head and its body, as written.
const CLAUSES = {
  init: { head: "def init(left) do", body: "{:ok, left}" },
  buy: { head: "def handle_call({:buy, n}, _from, left) when n <= left do", body: "{:reply, :ok, left - n}" },
  "sold-out": { head: "def handle_call({:buy, _n}, _from, left) do", body: "{:reply, :sold_out, left}" },
  left: { head: "def handle_call(:left, _from, left) do", body: "{:reply, left, left}" },
  add: { head: "def handle_cast({:add, n}, left) do", body: "{:noreply, left + n}" },
};

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Just enough highlighting for this module, in the theme's code colours
const highlight = (line) =>
  escape(line).replace(
    /(\b(?:defmodule|def|do|end|use|when)\b)|(:[a-z_]+)|(\b[A-Z]\w*)|(\b\d+\b)/g,
    (m, keyword, atom, module) =>
      keyword ? `<span class="k">${m}</span>`
      : atom ? `<span class="a">${m}</span>`
      : module ? `<span class="t">${m}</span>`
      : `<span class="n">${m}</span>`,
  );

const atom = (a) => `<span class="a">${a}</span>`;
const num = (n) => `<span class="n">${n}</span>`;
const st = (v) => `<span class="sv">${escape(v)}</span>`; // the state, drawn the same everywhere
const code = (html) => `<code>${html}</code>`;

// A request as code, and as the message GenServer sends
const requestCode = (m) =>
  m.request === "left" ? atom(":left") : `{${atom(m.request === "buy" ? ":buy" : ":add")}, ${num(m.n)}}`;
const messageCode = (m) =>
  m.kind === "call"
    ? `{${atom(':"$gen_call"')}, from, ${requestCode(m)}}`
    : `{${atom(':"$gen_cast"')}, ${requestCode(m)}}`;

// What the server does with a message, given the state: which clause
// matches, what its variables are bound to, what it returns, the reply (for
// a call) and the new state.
const handle = (m, left) => {
  const bound = (n) => `${n === undefined ? "" : `n = ${num(n)}, `}left = ${st(left)}`;
  if (m.request === "buy") {
    const ok = m.n <= left;
    const next = ok ? left - m.n : left;
    return {
      clause: ok ? "buy" : "sold-out",
      bindings: ok ? bound(m.n) : `left = ${st(left)} (above, ${num(m.n)} <= ${num(left)} was false)`,
      returns: `{${atom(":reply")}, ${atom(ok ? ":ok" : ":sold_out")}, ${st(next)}}`,
      reply: ok ? ":ok" : ":sold_out",
      next,
    };
  }
  if (m.request === "left") {
    return {
      clause: "left",
      bindings: bound(),
      returns: `{${atom(":reply")}, ${num(left)}, ${st(left)}}`,
      reply: String(left),
      next: left,
    };
  }
  return {
    clause: "add",
    bindings: bound(m.n),
    returns: `{${atom(":noreply")}, ${st(left + m.n)}}`,
    reply: null,
    next: left + m.n,
  };
};

const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"');

document.head.insertAdjacentHTML("beforeend", `<style>
  genserver-state:defined {
    position: relative;
    display: block;
    margin: 1.75rem 0;
    padding: 1rem;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    container: genserver-state / inline-size;
    overflow: clip; /* a message in flight never widens the page */
  }
  genserver-state .controls,
  genserver-state .send {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
  }
  genserver-state button,
  genserver-state .choices label {
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
  genserver-state .send button {
    font-family: var(--code);
    font-size: .8rem;
  }
  genserver-state button.start {
    border-color: var(--brass);
    font-weight: 700;
  }
  genserver-state button:disabled {
    cursor: default;
    opacity: .5;
  }
  genserver-state button:focus-visible,
  genserver-state .choices label:has(:focus-visible) {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  genserver-state .choices {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .35rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  genserver-state .controls .choices {
    margin-left: auto;
  }
  genserver-state .choices legend {
    float: left;
    margin-right: .25rem;
    padding: 0;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  genserver-state .choices label {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
  }
  genserver-state .choices label:has(:checked) {
    border-color: var(--brass);
    background: var(--tint);
  }
  genserver-state .choices label:has(:disabled) {
    cursor: default;
    opacity: .5;
  }
  genserver-state .choices input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
  }
  genserver-state .heading {
    display: block;
    margin: 0 0 .35rem;
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  genserver-state .parts {
    display: grid;
    gap: .75rem;
    margin-top: 1rem;
  }
  /* Wide enough: the client beside the server, so a request goes across */
  @container genserver-state (min-width: 36rem) {
    genserver-state .parts {
      grid-template-columns: 12.5rem minmax(0, 1fr);
      align-items: start;
    }
    genserver-state .you .send {
      flex-direction: column;
      align-items: stretch;
    }
  }
  genserver-state .k { color: var(--code-keyword); }
  genserver-state .a { color: var(--code-symbol); }
  genserver-state .t { color: var(--code-type); }
  genserver-state .n { color: var(--code-number); }
  genserver-state .sv {
    padding: 0 .25em;
    border-radius: 3px;
    font-weight: 700;
    color: var(--bg);
    background: var(--brass);
  }
  genserver-state .sv .a,
  genserver-state .sv .n {
    color: inherit;
  }
  genserver-state .box {
    padding: .6rem .7rem;
    border: 1.5px solid var(--line);
    border-radius: 4px;
  }
  genserver-state .box.down {
    border-style: dashed;
  }
  genserver-state .box-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: .25rem 1rem;
  }
  genserver-state .box-name {
    font-family: var(--type);
    font-size: .9rem;
    font-weight: 700;
  }
  genserver-state .you .send {
    margin-top: .5rem;
  }
  genserver-state .you output {
    display: block;
    min-height: 3em; /* two lines, filled or not */
    line-height: 1.5;
    margin-top: .5rem;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  genserver-state .you output code {
    line-height: 1;
    font-family: var(--code);
    font-size: .8rem;
    color: var(--ink);
    background: none;
    padding: 0;
  }
  genserver-state .state {
    display: flex;
    align-items: center;
    gap: .5rem;
    font-family: var(--type);
    font-size: .85rem;
    color: var(--muted);
  }
  genserver-state .state output {
    display: inline-block;
    min-width: 2.2ch;
    padding: 0 .4rem;
    border-radius: 4px;
    text-align: center;
    font-family: var(--code);
    font-size: 1.4rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--bg);
    background: var(--brass);
    transition: box-shadow .4s;
  }
  genserver-state .state output.empty {
    color: var(--muted);
    background: var(--tint);
  }
  genserver-state .state output.new {
    box-shadow: 0 0 0 5px var(--selection);
  }
  genserver-state .mailbox {
    margin-top: .6rem;
    padding: .35rem .5rem;
    border: 1.5px dashed var(--line);
    border-radius: 4px;
  }
  genserver-state .mailbox-name {
    display: block;
    font-family: var(--type);
    font-size: .75rem;
    color: var(--muted);
  }
  genserver-state .messages {
    display: grid;
    gap: .25rem;
    min-height: calc(${SHOWN} * 1.5rem + ${SHOWN - 1} * .25rem);
    margin-top: .25rem;
    align-content: start;
  }
  genserver-state .message,
  genserver-state .flying {
    justify-self: start;
    max-width: 100%;
    padding: .1rem .4rem;
    border-radius: 3px;
    font-family: var(--code);
    font-size: .72rem;
    line-height: 1.3rem;
    color: var(--ink);
    background: var(--tint);
    border: 1px solid var(--line);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  genserver-state .message.arriving {
    visibility: hidden;
  }
  genserver-state .flying {
    position: absolute;
    z-index: 1;
    margin: 0;
    pointer-events: none;
    box-shadow: 0 2px 6px rgb(0 0 0 / .2);
  }
  genserver-state .flying.reply {
    border-color: var(--brass);
  }
  genserver-state .flying.state {
    font-weight: 700;
    color: var(--bg);
    background: var(--brass);
    border-color: var(--brass);
  }
  genserver-state .flying.state .sv {
    padding: 0;
  }
  genserver-state .messages .none {
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  genserver-state .steps {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: .3rem .6rem;
    margin: .7rem 0 0;
    font-size: .85rem;
  }
  genserver-state .steps dt {
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
    line-height: 1.6rem;
  }
  genserver-state .steps dd {
    margin: 0;
    min-height: 3.2rem; /* two lines, filled or not */
    overflow-wrap: break-word;
    line-height: 1.6rem;
    opacity: .25;
    transition: opacity .2s;
  }
  genserver-state .steps dd.tall {
    min-height: 4.8rem; /* three lines */
  }
  /* Narrow: the code wraps, so every row gets a line more */
  @container genserver-state not (min-width: 36rem) {
    genserver-state .steps dd {
      min-height: 4.8rem;
    }
    genserver-state .steps dd.tall {
      min-height: 6.4rem;
    }
  }
  /* Narrower still (the smallest phones): another line each */
  @container genserver-state not (min-width: 19rem) {
    genserver-state .steps dd {
      min-height: 6.4rem;
    }
    genserver-state .steps dd.tall {
      min-height: 9.6rem;
    }
    genserver-state .you output {
      min-height: 4.5em;
    }
  }
  genserver-state .steps .source {
    display: block;
    color: var(--muted);
  }
  genserver-state .steps dd.on {
    opacity: 1;
  }
  genserver-state .steps code,
  genserver-state .steps .sv {
    line-height: 1; /* inside the row's own line height, so nothing grows */
  }
  genserver-state .steps code {
    font-family: var(--code);
    font-size: .78rem;
    background: none;
    padding: 0;
  }
  genserver-state .history-box {
    margin-top: 1rem;
  }
  genserver-state .history {
    display: flex;
    gap: .3rem;
    min-height: 3.1rem;
    overflow-x: auto;
    padding-bottom: .2rem;
  }
  genserver-state .history .entry {
    flex: none;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: .1rem;
    min-width: 2.8rem;
  }
  genserver-state .history .entry .sv {
    font-family: var(--code);
    font-size: 1rem;
    padding: 0 .4rem;
  }
  genserver-state .history .entry small {
    font-family: var(--code);
    font-size: .65rem;
    color: var(--muted);
    white-space: nowrap;
  }
  genserver-state .history .none {
    font-family: var(--type);
    font-size: .8rem;
    color: var(--muted);
  }
  genserver-state .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    genserver-state * {
      transition: none !important;
    }
  }
</style>`);

let ids = 0;

customElements.define("genserver-state", class extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const id = `genserver-state-${++ids}`;

    this.innerHTML = `
      <div class="controls">
        <button type="button" class="start">Start the server</button>
        <button type="button" class="pause" disabled>Pause</button>
        <button type="button" class="step" disabled>Step</button>
        <fieldset class="choices">
          <legend>Speed</legend>
          ${Object.keys(SPEEDS).map((name) => `
            <label><input type="radio" name="${id}-speed" value="${name}"${name === "normal" ? " checked" : ""}>${name}</label>`).join("")}
        </fieldset>
      </div>
      <div class="parts">
          <div class="box you">
            <span class="box-name">You, a client</span>
            <fieldset class="choices amount">
              <legend>n</legend>
              ${AMOUNTS.map((n) => `
                <label><input type="radio" name="${id}-n" value="${n}"${n === 2 ? " checked" : ""}>${n}</label>`).join("")}
            </fieldset>
            <div class="send">
              <button type="button" data-kind="call" data-request="buy">call {:buy, <span class="n-shown">2</span>}</button>
              <button type="button" data-kind="call" data-request="left">call :left</button>
              <button type="button" data-kind="cast" data-request="add">cast {:add, <span class="n-shown">2</span>}</button>
            </div>
            <output></output>
          </div>
          <div class="box server down">
            <div class="box-top">
              <span class="box-name">no server yet</span>
              <span class="state">state <output class="empty">–</output></span>
            </div>
            <div class="mailbox">
              <span class="mailbox-name">its mailbox, oldest first</span>
              <div class="messages"></div>
            </div>
            <dl class="steps">
              <dt class="l1">receive</dt><dd></dd>
              <dt>matches</dt><dd class="tall"></dd>
              <dt>returns</dt><dd class="tall"></dd>
              <dt>then</dt><dd></dd>
            </dl>
          </div>
      </div>
      <div class="history-box">
        <span class="heading">Every state the server has had, and what returned it</span>
        <div class="history" tabindex="0" role="list" aria-label="Every state the server has had"></div>
      </div>
      <p class="sr" aria-live="polite"></p>`;

    const $ = (selector) => this.querySelector(selector);
    this.serverBox = $(".server");
    this.serverName = $(".server .box-name");
    this.stateOut = $(".state output");
    this.messagesEl = $(".messages");
    this.l1 = $(".l1");
    this.rows = [...this.querySelectorAll(".steps dd")];
    this.youOut = $(".you output");
    this.sendButtons = [...this.querySelectorAll(".send button")];
    this.amountInputs = [...this.querySelectorAll(".amount input")];
    this.historyEl = $(".history");
    this.live = $(".sr");
    this.startButton = $(".start");
    this.pauseButton = $(".pause");
    this.stepButton = $(".step");

    this.speed = SPEEDS.normal;
    this.n = 2;
    this.paused = false;
    this.timer = null;
    this.reset();

    this.startButton.addEventListener("click", () => this.start());
    this.pauseButton.addEventListener("click", () => this.setPaused(!this.paused));
    this.stepButton.addEventListener("click", () => this.advance());
    this.querySelectorAll(".controls .choices input").forEach((input) =>
      input.addEventListener("change", () => {
        this.speed = SPEEDS[input.value];
        this.schedule();
      }));
    this.amountInputs.forEach((input) =>
      input.addEventListener("change", () => {
        this.n = Number(input.value);
        this.querySelectorAll(".n-shown").forEach((el) => (el.textContent = this.n));
      }));
    this.sendButtons.forEach((button) =>
      button.addEventListener("click", () => this.send(button)));
  }

  disconnectedCallback() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  reset() {
    clearTimeout(this.timer);
    this.timer = null;
    this.generation = (this.generation ?? 0) + 1; // a flight from before this lands nowhere
    this.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    this.querySelectorAll(".flying").forEach((el) => el.remove());
    this.started = false;
    this.state = null;
    this.mailbox = [];
    this.current = null; // what's going through the steps: start-up or a message
    this.step = 0;
    this.history = [];
    // What the state box and the history show: they catch up when the new
    // state's flight from the "then" row lands
    this.shownState = null;
    this.shownHistory = 0;
    this.landing = false;
    this.waiting = null; // the call the client is blocked on
    this.said = "";
    this.render();
  }

  start() {
    this.reset();
    this.started = true;
    this.current = { startup: true };
    this.step = 1;
    this.said = `called ${code("GenServer.start")}, waiting for it to return`;
    this.waiting = this.current;
    this.say("GenServer.start spawns a new process");
    this.render();
    this.schedule();
  }

  send(button) {
    const m = { kind: button.dataset.kind, request: button.dataset.request, n: this.n };
    this.mailbox.push(m);
    if (m.kind === "call") {
      this.waiting = m;
      this.said = `waiting for the reply to ${code(requestCode(m))}`;
    } else {
      this.said = `${code("GenServer.cast")} returned ${code(atom(":ok"))} at once`;
    }
    this.say(`you sent ${plain(messageCode(m))}`);
    const from = button.getBoundingClientRect();
    m.arriving = true;
    this.render();
    const chip = this.messagesEl.children[Math.min(this.mailbox.indexOf(m), SHOWN)];
    this.fly(messageCode(m), from, chip, false, () => {
      m.arriving = false;
      this.render();
    });
    this.schedule();
  }

  setPaused(paused) {
    this.paused = paused;
    this.pauseButton.textContent = paused ? "Play" : "Pause";
    this.render();
    this.schedule();
  }

  // The server takes the oldest message into the steps
  take() {
    const chip = this.messagesEl.firstElementChild;
    const from = chip?.getBoundingClientRect();
    this.current = this.mailbox.shift();
    this.current.arriving = false;
    this.current.result = handle(this.current, this.state);
    this.step = 1;
    this.say(`the server takes ${plain(messageCode(this.current))}`);
    this.render();
    if (from) this.fly(messageCode(this.current), from, this.rows[0], false);
  }

  advance() {
    if (!this.started) return;
    if (!this.current) {
      if (this.mailbox.length) this.take();
    } else if (this.step < 4) {
      this.step += 1;
      if (this.step === 4) this.finish();
      else this.say(plain(this.texts()[this.step - 1]));
      this.render();
      if (this.landing) this.land();
    } else if (this.mailbox.length) {
      this.take();
    } else {
      this.current = null;
      this.step = 0;
      this.render();
    }
    this.schedule();
  }

  // The fourth step: the reply goes out, and the new state is the loop's
  finish() {
    const c = this.current;
    if (c.startup) {
      this.state = START;
      this.history.push({ value: START, label: "init" });
      this.waiting = null;
      this.said = `${code("GenServer.start")} returned ${code(`{${atom(":ok")}, server}`)}`;
      this.say(`init returned {:ok, ${START}}: the state is ${START}`);
    } else {
      const { reply, next } = c.result;
      this.state = next;
      this.history.push({ value: next, label: plain(requestCode(c)) });
      if (c.kind === "call") {
        this.waiting = null;
        this.said = `got the reply ${code(reply.startsWith(":") ? atom(reply) : num(reply))}`;
        this.fly(reply.startsWith(":") ? atom(reply) : num(reply), this.rows[3].getBoundingClientRect(), this.youOut, "reply");
      }
      this.say(`${c.kind === "call" ? `replied ${reply}; ` : ""}the new state is ${next}`);
    }
    this.landing = true;
  }

  // The new state goes up from the "then" row into the state box
  land() {
    this.landing = false;
    const generation = this.generation;
    const value = this.state;
    const count = this.history.length;
    const done = () => {
      if (generation !== this.generation) return;
      this.shownState = value;
      this.shownHistory = count;
      this.flash = true;
      this.render();
    };
    const chip = this.rows[3].querySelector(".sv");
    if (!chip) return done();
    this.fly(st(value), chip.getBoundingClientRect(), this.stateOut, "state", done);
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    const work = this.current || (this.started && this.state !== null && this.mailbox.length);
    if (!this.paused && work && this.isConnected) {
      this.timer = setTimeout(() => this.advance(), this.speed);
    }
  }

  // A message or reply moving from one place to another
  fly(html, fromRect, toEl, kind, done) {
    if (reducedMotion.matches || !toEl) return done?.();
    const host = this.getBoundingClientRect();
    const to = toEl.getBoundingClientRect();
    const el = document.createElement("span");
    el.className = `flying${kind ? ` ${kind}` : ""}`;
    el.innerHTML = html;
    el.style.left = `${fromRect.left - host.left}px`;
    el.style.top = `${fromRect.top - host.top}px`;
    el.style.maxWidth = `${Math.max(to.width, 120)}px`;
    this.append(el);
    const dx = to.left - fromRect.left;
    const dy = to.top - fromRect.top;
    const animation = el.animate(
      [{ transform: "translate(0, 0)", opacity: .9 }, { transform: `translate(${dx}px, ${dy}px)`, opacity: 1 }],
      { duration: Math.min(this.speed * .6, 700), easing: "ease-in-out" },
    );
    const finish = () => {
      el.remove();
      done?.();
    };
    animation.onfinish = finish;
    animation.oncancel = finish;
  }

  say(text) {
    this.live.textContent = text;
  }

  // What the four rows say for whatever is going through the steps
  texts() {
    const c = this.current;
    if (!c) return [this.started && this.state !== null ? "waiting for a message" : "", "", "", ""];
    const source = (html) => `<span class="source">${code(html)}</span>`;
    const clause = (name) => CLAUSES[name];
    if (c.startup) {
      return [
        `${code("GenServer.start")} spawns a new process`,
        `${source(highlight(clause("init").head))}left = ${num(START)}`,
        `${source(highlight(clause("init").body))}${code(`{${atom(":ok")}, ${st(START)}}`)}`,
        `${code("start")} returns to its caller, and the loop waits for a message, with ${st(START)} as its state`,
      ];
    }
    const r = c.result;
    return [
      `takes the oldest message, ${code(messageCode(c))}`,
      `${source(highlight(clause(r.clause).head))}${r.bindings}`,
      `${source(highlight(clause(r.clause).body))}${code(r.returns)}`,
      c.kind === "call"
        ? `sends ${code(r.reply.startsWith(":") ? atom(r.reply) : num(r.reply))} back to you, and loops with ${st(r.next)} as its state`
        : `no reply for a cast; loops with ${st(r.next)} as its state`,
    ];
  }

  render() {
    const c = this.current;

    // The client
    this.youOut.innerHTML = this.started ? this.said || "idle" : "start the server first";
    const blocked = !this.started || !!this.waiting;
    this.sendButtons.forEach((b) => (b.disabled = blocked));
    this.amountInputs.forEach((input) => (input.disabled = blocked));

    // The server
    this.serverBox.classList.toggle("down", !this.started);
    this.serverName.textContent = this.started ? "The server process" : "No server yet";
    const hasState = this.state !== null;
    const stateShown = this.shownState !== null;
    this.stateOut.textContent = stateShown ? this.shownState : "–";
    this.stateOut.classList.toggle("empty", !stateShown);
    if (this.flash) {
      this.flash = false;
      this.stateOut.classList.add("new");
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => this.stateOut.classList.remove("new"), Math.min(this.speed, 900));
    }

    // The mailbox
    const shown = this.mailbox.slice(0, SHOWN);
    const more = this.mailbox.length - shown.length;
    this.messagesEl.innerHTML = this.mailbox.length
      ? shown.map((m) => `<span class="message${m.arriving ? " arriving" : ""}">${messageCode(m)}</span>`).join("")
        + (more ? `<span class="message">and ${more} more</span>` : "")
      : `<span class="none">${this.started ? "empty" : "no process, no mailbox"}</span>`;

    // The four steps
    this.l1.textContent = c?.startup ? "start" : "receive";
    const texts = this.texts();
    this.rows.forEach((row, i) => {
      row.innerHTML = texts[i];
      row.classList.toggle("on", c ? i < this.step : i === 0 && hasState);
    });

    // The history
    const history = this.history.slice(0, this.shownHistory);
    this.historyEl.innerHTML = history.length
      ? history.map((h) => `<span class="entry" role="listitem">${st(h.value)}<small>${escape(h.label)}</small></span>`).join("")
      : `<span class="none">none yet</span>`;
    this.historyEl.scrollLeft = this.historyEl.scrollWidth;

    // The controls
    this.startButton.textContent = this.started ? "Start a new server" : "Start the server";
    this.pauseButton.disabled = !this.started;
    this.stepButton.disabled = !this.started || !this.paused || !(c || this.mailbox.length);
  }
});
