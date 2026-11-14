/** Small line icons, hidden from assistive tech (their buttons are named). */
import type { ReactNode } from "react";

const Icon = ({ children, size = 18 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const ChatIcon = () => (
  <Icon size={22}>
    <path d="M4 5h16v11H9l-5 4z" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const SendIcon = () => (
  <Icon>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </Icon>
);
export const StopIcon = () => (
  <Icon>
    <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
  </Icon>
);
export const ResetIcon = () => (
  <Icon>
    <path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" />
  </Icon>
);
export const DownIcon = () => (
  <Icon size={16}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);
/** Rewind the conversation to before a user message. */
export const RestoreIcon = () => (
  <Icon size={14}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a5 5 0 0 1 0 10h-1" />
  </Icon>
);
