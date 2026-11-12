// The main thread posts 1,000 messages a second to a worker that works on
// each one for 2 ms, so it can only handle 500 a second. Every second,
// report how many messages were posted, how many the worker has handled,
// and the difference: messages waiting in the worker's queue. With "call",
// wait for each reply before posting the next.
import { Worker } from "node:worker_threads";
import { setTimeout as sleep } from "node:timers/promises";

const mode = process.argv[2] ?? "send";
// A counter the worker bumps after each message, only so this can report it
const handled = new Int32Array(new SharedArrayBuffer(4));
const worker = new Worker(
  `const { parentPort, workerData: handled } = require("node:worker_threads");
   // Keep busy for ms milliseconds by the clock, the way real work would
   const busy = (ms) => { const until = performance.now() + ms; while (performance.now() < until); };
   parentPort.on("message", ({ reply }) => {
     busy(2);
     Atomics.add(handled, 0, 1);
     if (reply) parentPort.postMessage("done");
   });`,
  { eval: true, workerData: handled },
);
const done = () => new Promise((resolve) => worker.once("message", resolve));

const payload = Array.from({ length: 100 }, (_, i) => i + 1);
const start = performance.now();
const elapsed = () => performance.now() - start;
const pad = (x) => String(x).padStart(4);

// One message is due every millisecond since the start. Post whatever's
// due, then sleep until the next one.
console.log(`node ${process.version}, mode: ${mode}`);
let sent = 0;
for (let reportAt = 1000; reportAt <= 6000; ) {
  if (elapsed() >= reportAt) {
    const n = Atomics.load(handled, 0);
    console.log(`${pad(reportAt)} ms: sent ${pad(sent)}, handled ${pad(n)}, waiting ${pad(sent - n)}`);
    reportAt += 1000;
  } else if (sent < Math.floor(elapsed())) {
    worker.postMessage({ reply: mode === "call", payload });
    if (mode === "call") await done();
    sent++;
  } else {
    await sleep(1);
  }
}
await worker.terminate();
