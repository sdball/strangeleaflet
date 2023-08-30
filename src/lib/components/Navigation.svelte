<script>
  export let showSiteName = true;
  import { DarkMode, Navbar, NavBrand, NavLi, NavUl, NavHamburger, Tooltip } from "flowbite-svelte";
  import StrangeLeafletSvg from "./StrangeLeafletSvg.svelte";
</script>

<Navbar let:hidden let:toggle rounded color="form">
  <NavBrand href="/">
    <StrangeLeafletSvg scale="0.1" />
    {#if showSiteName}
      <span class="ml-3 self-center whitespace-nowrap text-xl font-semibold dark:text-white"
        >Strange Leaflet</span
      >
    {/if}
  </NavBrand>
  <NavUl {hidden}>
    <NavLi href="/">Home</NavLi>
    <NavLi href="/blog">Blog</NavLi>
    <NavLi href="/about">About Me</NavLi>
  </NavUl>
  <div class="flex md:order-2">
    <DarkMode />
    <Tooltip>Toggle Dark Mode</Tooltip>
    <NavHamburger on:click={toggle} />
  </div>
</Navbar>
