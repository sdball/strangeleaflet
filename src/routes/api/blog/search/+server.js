import { json } from "@sveltejs/kit";
import { searchAll } from "$lib/blog/search";

export const GET = async (params) => {
  const q = params.url.searchParams.get("q");
  if (q) {
    const results = await searchAll(q);
    return json(results);
  } else {
    return json([]);
  }
};
