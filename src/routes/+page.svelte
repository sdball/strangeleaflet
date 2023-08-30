<script>
  import { Heading, P, A } from "flowbite-svelte";
  import Navigation from "$lib/components/Navigation.svelte";
  import StrangeLeafletSvg from "$lib/components/StrangeLeafletSvg.svelte";
</script>

<Navigation />

<main
  class="prose dark:prose-invert mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal"
>
  <Heading class="mt-9">Strange Leaflet</Heading>
  <P>Hi there. Uh. Not much to see on the frontpage yet.</P>
  <P>You should probably head to <A href="/blog">the blog</A>.</P>
  <P
    >But since you're here, wanna see the SVG I made from scratch to be the favicon and logo? It's
    supposed to be some dotmatrix paper with "SL" in ASCII banner text.</P
  >
  <StrangeLeafletSvg />
  <P>Cool right? I hope so because did I mention I made it from scratch?</P>
  <P
    >Oh also since this whole site is running on Svelte/SvelteKit it was, like, almost no code to
    implement the animation for switching between pages. I hope it isn't too annoying.</P
  >
</main>
