<script>
  import { page } from "$app/stores";
  import { fly } from "svelte/transition";
  import { tick } from "svelte";

  import { Button, Search, Modal } from "flowbite-svelte";
  import { SearchOutline } from "flowbite-svelte-icons";

  import { searchAll } from "$lib/blog/search";
  import BlogListItem from "./BlogListItem.svelte";

  let searchOpen = false;
  let searchTerm = "";

  /**
   * @type {any[]}
   */
  let searchResults = [];

  /**
   * @type {URL}
   */
  let searchURL;

  async function handleSearch() {
    if (searchTerm) {
      searchURL = $page.url;
      searchURL.pathname = "/search";
      searchURL.searchParams.set("q", searchTerm);
      searchResults = await searchAll(searchTerm);
    } else {
      searchResults = [];
    }
  }

  $: (async () => {
    if (searchOpen) {
      await tick();
      document.getElementById("site-search")?.focus();
    }
  })();
</script>

<Modal title="Search: {searchTerm}" bind:open={searchOpen} outsideclose>
  <Search id="site-search" bind:value={searchTerm} on:input={handleSearch} />
  {#if searchTerm && searchResults.length > 0}
    <a href={searchURL.href} class="block underline" on:click={() => (searchOpen = false)}
      >permalink to these results</a
    >
  {/if}
  {#key searchTerm}
    <div
      class="prose dark:prose-invert prose-p:mt-0 prose-p:mb-0 mt-12 pb-20 mx-auto max-w-[90ch] relative break-normal"
      in:fly={{ delay: 200, duration: 200, x: 200 }}
    >
      <ul class="list-none">
        {#each searchResults as result}
          <li class="py-0 my-0">
            <BlogListItem item={result} />
          </li>
        {/each}
      </ul>
    </div>
  {/key}
</Modal>

<div>
  <Button
    color="none"
    data-collapse-toggle="mobile-menu-3"
    aria-controls="mobile-menu-3"
    aria-expanded="false"
    class="md:hidden text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5 mr-1"
    on:click={() => {
      searchOpen = true;
    }}
  >
    <SearchOutline class="w-5 h-5" />
  </Button>
  <div class="hidden relative md:block">
    <Search
      on:click={() => {
        searchOpen = true;
      }}
    />
  </div>
</div>
