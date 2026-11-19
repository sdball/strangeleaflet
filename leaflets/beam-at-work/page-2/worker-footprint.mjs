// Idle worker threads' memory by vmmap's "Physical footprint", which counts
// memory macOS has compressed too, where RSS doesn't. Start N, wait until
// each is up, measure the whole process before and after.
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { execFileSync } from "node:child_process";

const footprint = () => {
  const out = execFileSync("vmmap", ["-summary", String(process.pid)], { encoding: "utf8", maxBuffer: 1 << 26 });
  const line = out.split("\n").find((l) => l.startsWith("Physical footprint:"));
  const [, n, unit] = line.match(/([\d.]+)([KMG])/);
  return Number(n) * { K: 1 / 1024, M: 1, G: 1024 }[unit]; // MB
};

if (isMainThread) {
  const n = Number(process.argv[2] ?? 8);
  global.gc?.();
  const before = footprint();
  const rssBefore = process.memoryUsage().rss;
  const ws = [];
  await Promise.all(Array.from({ length: n }, () => new Promise((resolve) => {
    const w = new Worker(new URL(import.meta.url));
    w.once("message", resolve);
    ws.push(w);
  })));
  const after = footprint();
  const rss = (process.memoryUsage().rss - rssBefore) / n / 1024 / 1024;
  console.log(`${n} idle workers: ${((after - before) / n).toFixed(1)} MB of physical footprint each (${(after / 1024).toFixed(2)} GB in all), ${rss.toFixed(1)} MB of RSS each`);
  ws.forEach((w) => w.terminate());
} else {
  parentPort.postMessage("up");
  setInterval(() => {}, 1 << 30);
}
