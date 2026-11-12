// Three buyers at once, two tickets, and the seller has to wait 100 ms on a
// payment in the middle of each sale. Run with "queue" to make each sale wait
// for the one before it.

import { setTimeout as sleep } from "node:timers/promises";

const charge = async () => {
  await sleep(100);
  return "paid";
};

class Tickets {
  constructor(left) {
    this.left = left;
  }

  async buy() {
    if (this.left === 0) return "sold out";
    await charge();
    this.left -= 1;
    return "ok";
  }
}

class QueuedTickets extends Tickets {
  queue = Promise.resolve();

  buy() {
    const result = this.queue.then(() => super.buy());
    this.queue = result.catch(() => {});
    return result;
  }
}

const mode = process.argv[2] ?? "plain";
const tickets = mode === "queue" ? new QueuedTickets(2) : new Tickets(2);
const start = performance.now();

console.log(`node ${process.version}, ${mode}`);
await Promise.all(
  [1, 2, 3].map(async (buyer) => {
    const reply = await tickets.buy();
    const ms = Math.round(performance.now() - start);
    console.log(`${ms} ms: buyer ${buyer}: ${reply}`);
  }),
);
console.log(`tickets left: ${tickets.left}`);
