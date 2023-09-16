import { Feed } from "feed";

/**
 * @typedef {Object} Item
 * @property {string} path - The URL path to the item.
 * @property {ItemMetadata} metadata
 */

/**
 * @typedef {Object} ItemMetadata
 * @property {string} link - The link to the item.
 * @property {string} title - The title of the item.
 * @property {Date} date - The date of the item.
 * @property {Array<string>} categories - The categories associated with the item.
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
    feedLinks: {
      atom: "https://www.strangeleaflet.com/feed.atom"
    },
    author: {
      name: "Stephen Ball",
      email: "sdball@duck.com"
    }
  });

  items.forEach((item) => {
    feed.addItem({
      link: item.path,
      title: item.metadata.title,
      date: item.metadata.date,
      category: item.metadata.categories.map((category) => {
        return { name: category };
      })
    });
  });

  if (format && format == ".rss") {
    return feed.rss2();
  } else {
    return feed.atom1();
  }
};
