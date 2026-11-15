// The closest thing in Node to a monitor: a worker thread that throws ends
// only itself, and the main thread hears about it through the worker's
// 'error' and 'exit' events.

import { Worker } from "node:worker_threads";

console.log(`node ${process.version}`);

const worker = new Worker(
  `setTimeout(() => { throw new Error("oops"); }, 250);`,
  { eval: true },
);
worker.on("error", (err) => console.log(`worker error: ${err.message}`));
worker.on("exit", (code) => console.log(`worker exit, code ${code}`));

let n = 0;
const timer = setInterval(() => {
  n += 1;
  console.log(`main: ${n}`);
  if (n === 5) clearInterval(timer);
}, 100);
