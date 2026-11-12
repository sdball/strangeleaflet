// Three buyers at once, two tickets, and the seller has to wait 100 ms on a
// payment in the middle of each sale. wait-inside-queue.mjs is the fix.

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

const tickets = new Tickets(2);
const start = performance.now();

console.log(`node ${process.version}`);
await Promise.all(
  [1, 2, 3].map(async (buyer) => {
    const reply = await tickets.buy();
    console.log(`${Math.round(performance.now() - start)} ms: buyer ${buyer}: ${reply}`);
  }),
);
console.log(`tickets left: ${tickets.left}`);
