<script>
  export let showSiteName = true;
  import {
    DarkMode,
    Navbar,
    NavBrand,
    NavLi,
    NavUl,
    NavHamburger,
    Tooltip,
    Dropdown,
    DropdownItem,
    DropdownDivider
  } from "flowbite-svelte";
  import { ChevronDownOutline } from "flowbite-svelte-icons";

  import StrangeLeafletSvg from "./StrangeLeafletSvg.svelte";
</script>

<Navbar let:hidden let:toggle rounded color="form">
  <NavBrand href="/">
    <StrangeLeafletSvg scale="0.1" />
    {#if showSiteName}
      <span class="ml-3 self-center whitespace-nowrap text-xl font-extrabold dark:text-white"
        >Strange Leaflet</span
      >
    {/if}
  </NavBrand>
  <NavUl {hidden}>
    <NavLi href="/">Home</NavLi>
    <NavLi href="/about">About Me</NavLi>
    <NavLi id="blogs-menu" class="cursor-pointer">
      Blogs<ChevronDownOutline class="w-3 h-3 ml-2 text-primary-800 dark:text-white inline" />
    </NavLi>

    <Dropdown triggeredBy="#blogs-menu" class="w-44 z-20">
      <DropdownItem href="/blog/posts">Posts</DropdownItem>
      <DropdownItem href="/blog/gitblog">Git Blog</DropdownItem>
      <DropdownDivider />
      <DropdownItem href="/blog">All</DropdownItem>
    </Dropdown>
  </NavUl>
  <div class="flex md:order-2">
    <DarkMode />
    <Tooltip>Toggle Dark Mode</Tooltip>
    <NavHamburger on:click={toggle} />
  </div>
</Navbar>
