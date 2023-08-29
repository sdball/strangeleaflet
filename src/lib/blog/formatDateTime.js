/**
 * Format a given datetime string to standard YYYY-MM-DD
 *
 * @param {string} date
 * @returns {string}
 */
export function formatDate(date) {
  return new Date(date).toJSON().replace(/T.*$/, "");
}
