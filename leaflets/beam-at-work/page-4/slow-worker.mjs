// The main thread posts a message, waits 1 ms, and posts another, to a
// worker that spends 2 ms on each one. Every second, report how many
// messages were posted, how many the worker has handled, and the
// difference: messages waiting in the worker's queue. With "call", wait
// for each reply before posting the next.
import { Worker } from "node:worker_threads";
import { setTimeout as sleep } from "node:timers/promises";

const mode = process.argv[2] ?? "send";
// A counter the worker bumps after each message, only so this can report it
const handled = new Int32Array(new SharedArrayBuffer(4));
const worker = new Worker(
  `const { parentPort, workerData: handled } = require("node:worker_threads");
   const pause = new Int32Array(new SharedArrayBuffer(4));
   parentPort.on("message", ({ reply }) => {
     Atomics.wait(pause, 0, 0, 2); // 2 ms of work
     Atomics.add(handled, 0, 1);
     if (reply) parentPort.postMessage("done");
   });`,
  { eval: true, workerData: handled },
);
const done = () => new Promise((resolve) => worker.once("message", resolve));

const payload = Array.from({ length: 100 }, (_, i) => i + 1);
const start = performance.now();
let sent = 0;
let reportAt = 1000;
console.log(`node ${process.version}, mode: ${mode}`);
while (reportAt <= 6000) {
  worker.postMessage({ reply: mode === "call", payload });
  if (mode === "call") await done();
  await sleep(1);
  sent++;
  if (performance.now() - start >= reportAt) {
    const n = Atomics.load(handled, 0);
    const pad = (x) => String(x).padStart(4);
    console.log(`${pad(reportAt)} ms: sent ${pad(sent)}, handled ${pad(n)}, waiting ${pad(sent - n)}`);
    reportAt += 1000;
  }
}
await worker.terminate();
