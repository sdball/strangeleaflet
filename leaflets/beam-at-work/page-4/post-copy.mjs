// Post arrays of different sizes to a worker thread, and measure how long
// each postMessage took. Then an ArrayBuffer of 16 MB, posted, transferred,
// and as a SharedArrayBuffer.
import { Worker } from "node:worker_threads";

const worker = new Worker("setInterval(() => {}, 60_000);", { eval: true }); // stays up, never reads its messages
const time = (f) => {
  const start = performance.now();
  f();
  return performance.now() - start;
};
const us = (ms) => String(Math.round(ms * 1000)).padStart(5);

console.log(`node ${process.version}, posting to a worker that never reads`);
for (const n of [1_000, 10_000, 100_000, 1_000_000]) {
  const array = Array.from({ length: n }, (_, i) => i + 1);
  console.log(`array of ${String(n).padStart(9)}: postMessage took ${us(time(() => worker.postMessage(array)))} µs`);
}

const buffer = new ArrayBuffer(16_000_000);
console.log(`ArrayBuffer of 16 MB, copied:       ${us(time(() => worker.postMessage(buffer)))} µs, sender's still has ${buffer.byteLength} bytes`);
console.log(`ArrayBuffer of 16 MB, transferred:  ${us(time(() => worker.postMessage(buffer, [buffer])))} µs, sender's now has ${buffer.byteLength} bytes`);
const shared = new SharedArrayBuffer(16_000_000);
console.log(`SharedArrayBuffer of 16 MB, shared: ${us(time(() => worker.postMessage(shared)))} µs`);
await worker.terminate();
