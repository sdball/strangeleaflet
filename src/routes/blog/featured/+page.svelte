<script>
  export let data;

  import Navigation from "$lib/components/Navigation.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import BlogListItem from "$lib/components/BlogListItem.svelte";

  import { SITE } from "$lib/constants.js";

  let title = "Featured Posts";
</script>

<svelte:head>
  <title>{SITE.title} - {title}</title>
  <meta property="og:title" content={title} />
</svelte:head>

<Navigation />

<main
  class="prose dark:prose-invert mt-12 pb-20 mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal"
>
  <h1>Featured</h1>
  <p>
    These are all posts that I've flagged as featured. There are <a href="/blog">many more posts</a>
    if you want more posts.
  </p>
  <ul>
    {#each data.posts as post}
      <li>
        <BlogListItem item={post} />
      </li>
    {/each}
  </ul>
</main>

<Footer />
