<script>
  export let data;
  import { fade, fly } from "svelte/transition";
  import Navigation from "$lib/components/Navigation.svelte";
  const { Content } = data;
</script>

<Navigation />

<div in:fly={{ duration: 300, y: 200 }} out:fly={{ duration: 300, x: 200 }}>
  <Content />
</div>
