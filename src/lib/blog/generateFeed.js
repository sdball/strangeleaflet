import { Feed } from "feed";

/**
 * @typedef {Object} Item
 * @property {string} path - The URL path to the item.
 * @property {ItemMetadata} metadata
 */

/**
 * @typedef {Object} ItemMetadata
 * @property {string} link
 * @property {string} title
 * @property {string} description
 * @property {Date} date
 * @property {Array<string>} categories
 */

/**
 * Generates an RSS/Atom feed based on the provided items and format.
 *
 * @param {Array<Item>} items - An array of items to include in the feed.
 * @param {string|undefined} format - The format of the feed, e.g., ".rss" or ".atom".
 * @returns {string} The generated feed in the specified format.
 */
export const generateFeed = (items, format) => {
  const feed = new Feed({
    id: "strangeleaflet.com",
    title: "Strange Leaflet",
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
    feed.addItem({
      id: item.path,
      link: item.path,
      title: item.metadata.title,
      date: item.metadata.date,
      description:
        item.metadata.description ||
        "No description on this feed item. Either I forgot to add one or this is an older post that I haven't updated yet.",
      category: item.metadata.categories.map((category) => {
        return { name: category };
      })
    });
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
