<script>
  import { onMount } from "svelte";

  import { Card, Range, Label } from "flowbite-svelte";

  let bitfield = 21332;
  let asBinary = "";
  let asCharacters = "";
  let as16BitInt = 0;
  let asTwo8BitInts = "";

  const convert = (bitfield) => {
    const leftEight = bitfield >> 8;
    const rightEight = bitfield & 0b11111111;

    // as binary
    asBinary = bitfield.toString(2).padStart(16, "0");

    // as characters
    let firstChar = String.fromCharCode(leftEight);
    let secondChar = String.fromCharCode(rightEight);
    asCharacters = `${firstChar} and ${secondChar}`;

    // as 16-bit Integer
    as16BitInt = bitfield;

    // to two 8-bit Integers
    asTwo8BitInts = `${leftEight} and ${rightEight}`;
  };

  // Run the conversion function on mount and whenever bitString changes
  onMount(() => {
    convert(bitfield);
  });
  $: convert(bitfield);
</script>

<Card>
  <div>
    <Label for="bitfield-explorer" class="mb-2">16 digit bitfield</Label>
    <Range min="0" max={0b1111111111111111} id="bitfield-explorer" bind:value={bitfield} />
  </div>
  <div>
    <strong>Binary (Base-2)</strong>
    <code>{asBinary}</code>
  </div>
  <div>
    <strong>As one 16-bit integer:</strong>
    {as16BitInt}
  </div>
  <div>
    <strong>As two characters:</strong>
    {asCharacters}
  </div>
  <div>
    <strong>As two 8-bit integers:</strong>
    {asTwo8BitInts}
  </div>
</Card>
