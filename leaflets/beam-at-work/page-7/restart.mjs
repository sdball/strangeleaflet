// Node can't swap a running process's code, so a new version means a new
// process. A ticker process runs version 1, counting in memory; then version
// 2 replaces it, two ways:
//   restart: stop version 1, then start version 2
//   overlap: start version 2, wait until it's up, then stop version 1
// (node restart.mjs restart | overlap)

import { spawn } from "node:child_process";

if (process.argv[2] === "child") {
  // The ticker: three counters in this process's memory
  const version = process.argv[3];
  const counts = { a: 0, b: 0, c: 0 };
  console.log("up");
  setInterval(() => {
    for (const name of Object.keys(counts)) {
      counts[name] += 1;
      console.log(`${name} tick ${counts[name]}, version ${version}`);
    }
  }, 100);
} else {
  const mode = process.argv[2] ?? "restart";
  const start = performance.now();
  const log = (message) => console.log(`${String(Math.round(performance.now() - start)).padStart(5)} ms  ${message}`);

  // Start a ticker process; resolves once it says it's up
  const run = (version) => new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL(import.meta.url).pathname, "child", version]);
    let text = "";
    child.stdout.on("data", (data) => {
      text += data;
      let end;
      while ((end = text.indexOf("\n")) >= 0) {
        const line = text.slice(0, end);
        text = text.slice(end + 1);
        if (line === "up") {
          log(`version ${version} is up`);
          resolve(child);
        } else if (line.startsWith("a ")) {
          log(line); // a's ticks stand for all three
        }
      }
    });
  });

  log(`node ${process.version}, mode: ${mode}`);
  const one = await run("1");
  await new Promise((resolve) => setTimeout(resolve, 350));
  if (mode === "restart") {
    one.kill();
    log("stopped version 1");
    await run("2");
  } else {
    await run("2");
    one.kill();
    log("stopped version 1");
  }
  setTimeout(() => process.exit(), 350);
}
