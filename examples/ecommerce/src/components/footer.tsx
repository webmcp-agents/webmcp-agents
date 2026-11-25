import { Button } from "@webmcp-agents/examples-ui/components/button";
import { Separator } from "@webmcp-agents/examples-ui/components/separator";
import { useChatLocale } from "../hooks/use-chat-locale";

const COLUMNS = [
  { title: "Shop", links: ["New in", "Best sellers", "Gift cards"] },
  { title: "Support", links: ["Shipping", "Returns", "Contact"] },
  { title: "Legal", links: ["Privacy", "Terms", "Cookies"] },
];

export function Footer() {
  const { toggleLabel, toggleName, toggle } = useChatLocale();

  return (
    <footer className="mt-24 border-t bg-muted/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="flex max-w-xs flex-col gap-3">
          <p className="font-serif text-xl tracking-tight">Field Store</p>
          <p className="text-sm text-muted-foreground">
            Everyday goods, built to stay. Every action on this site is a tool an agent can call.
          </p>
          {/* The assistant's language: Arabic switches the chat to right-to-left. Up here, not in the bottom row:
              the chat and devtools launchers sit in the page's bottom corners and would cover it. */}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            lang={toggleLabel === "English" ? "en" : "ar"}
            aria-label={toggleName}
            onClick={toggle}
          >
            {toggleLabel}
          </Button>
        </div>

        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title} className="flex flex-col gap-3">
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{c.title}</p>
            <ul className="flex flex-col gap-2 text-sm">
              {c.links.map((l) => (
                <li key={l}>
                  <a href="#main" className="hover:underline hover:underline-offset-4">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <Separator />

      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:px-6">
        <p>
          Demo store. Nothing here ships. Product photos from{" "}
          <a href="https://unsplash.com/?utm_source=web-agents&utm_medium=referral" className="underline underline-offset-4">
            Unsplash
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
