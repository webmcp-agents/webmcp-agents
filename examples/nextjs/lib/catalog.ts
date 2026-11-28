/**
 * The store's catalogue (shared with the Vite example's data): seeded mock data and pure, synchronous queries. No React,
 * no DOM: Server Components, client components and tools read the same functions. Prices are integer cents.
 */
import productsJson from "./products.json";

export interface Product {
  slug: string;
  name: string;
  category: string;
  /** Cents. */
  price: number;
  description: string;
  tags: string[];
  details: { fit: string; fabric: string; care: string };
  variants?: { name: string; options: string[] };
  stock: number;
  images: { hue: number; angle: number; photo?: string }[];
}

const PRODUCTS: readonly Product[] = productsJson;

export const allProducts = (): readonly Product[] => PRODUCTS;
export const findProduct = (slug: string): Product | undefined => PRODUCTS.find((p) => p.slug === slug);

/** Throws a readable error for an unknown slug: it becomes the agent's answer. */
export function getProduct(slug: string): Product {
  const product = findProduct(slug);
  if (!product) throw new Error(`Unknown product "${slug}". Try search_products to find the right one.`);
  return product;
}

const STOP_WORDS = new Set(
  "a an the some any my me i we you for to of in on with and or is are want need looking find show get buy please one good nice beautiful pretty cool new best great cheap something thing product products item size sizes small medium large xl".split(
    " ",
  ),
);
const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map((w) => w.replace(/-/g, ""))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
const singular = (w: string): string => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/** Case-insensitive search, word by word, over name, tags, category and description; a sentence works too. */
export function searchProducts(query: string, limit?: number): Product[] {
  const q = query.trim().toLowerCase();
  const terms = [...new Set(words(q).map(singular))];
  const score = (p: Product): number => {
    if (!q) return 1;
    const name = p.name.toLowerCase();
    let s = name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q)) ? 20 : name.includes(q) ? 10 : 0;
    const nameWords = words(name).map(singular);
    const tagWords = p.tags.flatMap((t) => words(t)).map(singular);
    const descriptionWords = words(p.description).map(singular);
    for (const t of terms) {
      if (nameWords.some((w) => w.startsWith(t))) s += 4;
      if (tagWords.includes(t)) s += 3;
      if (singular(p.category) === t) s += 2;
      if (descriptionWords.includes(t)) s += 1;
    }
    return s;
  };
  return PRODUCTS.map((p) => ({ p, s: score(p) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ p }) => p);
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** `4800` → `$48.00`. */
export const money = (cents: number): string => usd.format(cents / 100);

/** "- Ocean Tee [ocean-tee]: $48.00" — one row of a product list for the agent. */
export const productLine = (p: Product): string => `- ${p.name} [${p.slug}]: ${money(p.price)}${p.stock === 0 ? " (sold out)" : ""}`;

/** "Ocean Tee ($48.00). Size: S, M, L." — how tools describe a product to the agent. */
export function describeProduct(p: Product): string {
  const options = p.variants ? ` ${p.variants.name}: ${p.variants.options.join(", ")}.` : "";
  const stock = p.stock === 0 ? " Sold out." : p.stock <= 5 ? ` Only ${p.stock} left.` : "";
  return `${p.name} (${money(p.price)}).${options}${stock}`;
}

/** A gradient tile for a product (no image downloads in the example). */
export const tileStyle = (p: Product): { background: string } => {
  const art = p.images[0] ?? { hue: 200, angle: 135 };
  return { background: `linear-gradient(${art.angle}deg, hsl(${art.hue} 60% 70%), hsl(${(art.hue + 40) % 360} 55% 45%))` };
};
