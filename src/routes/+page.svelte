<script>
  import { Heading, P, A } from "flowbite-svelte";
  import Navigation from "$lib/components/Navigation.svelte";
</script>

<Navigation />

<main class="mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal">
  <Heading class="mt-9">Strange Leaflet</Heading>
  <P class="py-3">Hi there. Uh. Not much to see on the frontpage yet.</P>
  <P class="py-3">You should probably head to <A href="/blog">the blog</A>.</P>
</main>
