/** Mounting markup or React elements into the page, and taking them down again. */
import { cleanupFixtures, fixture } from "./helpers/dom";
import { requirePeer } from "./peer";

/** What `mount` accepts: HTML, or a React element (`<WebAgentsProvider>…</WebAgentsProvider>`). */
export type Mountable = string | { type: unknown; props: unknown };

/** Mounts `ui` into a fresh `div.test-fixture` and returns it. Removed (React roots unmounted) after the test. */
export type Mount = (ui: Mountable) => HTMLElement;

interface ReactDom {
  createRoot(el: Element): { render(ui: unknown): void; unmount(): void };
}
interface ReactDomSync {
  flushSync(fn: () => void): void;
}

const isReactElement = (ui: unknown): ui is { $$typeof: symbol } =>
  typeof ui === "object" && ui !== null && typeof (ui as { $$typeof?: unknown }).$$typeof === "symbol";

/** A mount function and its teardown. React DOM is loaded up front (when installed), so `mount` stays synchronous. */
export async function createMount(): Promise<{ mount: Mount; unmountAll(): void }> {
  if (typeof document === "undefined") {
    const unavailable = (): never => {
      throw new Error("mount() needs a page: run this test in browser mode (a *.browser.test file).");
    };
    return { mount: unavailable, unmountAll: () => {} };
  }
  let react: { client: ReactDom; dom: ReactDomSync } | Error;
  try {
    const by = "mount(<JSX>)";
    const [client, dom] = await Promise.all([
      requirePeer(() => import("react-dom/client") as Promise<ReactDom>, { peer: "react-dom", by }),
      requirePeer(() => import("react-dom") as Promise<ReactDomSync>, { peer: "react-dom", by }),
    ]);
    react = { client, dom };
  } catch (err) {
    react = err as Error;
  }
  const roots: { unmount(): void }[] = [];
  const mount: Mount = (ui) => {
    if (typeof ui === "string") return fixture(ui);
    if (!isReactElement(ui)) throw new TypeError(`mount() takes an HTML string or a React element, got ${typeof ui}.`);
    if (react instanceof Error) throw react;
    const el = fixture("");
    const root = react.client.createRoot(el);
    const { dom } = react;
    dom.flushSync(() => root.render(ui));
    roots.push(root);
    return el;
  };
  return {
    mount,
    unmountAll() {
      for (const root of roots.splice(0).reverse()) root.unmount();
      cleanupFixtures();
    },
  };
}
