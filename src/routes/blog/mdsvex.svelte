<script>
  import { DarkMode } from "flowbite-svelte";
  /**
   * @type string
   */
  export let title;
  /**
   * @type string
   */
  export let date;

  /**
   * Format a JavaScript Date object to the format 'YYYY-MM-DD h:mmA ET', e.g., '2023-08-26 2:03PM ET'.
   *
   * @param {Date} date - The Date object to be formatted.
   * @returns {string} The formatted date string with the specified timezone abbreviation.
   */
  function formatDateWithTimeZoneAbbreviation(date) {
    // Format the date components
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are zero-based
    const day = String(date.getDate()).padStart(2, "0");
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");

    // Manually specify the timezone abbreviation
    // Cheating because my times are always eastern
    const timeZoneAbbreviation = "ET"; // Eastern Time

    // Determine AM or PM
    const amOrPm = hours >= 12 ? "PM" : "AM";

    // Adjust hours for PM format
    const formattedHours = hours % 12 || 12;

    // Construct the final formatted string
    const formattedDate = `${year}-${month}-${day} ${formattedHours}:${minutes}${amOrPm} ${timeZoneAbbreviation}`;

    return formattedDate;
  }
</script>

<DarkMode />

<main class="mx-auto max-w-[90ch] px-4 relative sm:px-6 lg:px-8 break-normal">
  <article class="all-prose">
    <h1>{title}</h1>
    <p>Published: {formatDateWithTimeZoneAbbreviation(new Date(date))}</p>
    <slot />
  </article>
</main>
