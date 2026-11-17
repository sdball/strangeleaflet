// pipeline.exs in Node, with streams. Events arrive 1,000 a second at a
// readable stream piped to a writable one that takes 2 ms over each, so
// it can handle 500 a second. The stream asks for more by calling read();
// events that arrive when it hasn't asked wait in a queue of up to 2,000,
// and past that they're dropped. Every second, report as pipeline.exs does.
// With "wait" (the default) the 2 ms is spent waiting, as on a slow disk
// or a slow client; with "busy" it's spent working on the main thread.
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as sleep } from "node:timers/promises";

// Keep busy for ms milliseconds by the clock, the way real work would
const busy = (ms) => { const until = performance.now() + ms; while (performance.now() < until); };
const mode = process.argv[2] ?? "wait";

const waiting = [];
let asked = false;
let dropped = 0;
const source = new Readable({
  objectMode: true,
  read() {
    // The stream wants more: give it what's waiting, until it says stop
    asked = true;
    while (asked && waiting.length) asked = this.push(waiting.shift());
  },
});
const arrive = (event) => {
  if (asked) asked = source.push(event);
  else if (waiting.length < 2_000) waiting.push(event);
  else dropped++;
};

let handled = 0;
const sink = new Writable({
  objectMode: true,
  write(event, _encoding, done) {
    if (mode === "busy") {
      busy(2);
      handled++;
      done();
    } else {
      setTimeout(() => { handled++; done(); }, 2);
    }
  },
});
pipeline(source, sink);

const start = performance.now();
const elapsed = () => performance.now() - start;
const pad = (x) => String(x).padStart(4);

// One event is due every millisecond since the start. Send whatever's
// due, then sleep until the next one.
console.log(`node ${process.version}, mode: ${mode}`);
let sent = 0;
for (let reportAt = 1000; reportAt <= 8000; ) {
  if (elapsed() >= reportAt) {
    const inFlight = sent - handled - waiting.length - dropped;
    console.log(
      `${pad(reportAt)} ms: arrived ${pad(sent)}, handled ${pad(handled)}, in flight ${pad(inFlight)},` +
        ` buffered ${pad(waiting.length)}, dropped ${pad(dropped)}`,
    );
    reportAt += 1000;
  } else if (sent < Math.floor(elapsed())) {
    arrive(++sent);
  } else {
    await sleep(1);
  }
}
process.exit(0);
