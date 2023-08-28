import { error } from "@sveltejs/kit";

export const load = async ({ params }) => {
  try {
    const post = (
      await Promise.all([
        import(`../../../lib/posts/${params.post}.svx`).catch((err) => null),
        import(`../../../lib/posts/${params.post}/index.svx`).catch((err) => null)
      ])
    ).find((p) => !!p);
    const { title, date } = post.metadata;
    const Content = post.default;

    return {
      title,
      date,
      Content
    };
  } catch (_err) {
    throw error(404, "Not Found");
  }
};
