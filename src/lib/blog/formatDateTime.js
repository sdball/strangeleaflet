/**
 * Format a given datetime string to standard YYYY-MM-DD
 *
 * @param {string} date
 * @returns {string}
 */
export function formatDate(date) {
  let d = new Date(date);
  let year = d.getFullYear();
  let month = d.getMonth() + 1;
  let paddedMonth = month < 10 ? `0${month}` : month;
  let day = d.getDate();
  let paddedDay = day < 10 ? `0${day}` : day;
  return [d.getFullYear(), paddedMonth, paddedDay].join("-");
}
