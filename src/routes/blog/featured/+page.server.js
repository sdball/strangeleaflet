/** import { PageLoad } from "./[post]/$types"; */
export const load = async ({ fetch }) => {
  const response = await fetch(`/api/blog/featured`);
  const posts = await response.json();

  return {
    posts
  };
};
