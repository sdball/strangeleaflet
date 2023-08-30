export const fetchPosts = async () => {
  /**
   * @type Record<string, any>
   */
  const postFiles = import.meta.glob("/src/lib/blog/posts/**/*.svx", { eager: true });
  return Object.entries(postFiles).map(([path, meta]) => {
    return {
      path: path.replace("/posts", ""),
      metadata: meta.metadata
    };
  });
};
