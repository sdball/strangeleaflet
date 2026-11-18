// down.exs in Node: node remote.mjs
//
// Node has no nodes or remote processes, so the counter is another Node
// process, here on the same machine, with a TCP server, and the two talk
// in lines of JSON. Then it loses the counter's process three ways: the
// connection closes, the process stops answering, and the process exits.
import { spawn } from "node:child_process";
import { createServer, connect } from "node:net";

if (process.argv[2] === "counter") {
  // The counter's process: one count, kept for as long as the process runs
  let count = 0;
  const server = createServer((socket) => {
    let text = "";
    socket.on("data", (data) => {
      text += data;
      let end;
      while ((end = text.indexOf("\n")) >= 0) {
        const message = JSON.parse(text.slice(0, end));
        text = text.slice(end + 1);
        if (message.add) count += message.add;
        if (message.get) socket.write(JSON.stringify({ count }) + "\n");
        if (message.exit) process.exit();
      }
    });
    socket.on("error", () => {});
  });
  server.listen(0, () => console.log(server.address().port));
} else {
  const start = performance.now();
  const log = (text) => console.log(`${String(Math.round(performance.now() - start)).padStart(5)} ms  ${text}`);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)).then(() => log(`waited ${ms / 1000} s`));

  const child = spawn(process.execPath, [import.meta.filename, "counter"]);
  const port = await new Promise((resolve) => child.stdout.once("data", (data) => resolve(Number(data))));

  // A connection to the counter, logging everything that happens to it,
  // once it's connected
  const open = async () => {
    const socket = connect(port);
    let text = "";
    socket.on("data", (data) => {
      text += data;
      let end;
      while ((end = text.indexOf("\n")) >= 0) {
        log(`reply ${text.slice(0, end)}`);
        text = text.slice(end + 1);
      }
    });
    socket.on("error", (error) => log(`error ${error.code}`));
    socket.on("close", () => log("close"));
    await new Promise((resolve) => socket.once("connect", resolve));
    return socket;
  };
  const send = (socket, message) => socket.write(JSON.stringify(message) + "\n");

  let socket = await open();
  send(socket, { add: 5 });
  log(`counter in process ${child.pid}, at 5`);

  console.log("\nThe connection closes");
  socket.destroy();
  await wait(1000);
  socket = await open();
  send(socket, { get: true });
  await wait(1000);

  console.log("\nThe counter's process stops answering");
  child.kill("SIGSTOP");
  log("stopped the counter's process");
  send(socket, { add: 1 });
  send(socket, { add: 1 });
  log("sent { add: 1 } twice");
  await wait(6000);
  child.kill("SIGCONT");
  log("let the counter's process continue");
  send(socket, { get: true });
  await wait(1000);

  console.log("\nThe counter's process exits");
  send(socket, { exit: true });
  await wait(1000);
  send(socket, { get: true });
  await wait(3000);
}
