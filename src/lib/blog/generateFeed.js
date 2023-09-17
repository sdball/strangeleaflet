import { Feed } from "feed";

/**
 * @typedef {Object} Item
 * @property {string} path - The URL path to the item.
 * @property {ItemMetadata} metadata
 */

/**
 * @typedef {Object} ItemMetadata
 * @property {string} layout
 * @property {string} link
 * @property {string} title
 * @property {string} description
 * @property {Date} date
 * @property {Array<string>} categories
 * @property {string|undefined} commit
 * @property {string|undefined} repo
 */

/**
 * @param {Feed} feed
 * @param {Item} item
 */
const blog = (feed, item) => {
  feed.addItem({
    id: item.path,
    link: item.path,
    title: item.metadata.title,
    date: item.metadata.date,
    description:
      item.metadata.description ||
      "No description on this blog post. Either I forgot to add one or this is an older post that I haven't updated yet.",
    category: item.metadata.categories.map((category) => {
      return { name: category };
    })
  });
};

/**
 * @param {Feed} feed
 * @param {Item} item
 */
const gitBlog = (feed, item) => {
  feed.addItem({
    id: item.path,
    link: item.path,
    title: item.metadata.title,
    date: item.metadata.date,
    description: gitBlogDescription(item.metadata),
    category: item.metadata.categories.map((category) => {
      return { name: category };
    })
  });
};

/**
 * @param {ItemMetadata} metadata
 */
const gitBlogDescription = (metadata) => {
  if (metadata.description) return metadata.description;
  return `No description on this git-blog post. But I can say this post is from commit ${metadata.commit} for the repo ${metadata.repo}`;
};

/**
 *
 * @param {string|undefined} format
 * @param {string|undefined} path
 * @returns {string}
 */
const feedTitle = (format, path) => {
  format ||= ".atom";
  format = format?.slice(1);
  path ||= "all";
  return `Strange Leaflet - ${path || ""} (${format})`;
};

/**
 * Generates an RSS/Atom feed based on the provided items and format.
 *
 * @param {Array<Item>} items - An array of items to include in the feed.
 * @param {string|undefined} format - The format of the feed, e.g., ".rss" or ".atom".
 * @param {string} path - The url path of the feed e.g. "/blog"
 * @returns {string} The generated feed in the specified format.
 */
export const generateFeed = (items, format, path) => {
  const feed = new Feed({
    id: "strangeleaflet.com",
    title: feedTitle(format, path),
    copyright: `© ${new Date().getFullYear()} Stephen Ball`,
    description: "Stephen Ball's writings on programming, tech, and other things",
    link: "https://www.strangeleaflet.com",
    language: "en",
    favicon: "https://www.strangeleaflet.com/favicon.svg",
    feedLinks: {
      atom: "https://www.strangeleaflet.com/feed.atom",
      rss: "https://www.strangeleaflet.com/feed.rss"
    },
    author: {
      name: "Stephen Ball",
      email: "sdball@duck.com"
    }
  });

  items.forEach((item) => {
    if (item.metadata.layout) {
      switch (item.metadata.layout) {
        case "blog":
          blog(feed, item);
          break;
        case "gitblog":
          gitBlog(feed, item);
          break;
        default:
          console.warn({ layout: item.metadata.layout }, "feed.unknownLayout");
          break;
      }
    }
  });

  switch (format) {
    case ".rss":
      return feed.rss2();
    case ".atom":
      return feed.atom1();
    case ".json":
      return feed.json1();
    default:
      return feed.atom1();
  }
};
