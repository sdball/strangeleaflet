import { error } from "@sveltejs/kit";

export const load = async ({ params }) => {
  try {
    const post = await import(`../../../../lib/blog/micro/${params.post}.svx`);
    const { title, date, content, categories } = post.metadata;

    return {
      title,
      date,
      content,
      categories
    };
  } catch (_err) {
    throw error(404, "Not Found");
  }
};
