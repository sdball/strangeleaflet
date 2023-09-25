<script>
  import { fade, slide } from "svelte/transition";
  import { Radio } from "flowbite-svelte";

  let data1 = {
    priority: "urgent",
    location: "Room 71",
    status: "empty",
    candy: "peppermint patties"
  };

  let data2 = ["urgent", "Room 71", "empty", "peppermint patties"];

  let data3 = [3, 71, 1, 0];

  let data4 = 7288;

  let n = 1;

  $: data = lookupData(n);

  function lookupData(n) {
    switch (n) {
      case 1:
        return data1;
      case 2:
        return data2;
      case 3:
        return data3;
      case 4:
        return data4;
    }
  }
</script>

<div class="grid items-start">
  {#key n}
    <div in:fade out:slide={{ duration: 500, delay: 100, axis: "x" }} style="grid-area: 1/1/2/2;">
      <pre style="min-height: 12em;">{JSON.stringify(data, null, 2)}</pre>
    </div>
  {/key}
</div>

<div class="grid grid-cols-4 gap-2">
  <div class="rounded border border-gray-200 dark:border-gray-700">
    <Radio name="bordered" class="w-full p-4" value={1} bind:group={n}>JSON</Radio>
  </div>
  <div class="rounded border border-gray-200 dark:border-gray-700">
    <Radio name="bordered" class="w-full p-4" value={2} bind:group={n}>No keys</Radio>
  </div>
  <div class="rounded border border-gray-200 dark:border-gray-700">
    <Radio name="bordered" class="w-full p-4" value={3} bind:group={n}>Limited values</Radio>
  </div>
  <div class="rounded border border-gray-200 dark:border-gray-700">
    <Radio name="bordered" class="w-full p-4" value={4} bind:group={n}>Bitfield</Radio>
  </div>
</div>
