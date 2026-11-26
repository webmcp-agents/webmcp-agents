import { useBrandName } from "../opendesigns/_shared/brand";
import { cn } from "@/lib/utils";
import type { SVGProps } from "react";

/** The agent cursor's arrow (the same path core draws), the site's mark. */
const CURSOR_PATH = "M5.1 3.4 20.2 9.5c.8.3.8 1.4 0 1.7l-6.3 2.5-2.5 6.3c-.3.8-1.4.8-1.7 0L3.4 5.1c-.3-.9.8-2 1.7-1.7z";

export const CursorMark = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg viewBox="2 2 20 20" width="20" height="20" aria-hidden="true" className={cn("brand-mark", className)} {...props}>
    <path d={CURSOR_PATH} strokeLinejoin="round" />
  </svg>
);

export const OpenDesignsLogo = ({
  className,
  name,
}: {
  className?: string;
  name?: string;
}) => {
  const liveName = useBrandName();
  return (
    // The agent cursor beside the wordmark: the mark is what the library draws on a page.
    <span className={cn("brand inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <CursorMark />
      <span className="brand-name">{name ?? liveName}</span>
    </span>
  );
};
