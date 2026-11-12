// Four intervals, then two busy loops: a short one at 500 ms and a longer
// one at 1000 ms. Which intervals end up ticking together?
//
//   node intervals.mjs
//
// A, B, and D tick every 100 ms, starting 0, 40, and 90 ms in.
// C ticks every 150 ms, starting 20 ms in.

const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));

const start = performance.now();
const now = () => Math.round(performance.now() - start);

const ticks = { A: [], B: [], D: [], C: [] };
for (const [name, offset, every] of [["A", 0, 100], ["B", 40, 100], ["D", 90, 100], ["C", 20, 150]]) {
  setTimeout(() => setInterval(() => ticks[name].push(now()), every), offset);
}

const busy = [];
const busyLoop = (n) => {
  const from = now();
  fib(n);
  busy.push(`${from}–${now()} ms`);
};
setTimeout(() => busyLoop(34), 500);
setTimeout(() => busyLoop(38), 1000);

setTimeout(() => {
  console.log(`busy loops: ${busy.join(", ")}`);
  for (const [name, times] of Object.entries(ticks)) console.log(`${name}  ${times.join(" ")}`);
  process.exit();
}, 2000);
