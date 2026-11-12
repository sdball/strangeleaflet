// wait-inside.mjs with a queue: each sale waits for the one before it.

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
    await charge(); // takes 100 ms
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

const tickets = new QueuedTickets(2);
const start = performance.now();

console.log(`node ${process.version}`);
await Promise.all(
  [1, 2, 3].map(async (buyer) => {
    const reply = await tickets.buy();
    console.log(`${Math.round(performance.now() - start)} ms: buyer ${buyer}: ${reply}`);
  }),
);
console.log(`tickets left: ${tickets.left}`);
