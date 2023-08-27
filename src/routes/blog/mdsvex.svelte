<script>
  import { DarkMode } from "flowbite-svelte";
  /**
   * @type string
   */
  export let title;
  /**
   * @type string
   */
  export let date;

  export let data;
  export let form;
</script>

<DarkMode />

<main class="mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal">
  <article class="all-prose">
    <h1>{title}</h1>
    <p>Published: {date}</p>
    <slot />
  </article>
</main>
