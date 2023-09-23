<script>
  export let data;

  import { formatDate } from "$lib/blog/formatDateTime.js";
  import Navigation from "$lib/components/Navigation.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import BlogListItem from "$lib/components/BlogListItem.svelte";
</script>

<Navigation />

<main
  class="prose dark:prose-invert mt-12 pb-20 mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal"
>
  <h1>Featured</h1>
  <ul>
    {#each data.posts as post}
      <li>
        <BlogListItem item={post} />
      </li>
    {/each}
  </ul>
</main>

<Footer />
