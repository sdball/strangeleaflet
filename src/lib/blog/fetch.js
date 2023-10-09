/**
 *
 * @param {Record<string, any>} globbed
 */
const blogItems = (globbed) => {
  return Object.entries(globbed)
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

export const fetchPosts = async () => {
  const postFiles = import.meta.glob("/src/lib/blog/posts/**/*.svx", { eager: true });
  return blogItems(postFiles);
};

export const fetchGitBlogs = async () => {
  const postFiles = import.meta.glob("/src/lib/blog/gitblogs/**/*.svx", { eager: true });
  return blogItems(postFiles);
};

export const fetchMicro = async () => {
  const postFiles = import.meta.glob("/src/lib/blog/micro/**/*.svx", { eager: true });
  return blogItems(postFiles);
};

export const fetchAll = async () => {
  const posts = await fetchPosts();
  const gitblogs = await fetchGitBlogs();
  const micro = await fetchMicro();
  return [...posts, ...gitblogs, ...micro].sort((a, b) => {
    return b.metadata.date - a.metadata.date;
  });
};

/**
 * Filters an array of items to return only those with a `featured` property in their `metadata`.
 *
 * @param {Array<{ metadata: { featured: boolean } }>} items - An array of items with metadata containing a `featured` property.
 * @returns {Array<{ metadata: { featured: boolean } }>} An array containing only the featured items.
 */
export const featured = (items) => {
  return items.filter((item) => item.metadata.featured);
};
