/** import { PageLoad } from "./[post]/$types"; */
export const load = async ({ fetch, url }) => {
  let api = new URL(url);
  api.pathname = "/api/blog/search";
  const response = await fetch(api);
  const items = await response.json();

  return {
    term: api.searchParams.get("q"),
    items
  };
};
