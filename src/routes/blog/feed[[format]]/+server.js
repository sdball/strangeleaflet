import { Feed } from "feed";

import { fetchAll } from "$lib/blog/fetch";

import { generateFeed } from "$lib/blog/generateFeed.js";

export const prerender = true;

export async function GET({ setHeaders, params }) {
  const headers = {
    "Cache-Control": "max-age=0, s-maxage=3600",
    "Content-Type": "application/xml"
  };

  const { format } = params;
  const items = await fetchAll();
  const feed = generateFeed(items, format);
  return new Response(feed);
}
