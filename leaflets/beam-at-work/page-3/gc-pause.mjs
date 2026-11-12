// Build a list of 10 million pairs, all of it live, while a ticker tries
// to tick every 10 ms. The builder works in chunks of 10,000 and lets the
// ticker run between chunks, so the ticker only waits on a short chunk of
// work or on a garbage collection. Record V8's collections, and measure
// how late each tick was.
import { PerformanceObserver } from "node:perf_hooks";
import { setImmediate as letOthersRun } from "node:timers/promises";

const gcs = [];
new PerformanceObserver((list) => gcs.push(...list.getEntries())).observe({ entryTypes: ["gc"] });

const t0 = performance.now();
const ticks = []; // every tick as { late, due }, in ms
let due = t0 + 10;
const tick = () => {
  ticks.push({ late: performance.now() - due, due });
  due += 10;
  if (due < t0 + 4000) setTimeout(tick, Math.max(0, due - performance.now()));
};
setTimeout(tick, 10);

await new Promise((resolve) => setTimeout(resolve, 500));
let list = null;
let longestChunk = 0;
for (let n = 10_000_000; n > 0; ) {
  const chunkStart = performance.now();
  for (const end = n - 10_000; n > end; n--) list = { a: n, b: n, tail: list };
  longestChunk = Math.max(longestChunk, performance.now() - chunkStart);
  await letOthersRun();
}
await new Promise((resolve) => setTimeout(resolve, t0 + 4100 - performance.now()));

const ms = (t) => Math.round(t);
const longest = Math.max(...gcs.map((g) => g.duration));
const total = gcs.reduce((sum, g) => sum + g.duration, 0);
// A tick was held up by a collection if it was waiting while one ran.
const duringGC = ({ late, due }) => gcs.some((g) => due < g.startTime + g.duration && due + late > g.startTime);
const during = ticks.filter(duringGC);
const other = ticks.filter((t) => !duringGC(t));
const worst = (ticks) => ms(Math.max(0, ...ticks.map((t) => t.late)));

console.log(`node ${process.version}, heap used ${ms(process.memoryUsage().heapUsed / 1048576)} MB, longest chunk of work ${ms(longestChunk)} ms`);
console.log(`GCs: ${gcs.length}, ${ms(total)} ms in all, longest ${ms(longest)} ms`);
console.log(`ticks while V8 collected: ${during.length}, worst ${worst(during)} ms late`);
console.log(`ticks the rest of the time: ${other.length}, worst ${worst(other)} ms late`);
list = null;
