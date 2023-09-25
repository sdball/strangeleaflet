<script>
  import { Range, Label, Card } from "flowbite-svelte";
  let n = 5;

  function exampleValue(length) {
    const base2 = Array.from({ length }, () => Math.floor(Math.random() * 2)).join("");
    const base10 = parseInt(base2, 2);
    return `${base2} = ${base10}`;
  }
</script>

<Card class="w-full max-w-md">
  <div class="mb-3">
    <Label>Bitfield length: {n}</Label>
    <Range id="range-n" min="1" max="31" bind:value={n} />
  </div>

  <p class="m-0">Range of base-10 values: <code>0...{2 ** n - 1}</code></p>

  <p class="m-0">Number of possible values: <code>{2 ** n}</code></p>
  <p class="m-0">Example bitfield values</p>
  <pre>{exampleValue(n)}
{exampleValue(n)}
{exampleValue(n)}</pre>
</Card>
