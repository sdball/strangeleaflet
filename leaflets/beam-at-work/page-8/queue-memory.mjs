// Post N of the slow consumer's messages to a worker that never reads them,
// and measure how much the process grew per message waiting.
import { Worker } from "node:worker_threads";
const payload = Array.from({ length: 100 }, (_, i) => i + 1);
const worker = new Worker("setInterval(() => {}, 60_000);", { eval: true });
await new Promise((r) => setTimeout(r, 500));
globalThis.gc?.();
const rss = () => process.memoryUsage().rss;
const before = rss();
let have = 0;
for (const n of [1_000, 3_000, 10_000, 30_000, 100_000]) {
  for (; have < n; have++) worker.postMessage({ reply: false, payload });
  await new Promise((r) => setTimeout(r, 200));
  globalThis.gc?.();
  const grew = rss() - before;
  console.log(`${String(n).padStart(6)} waiting: rss grew ${Math.round(grew / 1024)} KB, ${Math.round(grew / n)} bytes each`);
}
await worker.terminate();
