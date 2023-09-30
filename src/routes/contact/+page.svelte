<script>
  import { Card, Dropdown, DropdownItem, Avatar, Button } from "flowbite-svelte";
  import Navigation from "$lib/components/Navigation.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { LinkedinSolid, BullhornSolid, GithubSolid, EnvelopeSolid } from "flowbite-svelte-icons";
  import { SITE } from "$lib/constants";
  let title = "Contact";
</script>

<svelte:head>
  <title>{SITE.title} - {title}</title>
  <meta property="og:title" content={title} />
</svelte:head>

<Navigation />

<main
  class="prose dark:prose-invert mt-12 pb-20 mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal"
>
  <div>
    <Card border={false} size="xl">
      <Avatar size="xl" src="/images/avatar.webp" />
      <h5 class="mb-1 text-xl font-medium text-gray-900 dark:text-white">Stephen Ball</h5>
      <div class="grid grid-cols-1">
        <span class="text-sm text-gray-500 dark:text-gray-400">Programmer</span>
        <span class="text-sm text-gray-500 dark:text-gray-400">Systems Engineer</span>
        <span class="text-sm text-gray-500 dark:text-gray-400">Designer</span>
      </div>
      <div class="flex flex-wrap gap-x-5 gap-y-8 pt-12 pb-5">
        <Card>
          <div class="flex flex-col justify-center gap-x-3 gap-y-5">
            <LinkedinSolid />
            <div>
              LinkedIn:

              <a href="https://www.linkedin.com/in/sdball/">sdball</a>
            </div>
          </div></Card
        >
        <Card>
          <div class="flex flex-col justify-center gap-x-3 gap-y-5">
            <GithubSolid />
            <div>
              GitHub:

              <a href="https://github.com/sdball">sdball</a>
            </div>
          </div></Card
        >
        <Card>
          <div class="flex flex-col justify-center gap-x-3 gap-y-5">
            <BullhornSolid />
            <div>
              Fediverse:

              <a href="https://genserver.social/sdball">@sdball@genserver.social</a>
            </div>
          </div></Card
        >
        <Card>
          <div class="flex flex-col justify-center gap-x-3 gap-y-5">
            <EnvelopeSolid />
            <div>Email: sdball@duck.com</div>
          </div></Card
        >
      </div>
    </Card>
  </div>
</main>

<Footer />
