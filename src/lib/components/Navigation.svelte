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

  import StrangeLeafletSvg from "$lib/components/StrangeLeafletSvg.svelte";
  import Search from "$lib/components/Search.svelte";
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
      <DropdownItem href="/blog/gitblogs">Git Blogs</DropdownItem>
      <DropdownItem href="/blog/micro">Micro</DropdownItem>
      <DropdownDivider />
      <DropdownItem href="/blog/featured">Featured</DropdownItem>
      <DropdownDivider />
      <DropdownItem href="/blog">All</DropdownItem>
    </Dropdown>

    <NavLi id="feeds-menu" class="cursor-pointer">
      Feeds<ChevronDownOutline class="w-3 h-3 ml-2 text-primary-800 dark:text-white inline" />
    </NavLi>
    <Dropdown triggeredBy="#feeds-menu" class="w-44 z-20">
      <DropdownItem href="/blog/feed.atom">Blogs only - atom</DropdownItem>
      <DropdownItem href="/blog/feed.json">Blogs only - json</DropdownItem>
      <DropdownItem href="/blog/feed.json">Blogs only - rss</DropdownItem>
      <DropdownDivider />
      <DropdownItem href="/feed.atom">All - atom</DropdownItem>
      <DropdownItem href="/feed.json">All - json</DropdownItem>
      <DropdownItem href="/feed.json">All - rss</DropdownItem>
    </Dropdown>
  </NavUl>

  <div class="flex md:order-2 gap-x-2">
    <Search />
    <DarkMode />
    <Tooltip>Toggle Dark Mode</Tooltip>

    <NavHamburger on:click={toggle} />
  </div>
</Navbar>
