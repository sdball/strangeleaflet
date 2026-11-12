// A ticker prints every 100 ms. Press Enter to start a busy loop, fib(40):
// about a second of work each. Press Enter as often as you like. Type q and
// Enter (or Ctrl-C) to quit.
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

log("one event loop. Enter: busy loop. q, Enter: quit.");

let n = 0;
setInterval(() => log(`tick ${++n}`), 100);

let busy = 0;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  // Enters that arrived while the loop was busy come in together
  for (const line of chunk.split("\n").slice(0, -1)) {
    if (line.trim() === "q") process.exit(0);
    const b = ++busy;
    log(`busy loop ${b} starts`);
    fib(40);
    log(`busy loop ${b} ends`);
  }
});
process.stdin.on("end", () => process.exit(0));
