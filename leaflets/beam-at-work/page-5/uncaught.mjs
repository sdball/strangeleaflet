// alone.exs in Node: three counters, once every 100 ms, and one of them
// throws. With no handler, the uncaught exception ends the whole process.
// Run with "handler" to add an 'uncaughtException' handler, or "async" to
// throw from an async function instead.

const mode = process.argv[2] ?? "default";
console.log(`node ${process.version}, mode: ${mode}`);

if (mode === "handler") {
  process.on("uncaughtException", (err) => console.log(`uncaughtException: ${err.message}`));
}
process.on("exit", (code) => console.log(`process exiting, code ${code}`));

const count = (name, crashAt) => {
  let n = 0;
  const timer = setInterval(async () => {
    n += 1;
    if (n === crashAt) {
      clearInterval(timer);
      if (mode === "async") await Promise.reject(new Error(`${name} crashed at ${n}`));
      throw new Error(`${name} crashed at ${n}`);
    }
    console.log(`${name}: ${n}`);
  }, 100);
  return timer;
};

const timers = [count("a"), count("b", 3), count("c")];

setTimeout(() => {
  console.log("still running at 550 ms");
  timers.forEach(clearInterval);
}, 550);
