// Record a run for page 3's widget: gc-pause.mjs's builder, three tickers
// whose ticks also build a short list and throw it away, like a small
// request. Writes every tick, every garbage collection, and samples of
// V8's young and old generations, as JSON.
import { PerformanceObserver, constants } from "node:perf_hooks";
import { setImmediate as letOthersRun } from "node:timers/promises";
import { getHeapSpaceStatistics } from "node:v8";
import { writeFileSync } from "node:fs";

const gcs = [];
new PerformanceObserver((list) => gcs.push(...list.getEntries())).observe({ entryTypes: ["gc"] });

const t0 = performance.now();
const at = (t) => Math.round((t - t0) * 1000); // µs since start, like the Elixir side
const samples = [];
const sample = () => {
  const s = Object.fromEntries(getHeapSpaceStatistics().map((x) => [x.space_name, x]));
  samples.push([at(performance.now()), s.new_space.space_used_size, s.new_space.space_size,
    s.old_space.space_used_size, s.old_space.space_size]);
};

const TICKERS = 3;
const tickers = Array.from({ length: TICKERS }, () => []);
for (const ticks of tickers) {
  let due = t0 + 10;
  const tick = () => {
    ticks.push([at(due), at(performance.now()) - at(due)]);
    let request = 0;
    for (const n of Array.from({ length: 40 }, (_, i) => i + 1)) request += n;
    if (ticks === tickers[0]) sample();
    due += 10;
    if (due < t0 + 3000) setTimeout(tick, Math.max(0, due - performance.now()));
  };
  setTimeout(tick, 10);
}

await new Promise((resolve) => setTimeout(resolve, 500));
const started = at(performance.now());
let list = null;
let chunk = 0;
for (let n = 10_000_000; n > 0; ) {
  for (const end = n - 10_000; n > end; n--) list = { a: n, b: n, tail: list };
  if (++chunk % 5 === 0) sample();
  await letOthersRun();
}
const built = at(performance.now());
await new Promise((resolve) => setTimeout(resolve, t0 + 3100 - performance.now()));

const KINDS = {
  [constants.NODE_PERFORMANCE_GC_MAJOR]: "major",
  [constants.NODE_PERFORMANCE_GC_MINOR]: "minor",
  [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: "incremental",
  [constants.NODE_PERFORMANCE_GC_WEAKCB]: "weak callbacks",
};
const data = {
  versions: `Node ${process.version}`,
  builder: { started, built },
  gcs: gcs.map((g) => [KINDS[g.detail.kind] ?? String(g.detail.kind), at(g.startTime), at(g.startTime + g.duration)]),
  samples,
  tickers: tickers.map((ticks) => ({ ticks })),
};
writeFileSync(process.argv[2] ?? "node-run.json", JSON.stringify(data));
const worst = (ticks) => Math.round(Math.max(...ticks.map(([, late]) => late)) / 1000);
console.log(`GCs: ${gcs.length} (${Object.entries(Object.groupBy(data.gcs, (g) => g[0])).map(([k, v]) => `${v.length} ${k}`).join(", ")}), longest ${Math.round(Math.max(...gcs.map((g) => g.duration)))} ms; tickers worst ${tickers.map(worst).join(" ")} ms late; samples ${samples.length}`);
list = null;
