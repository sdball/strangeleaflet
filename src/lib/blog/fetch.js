export const fetchPosts = async () => {
  /**
   * @type Record<string, any>
   */
  const postFiles = import.meta.glob("/src/lib/blog/posts/**/*.svx", { eager: true });
  return Object.entries(postFiles)
    .map(([path, meta]) => {
      meta.metadata.date = new Date(meta.metadata.date);

      return {
        path: path
          .replace(/^\/src\/lib/, "")
          .replace(/\.svx$/, "")
          .replace(/\/index$/, ""),
        ...meta
      };
    })
    .sort((a, b) => {
      return b.metadata.date - a.metadata.date;
    });
};

export const fetchGitBlogs = async () => {
  /**
   * @type Record<string, any>
   */
  const postFiles = import.meta.glob("/src/lib/blog/gitblogs/**/*.svx", { eager: true });
  return Object.entries(postFiles)
    .map(([path, meta]) => {
      meta.metadata.date = new Date(meta.metadata.date);

      return {
        path: path
          .replace(/^\/src\/lib/, "")
          .replace(/\.svx$/, "")
          .replace(/\/index$/, ""),
        ...meta
      };
    })
    .sort((a, b) => {
      return b.metadata.date - a.metadata.date;
    });
};

export const fetchAll = async () => {
  const posts = await fetchPosts();
  const gitblogs = await fetchGitBlogs();
  return [...posts, ...gitblogs].sort((a, b) => {
    return b.metadata.date - a.metadata.date;
  });
};
