export interface FloatingNavLink {
  disabled?: boolean;
  href: string;
  id: string;
  label: string;
}
const bounded = (value: number, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export const normalizeFloatingNav = (
  threshold = 80,
  compactWidth = 760,
  maxWidth = 1152
) => {
  const wide = bounded(maxWidth, 1152, 640, 1600);
  return {
    compactWidth: Math.min(wide, bounded(compactWidth, 760, 360, 1152)),
    maxWidth: wide,
    threshold: bounded(threshold, 80, 0, 1000),
  };
};
export const availableFloatingLinks = (links: readonly FloatingNavLink[]) =>
  links.filter(
    (link) =>
      link.label.trim() !== "" &&
      link.href.trim() !== "" &&
      link.href.trim() !== "#"
  );
