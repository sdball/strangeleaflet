export const load = async ({ fetch }) => {
  const response = await fetch(`/api/blog/micro`);
  const posts = await response.json();
  return {
    posts
  };
};
