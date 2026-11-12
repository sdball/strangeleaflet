// A call to a worker thread, by hand: a request id, a timeout, late replies
// dropped, and calls failed if the worker dies. Then the same three cases as
// call-dies.exs and call-timeout.exs.

import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { setTimeout as sleep } from "node:timers/promises";

class Client {
  #worker;
  #next = 0;
  #pending = new Map();
  #gone = null;

  constructor(worker) {
    this.#worker = worker;
    worker.on("message", ({ id, reply }) => {
      const call = this.#pending.get(id);
      if (!call) return console.log(`  (dropped a late reply: ${reply})`);
      this.#pending.delete(id);
      clearTimeout(call.timer);
      call.resolve(reply);
    });
    worker.on("error", (error) => this.#fail(error));
    worker.on("exit", (code) => this.#fail(new Error(`worker exited, code ${code}`)));
  }

  call(request, timeout = 5000) {
    if (this.#gone) return Promise.reject(this.#gone);
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error("timeout"));
      }, timeout);
      this.#pending.set(id, { resolve, reject, timer });
      this.#worker.postMessage({ id, request });
    });
  }

  #fail(error) {
    this.#gone ??= error;
    for (const { reject, timer } of this.#pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.#pending.clear();
  }
}

if (isMainThread) {
  const client = new Client(new Worker(new URL(import.meta.url)));
  const call = async (request, timeout) => {
    try {
      console.log(`  reply: ${await client.call(request, timeout)}`);
    } catch (error) {
      console.log(`  failed: ${error.message}`);
    }
  };

  console.log(`node ${process.version}`);
  console.log("a call that gives up after 100 ms");
  await call("slow", 100);
  await sleep(500);
  console.log("a call while the worker crashes");
  await call("crash");
  console.log("a call after the worker is gone");
  await call("work");
} else {
  parentPort.on("message", async ({ id, request }) => {
    if (request === "slow") await sleep(300);
    if (request === "crash") {
      await sleep(100);
      throw new Error("oops");
    }
    parentPort.postMessage({ id, reply: "done" });
  });
}
