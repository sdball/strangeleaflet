import { json } from "@sveltejs/kit";
import { fetchGitBlogs } from "$lib/blog/fetch";

export const GET = async () => {
  const posts = await fetchGitBlogs();
  return json(posts);
};
