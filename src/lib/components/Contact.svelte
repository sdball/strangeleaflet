<script>
  import { Card, Avatar } from "flowbite-svelte";
  import { LinkedinSolid, BullhornSolid, GithubSolid, EnvelopeSolid } from "flowbite-svelte-icons";
</script>

<Card border={false} size="xl">
  <Avatar size="xl" src="/images/avatar.webp" />
  <h2 class="mb-1 text-xl font-medium text-gray-900 dark:text-white">Stephen Ball</h2>
  <div class="grid grid-cols-1 lg:flex lg:gap-x-9">
    <span class="text-sm text-gray-500 dark:text-gray-400">Programmer</span>
    <span class="text-sm text-gray-500 dark:text-gray-400">Systems Engineer</span>
    <span class="text-sm text-gray-500 dark:text-gray-400">Developer Tools</span>
    <span class="text-sm text-gray-500 dark:text-gray-400">Designer</span>
    <span class="text-sm text-gray-500 dark:text-gray-400">Speaker</span>
  </div>
  <div class="mt-5 prose dark:prose-invert">
    <slot />
  </div>
  <div class="flex flex-wrap gap-x-5 gap-y-8 pt-12 pb-5">
    <a href="https://www.linkedin.com/in/sdball/">
      <Card>
        <div class="flex flex-col justify-center gap-x-3 gap-y-5">
          <LinkedinSolid />
          <div>LinkedIn: sdball</div>
        </div></Card
      >
    </a>
    <a href="https://github.com/sdball">
      <Card>
        <div class="flex flex-col justify-center gap-x-3 gap-y-5">
          <GithubSolid />
          <div>GitHub: sdball</div>
        </div></Card
      >
    </a>
    <a href="https://genserver.social/sdball">
      <Card>
        <div class="flex flex-col justify-center gap-x-3 gap-y-5">
          <BullhornSolid />
          <div>Fediverse: @sdball@genserver.social</div>
        </div>
      </Card>
    </a>
    <Card class="cursor-text">
      <div class="flex flex-col justify-center gap-x-3 gap-y-5">
        <EnvelopeSolid />
        <div>Email: sdball@duck.com</div>
      </div></Card
    >
  </div>
</Card>
