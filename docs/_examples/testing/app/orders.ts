// The orders placed in this session: a plain module, so a test can
// read it next to the page.
const placed: string[] = [];

export const orders = {
  add: (id: string) => placed.push(id),
  get: () => [...placed],
  clear: () => {
    placed.length = 0;
  },
};
