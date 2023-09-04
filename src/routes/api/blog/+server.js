import { json } from "@sveltejs/kit";
import { fetchAll } from "$lib/blog/fetch";

export const GET = async () => {
  const posts = await fetchAll();
  return json(posts);
};
