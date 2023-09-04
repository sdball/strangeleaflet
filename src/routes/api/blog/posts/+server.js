import { json } from "@sveltejs/kit";
import { fetchPosts } from "$lib/blog/fetch";

export const GET = async () => {
  const posts = await fetchPosts();
  return json(posts);
};
