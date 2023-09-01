import { error } from "@sveltejs/kit";

/**
 *
 * @param {{params: { post: string }}} param0
 */
export const load = async ({ params }) => {
  try {
    const post = (
      await Promise.all([
        import(`../../../lib/blog/posts/${params.post}.svx`).catch((err) => null),
        import(`../../../lib/blog/posts/${params.post}/index.svx`).catch((err) => null)
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
