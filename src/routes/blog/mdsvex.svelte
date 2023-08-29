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

  import { DarkMode } from "flowbite-svelte";
  import { formatDate } from "$lib/blog/formatDateTime";
</script>

<DarkMode />

{#if layout === "blog"}
  <article class="all-prose mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal">
    <h1>{title}</h1>
    <p>Published: {formatDate(date)}</p>
    <slot />
  </article>
{/if}
