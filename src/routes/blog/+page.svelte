<script>
  export let data;

  import { formatDate } from "$lib/blog/formatDateTime.js";
</script>

<h1>Strange Leaflet / Blog</h1>

<ul>
  {#each data.posts as post}
    <li>
      <h2>
        <a href={post.path}>
          {post.metadata.title}
        </a>
      </h2>
      Published {formatDate(post.metadata.date)}
    </li>
  {/each}
</ul>
