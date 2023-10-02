<script>
  import { Avatar, Badge } from "flowbite-svelte";
  import Navigation from "$lib/components/Navigation.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import Contact from "$lib/components/Contact.svelte";
  import { SITE } from "$lib/constants";
  let title = "About Me (Stephen Ball)";
</script>

<svelte:head>
  <title>{SITE.title} - {title}</title>
  <meta name="title" property="og:title" content={title} />
  <meta name="image" property="og:image" content={SITE.avatar} />
</svelte:head>

<Navigation />

<main class="mt-12 pb-20 mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal">
  <div class="prose dark:prose-invert">
    <h1>About Me</h1>
  </div>
  <Contact>
    <h2>Hello</h2>
    <p>Hi. I'm Stephen Ball</p>
    <p>I've had some kind of online presence on the Internet for over 25 years now.</p>
    <p>
      This Svelte/SvelteKit site is my latest foray into having some kind of space on the web to
      call mine.
    </p>

    <h2>Talks</h2>

    <p>
      <a rel="external" href="https://vimeo.com/72762735">Deliberate Git</a> &mdash; Steel City Ruby,
      2013
    </p>

    <p>
      Power Up Your Prompt! &mdash; Abstractions, 2016
      <Badge class="ml-3" color="yellow">Unrecorded</Badge>
    </p>

    <p>
      Follow Your Feedback &mdash; Abstractions II, 2019
      <Badge class="ml-3" color="yellow">Unrecorded</Badge>
    </p>
    <blockquote>
      What do programming tests, command line tools, and technical interviews all have in common?
      They're all feedback systems! We'll dive through these three systems and explore how they are
      each more than their direct results. What tests say about the system itself, where command
      line tools fit in their larger ecosystem, and how to categorize and approach technical
      interviews.
    </blockquote>

    <p>
      <a href="https://youtu.be/Yw_EqX_KAw4">Livebook Smart Cells are Amazing</a> &mdash; ElixirConf,
      2022
    </p>

    <h2>Posts on company blogs</h2>
    <a href="https://medium.com/spreedly-engineering/youre-smart-enough-for-elixir-e33257a7f062"
      >You're Smart Enough for Elixir</a
    >
    &mdash; Spreedly, 2017
    <blockquote>
      Elixir seemed like a scary, fascinating, almost unbelievable world. Serving web requests by
      creating a new server for each individual request? Madness! No data mutation? Isn’t that what
      data, you know, does? Processes that supervise other processes? How does that even work?
    </blockquote>

    <a href="https://medium.com/spreedly-engineering/from-riak-to-kafka-part-i-ca56492d5a01"
      >From Riak to Kafka: Part I</a
    >
    &mdash; Spreedly, 2017
    <blockquote>
      I describe the implementation details of how Spreedly reliably and efficiently produces data
      from Riak to Kafka. I walk through the technical challenges and approaches I considered before
      landing on writing a postcommit hook in Riak paired with an Elixir application to produce data
      to Kafka with high availability and fault tolerance.
    </blockquote>

    <h2>Other Sites</h2>
    <p>
      I have a fun time comparision site: <a href="https://furtherfrom.com">Further From</a>
      and a couple of movie terminals in JavaScript at
      <a href="https://movieterminals.com">Movie Terminals</a>
    </p>
  </Contact>
</main>

<Footer />
