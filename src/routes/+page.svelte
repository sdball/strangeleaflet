<script>
  import { DarkMode, Alert, Heading, P } from "flowbite-svelte";
  import StrangeLeaflet from "$lib/components/StrangeLeaflet.svelte";
</script>

<DarkMode />

<main class="mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal">
  <div class="flex justify-around">
    <StrangeLeaflet scale="0.25" />
  </div>

  <div class="p-8">
    <Alert>
      <span class="font-medium">Info alert!</span>
      Change a few things up and try submitting again.
    </Alert>
  </div>

  <Heading>StrangeLeaflet</Heading>
  <P>Hi there</P>
</main>
