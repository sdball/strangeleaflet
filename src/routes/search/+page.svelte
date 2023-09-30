<script>
  export let data;
  import Navigation from "$lib/components/Navigation.svelte";
  import BlogListItem from "$lib/components/BlogListItem.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { SITE } from "$lib/constants.js";
  let title = "Search";
  $: if (data.term) {
    title = `Search for ${data.term}`;
  }
</script>

<svelte:head>
  <title>{SITE.title} - {title}</title>
  <meta property="og:title" content={title} />
</svelte:head>

<Navigation />

<main
  class="prose dark:prose-invert prose-p:mt-0 prose-p:mb-0 mt-12 pb-20 mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal"
>
  {#if data.term}
    <h1>Search results for {data.term}</h1>
    <h2>Most recent</h2>
    {#each data.items as item}
      <BlogListItem {item} class="mb-9" />
    {/each}
  {:else}
    <h1>Search</h1>
    <p>Start a search from the search input in the header.</p>
    <p>From that modal you can get a permalink to the search results.</p>
  {/if}
</main>

<Footer />
