export interface WordmarkFooterLink {
  href: string;
  id: string;
  label: string;
}
export const availableWordmarkLinks = (links: readonly WordmarkFooterLink[]) =>
  links.filter(
    (link) =>
      link.href.trim() !== "" &&
      link.href.trim() !== "#" &&
      link.label.trim() !== ""
  );
