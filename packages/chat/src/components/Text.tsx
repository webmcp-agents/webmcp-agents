import { slotProps, useChatContext, usePart } from "../customize/context";

/** Plain text with paragraph breaks: model output is never rendered as HTML. `components.Text` replaces it. */
export function Text({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const ctx = useChatContext();
  const part = usePart();
  const Custom = ctx.components.Text;
  if (Custom) return <Custom {...slotProps(ctx, "text")} text={text} streaming={streaming} />;
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs of one streaming text, only ever appended to
          <p key={i} {...part("text")}>
            {p}
          </p>
        ))}
    </>
  );
}
