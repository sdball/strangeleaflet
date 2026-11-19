// How long fib(40) takes in Node, three times.
const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));
for (let i = 0; i < 3; i++) {
  const start = performance.now();
  fib(40);
  console.log(`fib(40): Node ${Math.round(performance.now() - start)} ms`);
}
