// The closest thing in Node to a monitor: a worker thread that throws ends
// only itself, and the main thread hears about it through the worker's
// 'error' and 'exit' events. Restarting it is up to us: here the main
// thread's 'exit' handler starts a new worker when one exits with any code
// but 0, up to three times, like restart.exs's restarter. The first worker
// fails at 3; the ones after it count to 5.

import { Worker } from "node:worker_threads";

console.log(`node ${process.version}`);

// A worker that counts to 5, once every 100 ms, unless it fails first
const work = `
  const { threadId, workerData } = require("node:worker_threads");
  let n = 0;
  const timer = setInterval(() => {
    n += 1;
    if (n === workerData.failAt) throw new Error(\`failed at \${n}\`);
    console.log(\`worker \${threadId}: \${n}\`);
    if (n === 5) clearInterval(timer);
  }, 100);
`;

let tries = 3;

const start = (failAt) => {
  const worker = new Worker(work, { eval: true, workerData: { failAt } });
  const id = worker.threadId; // -1 once the worker has stopped
  worker.on("error", (err) => console.log(`main: worker ${id} error: ${err.message}`));
  worker.on("exit", (code) => {
    console.log(`main: worker ${id} exit, code ${code}`);
    if (code === 0) return;
    if (tries === 0) return console.log("main: giving up");
    tries -= 1;
    console.log("main: starting a new worker");
    start(null);
  });
};

start(3);
