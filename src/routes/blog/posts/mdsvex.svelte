<script>
  export let title;
  export let date;
  export let categories;
  export let description;
  export let featured;

  import { Badge } from "flowbite-svelte";

  import Categories from "$lib/components/Categories.svelte";

  import { formatDate } from "$lib/blog/formatDateTime";

  import { SITE } from "$lib/constants";
</script>

<svelte:head>
  <title>{SITE.title} - {title}</title>
  <meta property="og:title" content={title} />
  {#if description}
    <meta name="description" property="og:description" content={description} />
  {/if}
</svelte:head>

<article
  class="prose dark:prose-invert mx-auto max-w-[90ch] mt-12 px-4 pb-20 relative sm:px-6 lg:px-8 break-normal"
>
  <h1>{title}</h1>
  <p class="mb-0 pb-0">Published: {formatDate(date)}</p>
  <p class="my-0 py-0"><Categories {categories} /></p>
  {#if featured}
    <Badge>featured</Badge>
  {/if}
  <hr />
  <slot />
</article>
