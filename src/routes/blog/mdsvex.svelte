<script>
  /**
   * @type string
   */
  export let title;
  /**
   * @type string
   */
  export let date;

  export let data;
  export let form;
</script>

<article class="all-prose">
  <h1>{title}</h1>
  <p>Published: {date}</p>
  <slot />
</article>
