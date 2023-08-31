<script>
  /**
   * @type string
   */
  export let title;
  /**
   * @type string
   */
  export let date;

  /**
   * @type string
   */
  export let layout;

  import { formatDate } from "$lib/blog/formatDateTime";
  import Navigation from "$lib/components/Navigation.svelte";
</script>

<Navigation />

{#if layout === "blog"}
  <article
    class="prose dark:prose-invert mx-auto max-w-[90ch] px-4 pb-20 relative sm:px-6 lg:px-8 break-normal"
  >
    <h1>{title}</h1>
    <p>Published: {formatDate(date)}</p>
    <slot />
  </article>
{/if}
