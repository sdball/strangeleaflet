/** import { PageLoad } from "./[post]/$types"; */
export const load = async ({ fetch }) => {
  const response = await fetch(`/api/blog`);
  const posts = await response.json();

  return {
    posts
  };
};
