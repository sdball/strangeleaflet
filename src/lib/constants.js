import { dev } from "$app/environment";

export const SITE = {
  title: "Strange Leaflet",
  url: "https://strangeleaflet.com",
  avatar: "https://strangeleaflet.com/images/avatar.webp"
};

if (dev) {
  SITE.title = "Strange Leaflet (DEV)";
}

Object.freeze(SITE);
