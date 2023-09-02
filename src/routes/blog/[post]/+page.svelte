<script>
  export let data;
  import { fade } from "svelte/transition";
  import { quadInOut } from "svelte/easing";
  import Navigation from "$lib/components/Navigation.svelte";

  /** @type {import("svelte").ComponentType } */
  let Content;
  $: {
    Content = data.Content;
  }
</script>

<Navigation />

<div in:fade={{ duration: 300, easing: quadInOut }}>
  <svelte:component this={Content} />
</div>
