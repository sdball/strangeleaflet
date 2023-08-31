import { fetchPosts } from "$lib/blog/fetchPosts";
import { json } from "@sveltejs/kit";

export const GET = async () => {
  const posts = (await fetchPosts())
    .map(({ path: filepath, metadata }) => {
      let urlpath = filepath
        .replace(/^\/src\/lib/, "")
        .replace(/\.svx$/, "")
        .replace(/\/index$/, "");

      const { layout, ...meta } = metadata;

      return {
        path: urlpath,
        metadata: {
          ...meta,
          date: new Date(meta.date)
        }
      };
    })
    .sort((a, b) => {
      return b.metadata.date - a.metadata.date;
    });
  return json(posts);
};
