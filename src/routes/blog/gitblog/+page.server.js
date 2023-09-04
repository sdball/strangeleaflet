/** import { PageLoad } from "./[post]/$types"; */
export const load = async ({ fetch }) => {
  const response = await fetch(`/api/blog/gitblogs`);
  const posts = await response.json();

  return {
    posts
  };
};
