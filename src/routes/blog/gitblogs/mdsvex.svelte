<script>
  export let title;
  export let date;
  export let layout;
  export let categories;
  export let repo;

  import Categories from "$lib/components/Categories.svelte";

  import { formatDate } from "$lib/blog/formatDateTime";

  import { SITE } from "$lib/constants";
</script>

<svelte:head>
  <title>{SITE.title} - {title}</title>
  <meta property="og:title" content={title} />
</svelte:head>

{#if layout === "gitblog"}
  <article
    class="prose dark:prose-invert mx-auto max-w-[90ch] mt-12 px-4 pb-20 relative sm:px-6 lg:px-8 break-normal"
  >
    <h1>{title}</h1>
    <p>Published: {formatDate(date)}</p>
    <p><Categories {categories} /></p>
    <p>Repo: {repo}</p>
    <hr />
    <slot />
  </article>
{/if}
