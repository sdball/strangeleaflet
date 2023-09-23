import { json } from "@sveltejs/kit";
import { fetchAll, featured } from "$lib/blog/fetch";

export const GET = async () => {
  const items = await fetchAll();
  return json(featured(items));
};
