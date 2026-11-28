/** Small line icons, hidden from assistive tech (their buttons are named). `components.Icon` replaces them all. */
import type { ReactNode } from "react";
import { useChatContext } from "../customize/context";
import type { IconName } from "../customize/types";

const DRAWINGS: Record<IconName, { size: number; body: ReactNode }> = {
  chat: { size: 22, body: <path d="M4 5h16v11H9l-5 4z" /> },
  close: { size: 18, body: <path d="M6 6l12 12M18 6 6 18" /> },
  send: { size: 18, body: <path d="M5 12h13M13 6l6 6-6 6" /> },
  stop: { size: 18, body: <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" /> },
  reset: { size: 18, body: <path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" /> },
  down: { size: 16, body: <path d="M12 5v14M6 13l6 6 6-6" /> },
  /** Rewind the conversation to before a user message. */
  restore: {
    size: 14,
    body: (
      <>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10a5 5 0 0 1 0 10h-1" />
      </>
    ),
  },
  /** Confirm a restore. */
  check: { size: 14, body: <path d="m5 12 5 5 9-10" /> },
  /** Cancel a restore (the small sibling of `close`). */
  cancel: { size: 14, body: <path d="M6 6l12 12M18 6 6 18" /> },
};

/** A built-in icon, drawn as an `icon` part. In RTL, the arrows that point along the line are mirrored. */
function BuiltInIcon({ name, size }: { name: IconName; size?: number }) {
  const { dir } = useChatContext();
  const drawing = DRAWINGS[name];
  const px = size ?? drawing.size;
  const mirror = dir === "rtl" && (name === "send" || name === "restore");
  return (
    <svg
      data-wa-part="icon"
      data-icon={name}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={mirror ? { transform: "scaleX(-1)" } : undefined}
    >
      {drawing.body}
    </svg>
  );
}

/** The icon `name`: the page's `components.Icon` when it gave one, else the built-in drawing. */
export function Icon({ name, size }: { name: IconName; size?: number }) {
  const { components } = useChatContext();
  const Custom = components.Icon;
  return Custom ? <Custom name={name} size={size} /> : <BuiltInIcon name={name} size={size} />;
}
