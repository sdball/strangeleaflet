import { error } from "@sveltejs/kit";

/** import type { PageLoad } from './$types'; */
export const load = async ({ params }) => {
  try {
    const post = (
      await Promise.all([
        import(`../../../../lib/blog/gitblogs/${params.post}.svx`).catch((err) => null),
        import(`../../../../lib/blog/gitblogs/${params.post}/index.svx`).catch((err) => null)
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
    console.error(_err);
    throw error(404, "Not Found");
  }
};
