<script>
  import { Avatar } from "flowbite-svelte";
  import Navigation from "$lib/components/Navigation.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { SITE } from "$lib/constants";
  let title = "About Me (Stephen Ball)";
</script>

<svelte:head>
  <title>{SITE.title} - {title}</title>
  <meta name="title" property="og:title" content={title} />
  <meta name="image" property="og:image" content={SITE.avatar} />
</svelte:head>

<Navigation />

<main
  class="prose dark:prose-invert mt-12 pb-20 mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal"
>
  <Avatar size="xl" src="/images/avatar.webp" />
  <h1>About Me</h1>
  <p>Hi. I'm Stephen Ball</p>
  <p>
    I've had some kind of online presence on the Internet for over 25 years now. My <a
      href="/contact">Contact page</a
    > has more details.
  </p>
  <p>
    This Svelte/SvelteKit site is my latest foray into having some kind of space on the web to call
    mine.
  </p>
  <p>
    I also have a fun time comparision site: <a href="https://furtherfrom.com">Further From</a> and
    a couple of movie terminals in JavaScript at
    <a href="https://movieterminals.com">Movie Terminals</a>
  </p>
</main>

<Footer />
