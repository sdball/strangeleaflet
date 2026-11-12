// Node's cheapest unit of waiting: N async functions, each paused on a promise
// that a later "message" would resolve. Measure time and V8 heap per one.
const n = Number(process.argv[2] ?? 100000);
const wake = [];
const waiter = async () => { await new Promise((resolve) => wake.push(resolve)); };

global.gc();
const heap0 = process.memoryUsage().heapUsed;
const t0 = performance.now();
const tasks = [];
for (let i = 0; i < n; i++) tasks.push(waiter());
const us = (performance.now() - t0) * 1000;
global.gc();
const heap = process.memoryUsage().heapUsed - heap0;
console.log(`${n} pending async functions: ${(us / n).toFixed(2)} µs each to start, ${Math.round(heap / n)} bytes each of V8 heap`);
wake.forEach((resolve) => resolve());
await Promise.all(tasks);
