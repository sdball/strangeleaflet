<script>
  export let item;

  import { Badge } from "flowbite-svelte";

  import { formatDate } from "$lib/blog/formatDateTime";
</script>

<h2 class="mb-0">
  <a href={item.path}>
    {item.metadata.title}
  </a>
  {#if item.metadata.featured}
    <Badge>featured</Badge>
  {/if}
</h2>
<ul>
  <li>Published: {formatDate(item.metadata.date)}</li>
  <li>
    Categories:
    <div class="inline-flex gap-x-3 pl-1">
      {#each item.metadata.categories as category}
        <span>
          <Badge color="blue">{category}</Badge>
        </span>
      {/each}
    </div>
  </li>
  {#if item.metadata.layout === "gitblog"}
    <li>
      Repo: {item.metadata.repo}
    </li>
  {/if}
</ul>
