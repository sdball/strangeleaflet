// supervised.exs in Node: a worker thread that counts and fails one time in
// four, and a supervisor written by hand that restarts it when it fails and
// gives up after more than 3 restarts in 5 seconds.
import { Worker } from "node:worker_threads";

console.log(`node ${process.version}`);

const work = `
  const { threadId } = require("node:worker_threads");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    for (let n = 1; n <= 5; n++) {
      await sleep(50);
      if (Math.random() < 0.25) throw new Error("failed at " + n);
      console.log("worker " + threadId + ": " + n);
    }
  })();
`;

function supervise(source, { maxRestarts = 3, maxSeconds = 5 } = {}) {
  const restarts = [];
  const start = () => {
    const worker = new Worker(source, { eval: true });
    worker.on("error", () => {}); // the exit code says it failed
    worker.on("exit", (code) => {
      if (code === 0) return;
      const now = Date.now();
      while (restarts.length && restarts[0] < now - maxSeconds * 1000) restarts.shift();
      if (restarts.length >= maxRestarts) {
        console.log("supervisor: too many restarts, giving up");
        process.exit(1);
      }
      restarts.push(now);
      start();
    });
  };
  start();
}

supervise(work);
