// What does an idle worker thread cost? Start N, wait until each is up, measure.
import { Worker, isMainThread, parentPort } from "node:worker_threads";
if (isMainThread) {
  const n = Number(process.argv[2] ?? 8);
  global.gc?.();
  const before = process.memoryUsage().rss;
  const t0 = performance.now();
  const ws = [];
  await Promise.all(Array.from({ length: n }, () => new Promise((resolve) => {
    const w = new Worker(new URL(import.meta.url));
    w.once("message", resolve);
    ws.push(w);
  })));
  const ms = performance.now() - t0;
  const after = process.memoryUsage().rss;
  console.log(`${n} idle workers: ${((after - before) / n / 1024 / 1024).toFixed(1)} MB of RSS each, ${(ms / n).toFixed(1)} ms each to start (${ms.toFixed(0)} ms total)`);
  ws.forEach((w) => w.terminate());
} else {
  parentPort.postMessage("up");
  setInterval(() => {}, 1 << 30);
}
