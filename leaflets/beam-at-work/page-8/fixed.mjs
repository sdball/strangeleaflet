// Page 1's ticker in Node, with what it takes to make it behave like the
// BEAM's: a steady interval, where each tick is due at start + n * period
// and every tick that came due while the thread was busy still runs, late;
// and the busy loop moved off the main thread into a worker thread.
//   node fixed.mjs main        steady ticker, busy loop on the main thread
//   node fixed.mjs worker      steady ticker, busy loop in a worker thread
//   node fixed.mjs intervals   four intervals, made steady
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));

// Like setInterval, except that tick n is due at start + n * period, and a
// tick that came due while the thread was busy runs late instead of not at all
const steadyInterval = (period, onTick) => {
  const start = performance.now();
  let n = 0;
  let timer;
  const fire = () => {
    while (start + (n + 1) * period <= performance.now()) onTick(++n);
    timer = setTimeout(fire, start + (n + 1) * period - performance.now());
  };
  timer = setTimeout(fire, period);
  return () => clearTimeout(timer);
};

if (!isMainThread) {
  parentPort.postMessage(fib(workerData));
} else {
  const mode = process.argv[2] ?? "main";
  const start = performance.now();
  const elapsed = () => performance.now() - start;
  const log = (message, at = elapsed()) => console.log(`${String(Math.floor(at)).padStart(4)} ms  ${message}`);

  if (mode === "intervals") {
    // A, B, and D every 100 ms and C every 150 ms, each starting a little
    // after the last, with busy loops at 500 and 1000 ms
    const now = () => Math.round(elapsed());
    const ticks = { A: [], B: [], D: [], C: [] };
    for (const [name, offset, every] of [["A", 0, 100], ["B", 40, 100], ["D", 90, 100], ["C", 20, 150]]) {
      setTimeout(() => steadyInterval(every, () => ticks[name].push(now())), offset);
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
  } else {
    // As page 1's ticker.mjs: n counts the ticks that ran, the clock says how many were due
    const stop = steadyInterval(100, (n) => {
      const at = elapsed();
      log(`tick ${n} (${Math.floor(at / 100)} due)`, at);
    });
    setTimeout(() => {
      log("busy loop starts");
      const done = () => {
        log("busy loop ends");
        setTimeout(stop, 350);
      };
      if (mode === "main") {
        fib(40);
        done();
      } else {
        new Worker(new URL(import.meta.url), { workerData: 40 }).once("message", done);
      }
    }, 350);
  }
}
