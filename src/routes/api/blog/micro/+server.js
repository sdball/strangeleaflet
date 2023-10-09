import { json } from "@sveltejs/kit";
import { fetchMicro } from "$lib/blog/fetch";

export const GET = async () => {
  const posts = await fetchMicro();
  return json(posts);
};
