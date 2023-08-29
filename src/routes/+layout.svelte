<script>
  export let data;
  import { fade } from "svelte/transition";
  import "../app.postcss";
</script>

{#key data.currentRoute}
  <main in:fade={{ duration: 150, delay: 150 }} out:fade={{ duration: 150 }}>
    <slot />
  </main>
{/key}
