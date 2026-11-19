// Three tickers tick every 100 ms, a third of a beat apart. At 350 ms a busy
// loop starts and runs for about a second. Do the tickers keep ticking?
//
//   node ticker.mjs

// The slow way on purpose: about 330 million calls for fib(40)
const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));

const start = performance.now();
const elapsed = () => Math.floor(performance.now() - start);

// Each ticker starts `offset` ms in, then ticks every 100 ms and
// writes down when each tick ran.
const tickers = [["A", 0], ["B", 33], ["C", 67]].map(([name, offset]) => ({ name, offset, ticks: [] }));
for (const ticker of tickers) {
  setTimeout(() => {
    ticker.interval = setInterval(() => ticker.ticks.push(elapsed()), 100);
  }, ticker.offset);
}

setTimeout(() => {
  const from = elapsed();
  fib(40);
  const to = elapsed();
  setTimeout(() => {
    for (const ticker of tickers) clearInterval(ticker.interval);
    report(tickers, from, to, elapsed());
  }, 350);
}, 350);

// One column per ticker: when each tick ran, then how many were due by the end
const report = (tickers, from, to, end) => {
  const row = (label, cells) => console.log(String(label).padStart(4) + cells.map((c) => String(c).padStart(7)).join("").trimEnd());
  console.log(`busy loop ${from}–${to} ms, stopped at ${end} ms`);
  row("tick", tickers.map((t) => t.name));
  const rows = Math.max(...tickers.map((t) => t.ticks.length));
  for (let i = 0; i < rows; i++) row(i + 1, tickers.map((t) => t.ticks[i] ?? ""));
  row("due", tickers.map((t) => Math.floor((end - t.offset) / 100)));
};
