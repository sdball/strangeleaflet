// A ticker prints every 100 ms. At 350 ms a busy loop starts and runs for
// about a second. Does the ticker keep ticking?
//
//   node ticker.mjs

// The slow way on purpose: about 330 million calls for fib(40)
const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));

const start = performance.now();
const elapsed = () => performance.now() - start;

const log = (message, at = elapsed()) => {
  console.log(`${String(Math.floor(at)).padStart(4)} ms  ${message}`);
};

// n counts the ticks that ran. The clock says how many were due.
let n = 0;
const ticker = setInterval(() => {
  const at = elapsed();
  log(`tick ${++n} (${Math.floor(at / 100)} due)`, at);
}, 100);

setTimeout(() => {
  log("busy loop starts");
  fib(40);
  log("busy loop ends");
  setTimeout(() => clearInterval(ticker), 350);
}, 350);
