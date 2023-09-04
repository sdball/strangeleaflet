<script>
  export let data;
  import Navigation from "$lib/components/Navigation.svelte";
  import Item from "$lib/components/Item.svelte";
</script>

<Navigation />

<main
  class="prose dark:prose-invert prose-p:mt-0 prose-p:mb-0 mt-12 pb-20 mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal"
>
  <h1>Search results for {data.term}</h1>
  <h2>Most recent</h2>
  {#each data.items as item}
    <Item {item} class="mb-9" />
  {/each}
</main>
