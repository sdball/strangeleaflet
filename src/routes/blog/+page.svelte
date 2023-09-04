<script>
  export let data;

  import { formatDate } from "$lib/blog/formatDateTime.js";
  import Navigation from "$lib/components/Navigation.svelte";
</script>

<Navigation />

<main
  class="prose dark:prose-invert mt-12 pb-20 mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal"
>
  <h1>All Posts and Git Blogs</h1>
  <ul>
    {#each data.posts as post}
      <li>
        <h2>
          <a href={post.path}>
            {post.metadata.title}
          </a>
        </h2>
        Published {formatDate(post.metadata.date)}
      </li>
    {/each}
  </ul>
</main>
