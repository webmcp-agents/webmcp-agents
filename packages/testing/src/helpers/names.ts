let uid = 0;

/**
 * `base` with a number that is new on this page (`add_to_cart_3`). The WebMCP registry lives as long as the page, so
 * tests that share a page and cannot clean up a tool give each one its own name. With `./setup` a test's tools are
 * removed after it, so a fixed name is fine there too.
 */
export const uniqueName = (base: string): string => `${base}_${++uid}`;
