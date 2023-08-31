import { vitePreprocess } from "@sveltejs/kit/vite";
import adapter from "@sveltejs/adapter-node";
import { mdsvex } from "mdsvex";
import relativeImages from "mdsvex-relative-images";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  extensions: [".svelte", ".svx"],
  preprocess: [
    mdsvex({
      smartypants: {
        ellipses: true,
        dashes: "oldschool"
      },
      layout: {
        blog: "src/routes/blog/mdsvex.svelte"
      },
      remarkPlugins: [relativeImages]
    }),
    vitePreprocess({})
  ],
  kit: {
    // adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
    // If your environment is not supported or you settled on a specific environment, switch out the adapter.
    // See https://kit.svelte.dev/docs/adapters for more information about adapters.
    adapter: adapter()
  }
};

export default config;
