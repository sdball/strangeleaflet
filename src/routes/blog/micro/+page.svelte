<script>
  export let data;

  import Navigation from "$lib/components/Navigation.svelte";
  import Footer from "$lib/components/Footer.svelte";

  import { SITE } from "$lib/constants.js";
  import MyAvatar from "$lib/components/MyAvatar.svelte";

  import { Timeline, TimelineItem } from "flowbite-svelte";

  let title = "Micro Blog";
  let displayTitle = "SELECT * FROM micro";

  function newDisplayTitle() {
    displayTitle = "sneaky";
  }
</script>

<svelte:head>
  <title>{SITE.title} - {title}</title>
  <meta property="og:title" content={title} />
</svelte:head>

<Navigation />

<main class="mt-12 pb-20 mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal">
  <div class="prose dark:prose-invert mb-12">
    <h1 class="font-mono">{displayTitle}</h1>
  </div>
  <Timeline order="vertical">
    {#each data.posts as post}
      <li class="list-none">
        <TimelineItem
          title={post.metadata.title}
          date={new Date(post.metadata.date).toLocaleString()}
        >
          <svelte:fragment slot="icon">
            <span
              class="flex absolute -left-3 justify-center items-center w-6 h-6 bg-primary-200 rounded-full ring-8 ring-white dark:ring-gray-900 dark:bg-primary-900"
            >
              <MyAvatar size="xs" class="w-3 h-3" />
            </span>
          </svelte:fragment>
          <p class="mb-1 text-base font-normal text-gray-500 dark:text-gray-400">
            {post.metadata.content}
          </p>
          <p class="mb-4 text-base font-normal text-blue-500 dark:text-blue-400">
            <a href={post.path}>permalink: {post.path}</a>
          </p>
        </TimelineItem>
      </li>
    {/each}
  </Timeline>
</main>

<Footer />
