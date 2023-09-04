import { fetchAll } from "./fetch";

/**
 * Searches for all blog items matching the given search term.
 *
 * @param {string} term - The search term to look for.
 * @throws {Error} If there is an error during the search.
 */
export const searchAll = async (term) => {
  term = term.toLocaleLowerCase();
  try {
    const all = await fetchAll();
    return all.filter((item) => {
      const metaMatch = Object.entries(item.metadata).some(([key, value]) => {
        switch (key) {
          case "title":
            return value.toLocaleLowerCase().includes(term);
          case "categories":
            return value.some((/** @type string */ category) => {
              return category.toLocaleLowerCase().includes(term);
            });
          default:
            break;
        }
      });
      return metaMatch || item.path.includes(term);
    });
  } catch (error) {
    throw new Error("SearchError");
  }
};
