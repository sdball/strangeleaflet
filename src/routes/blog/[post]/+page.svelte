<script>
  export let data;
  import { fade } from "svelte/transition";
  import { quadInOut } from "svelte/easing";
  import Navigation from "$lib/components/Navigation.svelte";
  let Content;
  $: {
    Content = data.Content;
  }
</script>

<Navigation />

{#key data.currentRoute}
  <div in:fade={{ duration: 300, easing: quadInOut }}>
    <Content />
  </div>
{/key}
