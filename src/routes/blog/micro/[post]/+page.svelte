<script>
  export let data;
  import { fade } from "svelte/transition";
  import { quadInOut } from "svelte/easing";
  import { Timeline, TimelineItem } from "flowbite-svelte";
  import Navigation from "$lib/components/Navigation.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import MyAvatar from "$lib/components/MyAvatar.svelte";
  import { SITE } from "$lib/constants.js";
</script>

<Navigation />

<svelte:head>
  <title>{SITE.title} - Micro - {data.title}</title>
  <meta property="og:title" content={data.title} />
</svelte:head>

<div in:fade={{ duration: 300, easing: quadInOut }}>
  <main class="mt-12 pb-20 mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal">
    <Timeline order="vertical">
      <li class="list-none">
        <TimelineItem title={data.title} date={new Date(data.date).toLocaleString()}>
          <svelte:fragment slot="icon">
            <span
              class="flex absolute -left-3 justify-center items-center w-6 h-6 bg-primary-200 rounded-full ring-8 ring-white dark:ring-gray-900 dark:bg-primary-900"
            >
              <MyAvatar size="xs" />
            </span>
          </svelte:fragment>
          <p class="mb-1 text-base font-normal text-gray-500 dark:text-gray-400">
            {data.content}
          </p>
        </TimelineItem>
      </li>
    </Timeline>
  </main>
</div>

<Footer />
