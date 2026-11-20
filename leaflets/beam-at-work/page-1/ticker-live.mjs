// A ticker prints every 100 ms. Press Enter to start a busy loop, fib(40):
// about a second of work each. Press Enter as often as you like. Press q (or
// Ctrl-C) to quit.
//
//   node ticker-live.mjs
//
// Reading the keyboard is a callback on the event loop too, so while a busy
// loop runs, your next Enter waits in line with everything else.

// The slow way on purpose: about 330 million calls for fib(40)
const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));

const start = performance.now();

const log = (message) => {
  const elapsed = Math.round(performance.now() - start);
  console.log(`${String(elapsed).padStart(5)} ms  ${message}`);
};

log("one event loop. Enter: busy loop. q: quit.");

let n = 0;
setInterval(() => log(`tick ${++n}`), 100);

let busy = 0;
// Raw mode hands over each key as it's pressed, without waiting for Enter.
// Ctrl-C arrives as a key then, instead of stopping the process.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  // Keys pressed while the loop was busy come in together
  for (const key of chunk) {
    if (key === "q" || key === "\x03") process.exit(0);
    if (key !== "\r" && key !== "\n") continue;
    const b = ++busy;
    log(`busy loop ${b} starts`);
    fib(40);
    log(`busy loop ${b} ends`);
  }
});
process.stdin.on("end", () => process.exit(0));
