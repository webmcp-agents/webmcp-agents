import { defineComponents } from "blume";
import RememberBackend from "./components/docs/remember-backend.astro";
import RememberFramework from "./components/docs/remember-framework.astro";

/** Components every docs page (`docs/**.mdx`) can use with no import. */
export default defineComponents({
  mdx: {
    // On the installation pages: saves the reader's framework for the pages written in views.
    RememberFramework,
    // On the observability pages: carries the reader's backend from page to page; with `name`, on a backend's
    // installation page, saves it.
    RememberBackend,
  },
});
