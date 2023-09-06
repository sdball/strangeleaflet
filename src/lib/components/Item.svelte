<script>
  /**
   * @typedef Metadata
   * @prop {string} date
   * @prop {string} title
   * @prop {string} layout
   *
   * @typedef {Object} Item
   * @prop {string} path
   * @prop {Metadata} metadata
   */

  /**
   * @type Item
   */
  export let item;

  let className = "";
  export { className as class };

  import { formatDate } from "$lib/blog/formatDateTime";
</script>

<div class={className}>
  <a href={item.path}>
    {item.metadata.title}
  </a>

  <p>Published {formatDate(item.metadata.date)}</p>
  <p>Blog: {item.metadata.layout === "blog" ? "Posts" : "Git Blogs"}</p>
</div>
