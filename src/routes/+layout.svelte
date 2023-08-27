<script>
  import { DarkMode } from "flowbite-svelte";
  import "../app.postcss";
</script>

<DarkMode />

<main class="mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal">
  <slot />
</main>
