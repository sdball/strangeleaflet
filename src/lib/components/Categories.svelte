<script>
  export let categories;
  import { Badge } from "flowbite-svelte";
</script>

<div>
  Categories:
  <div class="inline-flex gap-x-3 pl-1">
    {#each categories as category}
      <span>
        <Badge color="blue">{category}</Badge>
      </span>
    {/each}
  </div>
</div>
