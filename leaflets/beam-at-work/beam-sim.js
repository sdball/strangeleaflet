// The simulation engine for "The BEAM at Work". It lives beside the cover so
// it's published whenever any page of the leaflet is, and each page's widget
// imports it as "../beam-sim.js".
//
// Two models share one clock. Its unit is the time a scheduler takes to do
// one reduction (about one function call), so a BEAM process and a Node
// callback doing the same work take the same number of steps. Nothing is to
// scale with a real machine: the widgets slow it down to watch.
//
// Beam: schedulers, each with its own run queue. A process runs until it
// waits or uses up its budget of reductions (CONTEXT_REDS, 4000 in erts since
// OTP 20), then goes to the back of its scheduler's queue. A scheduler with an
// empty queue steals from another's. A process spawned by another process goes
// on its parent's scheduler's queue, as in erts (erl_create_process); one
// spawned from outside any process, by a widget, goes to the least busy.
// Migration, when it's on (balanceEvery), is simplified from the BEAM Book's
// Migration section: every so often the schedulers compare their loads (the
// process running plus the queue), and until the next comparison a scheduler
// above the average hands a process that's going back in its queue to the
// least loaded one below it. The real check runs every 2000 * CONTEXT_REDS
// reductions, compares the longest each queue got over that time, fixes one
// partner per scheduler, and also lets the short queue pull work; none of
// that is modelled.
// One priority only.
//
// EventLoop: Node's JavaScript thread. One call stack; a callback runs until
// it returns; due timers, then other callbacks, wait in line behind it.
//
// A process body (or a callback's) is a generator function that yields:
//   { run: n }         n reductions of work
//   { receive: true }  the oldest message, waiting for one if there are none
//   { sleep: n }       nothing, for n units
//   { spawn: { name, body, info } }  a new process; the yield returns its pid
// A callback can only yield { run }: in Node, waiting means a new callback.

export const CONTEXT_REDS = 4000;

class Clock {
  constructor() {
    this.time = 0;
    this.listeners = new Set();
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) listener({ time: this.time, ...event });
  }

  advance(units) {
    for (let i = 0; i < units; i++) this.step();
  }
}

export class Beam extends Clock {
  constructor({ schedulers = 1, budget = CONTEXT_REDS, balanceEvery = null } = {}) {
    super();
    this.budget = budget;
    this.balanceEvery = balanceEvery;
    this.plan = null; // the latest migration plan, see balance()
    this.nextPid = 1;
    this.processes = new Map();
    this.timers = [];
    this.schedulers = [];
    this.setSchedulers(schedulers);
  }

  setSchedulers(count) {
    while (this.schedulers.length < count) {
      this.schedulers.push({ id: this.schedulers.length + 1, current: null, left: 0, queue: [] });
    }
    // Taking schedulers offline moves their processes onto the others
    for (const s of this.schedulers.splice(count)) {
      const moving = s.current ? [s.current, ...s.queue] : s.queue;
      for (const p of moving) {
        p.state = "runnable";
        p.home = null;
        this.enqueue(p);
      }
    }
  }

  // With a parent, the new process starts on the parent's scheduler
  spawn(name, body, info = {}, parent = null) {
    const p = {
      ...info,
      pid: this.nextPid++,
      name,
      state: "runnable",
      reductions: 0,
      mailbox: [],
      waiting: null,
      cmd: null,
      home: parent?.home ?? null,
      parent: parent?.pid ?? null,
    };
    p.gen = body(p);
    this.processes.set(p.pid, p);
    this.enqueue(p, { migrate: false });
    this.emit({ type: "spawn", process: p, parent });
    return p;
  }

  send(pid, message) {
    const p = this.processes.get(pid);
    if (!p) return;
    p.mailbox.push(message);
    if (p.state === "waiting" && p.waiting === "message") this.wake(p);
  }

  // Like :timer.send_interval/2: a message every `every` units, the first after `first`
  sendInterval(pid, message, every, first = every) {
    this.timers.push({ at: this.time + first, pid, message, every });
  }

  step() {
    this.time++;
    if (this.balanceEvery && this.time % this.balanceEvery === 0) this.balance();
    this.fireTimers();
    for (const s of this.schedulers) this.work(s);
  }

  // Compare loads. The average holds until the next balance.
  balance() {
    const average = this.schedulers.reduce((sum, s) => sum + load(s), 0) / this.schedulers.length;
    this.plan = { average };
    this.emit({ type: "balance", average });
  }

  fireTimers() {
    for (const timer of this.timers) {
      if (timer.at > this.time) continue;
      if ("message" in timer) this.send(timer.pid, timer.message);
      else this.wake(this.processes.get(timer.pid));
      timer.at = timer.every ? timer.at + timer.every : null;
    }
    this.timers = this.timers.filter((t) => t.at !== null && this.processes.has(t.pid));
  }

  // One reduction on scheduler s
  work(s) {
    if (!s.current) {
      const p = s.queue.shift() ?? this.steal(s);
      if (!p) return;
      s.current = p;
      s.left = this.budget;
      p.state = "running";
      p.home = s.id;
      if (!p.cmd) this.resume(p);
      if (p.state !== "running") {
        s.current = null;
        return;
      }
    }
    const p = s.current;
    p.cmd.left--;
    p.reductions++;
    s.left--;
    if (p.cmd.left === 0) {
      p.cmd = null;
      this.resume(p);
      if (p.state !== "running") {
        s.current = null;
        return;
      }
    }
    if (s.left === 0) {
      // Out of reductions: to the back of the queue, whatever it was doing
      s.current = null;
      p.state = "runnable";
      this.enqueue(p);
      this.emit({ type: "preempt", process: p, scheduler: s });
    }
  }

  steal(thief) {
    const victim = this.schedulers
      .filter((s) => s !== thief && s.queue.length)
      .sort((a, b) => b.queue.length - a.queue.length)[0];
    if (!victim) return null;
    const p = victim.queue.shift();
    this.emit({ type: "steal", process: p, from: victim, to: thief });
    return p;
  }

  // Run the body until it asks for work, waits, or ends
  resume(p) {
    let value;
    if (p.waiting === "message") value = p.mailbox.shift();
    p.waiting = null;
    for (;;) {
      const { value: cmd, done } = p.gen.next(value);
      value = undefined;
      if (done) return this.exit(p);
      if ("run" in cmd) {
        p.cmd = { left: cmd.run, of: cmd.run };
        return;
      }
      if ("receive" in cmd) {
        if (p.mailbox.length) {
          value = p.mailbox.shift();
          continue;
        }
        return this.wait(p, "message");
      }
      if ("spawn" in cmd) {
        const { name, body, info } = cmd.spawn;
        value = this.spawn(name, body, info, p).pid;
        continue;
      }
      if ("sleep" in cmd) {
        this.timers.push({ at: this.time + cmd.sleep, pid: p.pid });
        return this.wait(p, "timer");
      }
      throw new Error(`${p.name}: unknown command ${JSON.stringify(cmd)}`);
    }
  }

  wait(p, why) {
    p.state = "waiting";
    p.waiting = why;
  }

  wake(p) {
    if (!p || p.state !== "waiting") return;
    p.state = "runnable";
    if (p.waiting === "timer") p.waiting = null;
    this.enqueue(p);
  }

  enqueue(p, { migrate = true } = {}) {
    const home = this.schedulers.find((s) => s.id === p.home);
    let s = home ?? this.schedulers.reduce((a, b) => (load(b) < load(a) ? b : a));
    const to = migrate && home && this.migrationTarget(home);
    if (to) {
      this.emit({ type: "migrate", process: p, from: s, to });
      s = to;
      p.home = to.id;
    }
    s.queue.push(p);
  }

  // Where a process going back in s's queue should go instead, if anywhere.
  // The process isn't counted in any load yet, hence the + 1s.
  migrationTarget(s) {
    if (!this.plan || load(s) + 1 <= this.plan.average) return null;
    const to = this.schedulers.reduce((a, b) => (load(b) < load(a) ? b : a));
    return load(to) + 1 <= this.plan.average ? to : null;
  }

  exit(p) {
    p.state = "exited";
    this.processes.delete(p.pid);
    this.emit({ type: "exit", process: p });
  }

  waitingProcesses() {
    return [...this.processes.values()].filter((p) => p.state === "waiting");
  }
}

const load = (s) => s.queue.length + (s.current ? 1 : 0);

export class EventLoop extends Clock {
  constructor() {
    super();
    this.nextId = 1;
    this.timers = [];
    this.pending = []; // callbacks ready to run that aren't timers (I/O, requests)
    this.phase = []; // this turn of the loop: due timers first, then pending
    this.stack = null; // the callback running now
  }

  setInterval(name, body, every, first = every) {
    const timer = { id: this.nextId++, name, body, at: this.time + first, every };
    this.timers.push(timer);
    return timer;
  }

  // A callback that's ready to run, like the handler for a request that just arrived
  queue(name, body, info = {}) {
    const callback = { ...info, id: this.nextId++, name, body };
    this.pending.push(callback);
    this.emit({ type: "queue", callback });
    return callback;
  }

  step() {
    this.time++;
    if (!this.stack) this.pick();
    const c = this.stack;
    if (!c) return;
    c.cmd.left--;
    c.done++;
    if (c.cmd.left === 0) this.resume(c);
  }

  pick() {
    if (!this.phase.length) {
      const due = this.timers.filter((t) => t.at <= this.time).sort((a, b) => a.at - b.at);
      this.phase = [...due, ...this.pending.splice(0)];
      for (const t of due) t.at = Infinity; // in this turn now, not due again until it runs
    }
    while (!this.stack && this.phase.length) {
      const next = this.phase.shift();
      // An interval is re-armed from when its callback runs, so ticks it
      // missed while the stack was busy don't come back
      if (next.every) next.at = this.time + next.every;
      this.stack = { ...next, gen: next.body(), done: 0, total: 0, cmd: null };
      this.emit({ type: "call", callback: this.stack });
      this.resume(this.stack);
    }
  }

  resume(c) {
    const { value: cmd, done } = c.gen.next();
    if (done) {
      this.stack = null;
      this.emit({ type: "return", callback: c });
      return;
    }
    if (!("run" in cmd)) throw new Error(`${c.name}: a callback can only run, not ${JSON.stringify(cmd)}`);
    c.cmd = { left: cmd.run, of: cmd.run };
    c.total += cmd.run;
  }

  // Callbacks waiting for the stack: due timers and anything pending
  ready() {
    const inPhase = new Set(this.phase);
    const due = this.timers.filter((t) => t.at <= this.time && !inPhase.has(t));
    return [...this.phase, ...due, ...this.pending];
  }

  // Timers set but not due yet
  waitingTimers() {
    const ready = new Set(this.ready());
    return this.timers.filter((t) => !ready.has(t) && t !== this.stack);
  }
}
