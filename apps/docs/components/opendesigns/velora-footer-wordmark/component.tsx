"use client";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkButton } from "@/components/ui/button";
import { OpenDesignsLogo } from "@/components/ui/opendesigns-logo";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useId } from "react";

import { brand, useBrandName } from "../_shared/brand";
import { availableWordmarkLinks } from "./content";
import type { WordmarkFooterLink } from "./content";
import { FooterWordmarkArtwork } from "./wordmark";

import "./styles.css";

export type { WordmarkFooterLink } from "./content";
export interface FooterWordmarkProps {
  auxiliaryLinks?: readonly WordmarkFooterLink[];
  blurb?: string;
  className?: string;
  /** Only the bottom bar and the wordmark: for pages whose last section already says what the project is. */
  compact?: boolean;
  contactAction: { href: string; label: string };
  copyright?: string;
  footerLabel?: string;
  homeAction: { href: string; label: string };
  links: readonly WordmarkFooterLink[];
  policyLinks?: readonly WordmarkFooterLink[];
  revealRadius?: number;
  statement?: string;
  strokeWidth?: number;
}
const noLinks: readonly WordmarkFooterLink[] = [];
const ReadingLinks = ({ links }: { links: readonly WordmarkFooterLink[] }) => (
  <ul className="velora-wordmark-reading-links">
    {links.map((link) => (
      <li key={link.id}>
        <LinkButton
          href={link.href}
          variant="link"
          size="touch"
          className="max-w-full justify-start"
        >
          <span className="min-w-0 text-left whitespace-normal">
            {link.label}
          </span>
        </LinkButton>
      </li>
    ))}
  </ul>
);

/** A complete original footer; the outlined wordmark is graphic artwork, never a control. */
export const FooterWordmark = ({
  auxiliaryLinks = noLinks,
  blurb = "Considered starting points for the words, layouts, and small decisions that make a page feel useful.",
  className,
  compact = false,
  contactAction,
  copyright = `© 2026 ${brand.name} contributors.`,
  footerLabel = `${brand.name} wordmark footer`,
  homeAction,
  links,
  policyLinks = noLinks,
  revealRadius,
  statement = "Good pages leave room to think.",
  strokeWidth,
}: FooterWordmarkProps) => {
  const brandName = useBrandName();
  const id = useId();
  const navigation = availableWordmarkLinks(links);
  const auxiliary = availableWordmarkLinks(auxiliaryLinks);
  const policies = availableWordmarkLinks(policyLinks);
  const bottom = Boolean(
    copyright.trim() || auxiliary.length > 0 || policies.length > 0
  );
  return (
    <footer
      aria-labelledby={`${id}-title`}
      className={cn("velora-wordmark-footer", className)}
    >
      <h2 id={`${id}-title`} className="sr-only">
        {footerLabel.trim() ? footerLabel : `${brandName} wordmark footer`}
      </h2>
      <div className="velora-wordmark-inner">
        {!compact && (
        <div className="velora-wordmark-main">
          <div className="velora-wordmark-copy">
            <div>
              <LinkButton
                href={homeAction.href}
                aria-label={homeAction.label}
                variant="ghost"
                size="touch"
                className="max-w-full justify-start"
              >
                <OpenDesignsLogo />
              </LinkButton>
            </div>
            <p className="velora-wordmark-statement">
              {statement.trim() ? statement : "Good pages leave room to think."}
            </p>
            {blurb && <p className="velora-wordmark-blurb">{blurb}</p>}
            <div>
              <LinkButton
                href={contactAction.href}
                variant="link"
                size="touch"
                className="max-w-full justify-start"
              >
                <span className="min-w-0 text-left whitespace-normal">
                  {contactAction.label}
                </span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  aria-hidden="true"
                  data-icon="inline-end"
                />
              </LinkButton>
            </div>
          </div>
          {navigation.length > 0 && (
            <nav aria-label={`${footerLabel} guide navigation`}>
              <ReadingLinks links={navigation} />
            </nav>
          )}
        </div>
        )}
        {bottom && (
          <>
            {!compact && <Separator />}
            <div className="velora-wordmark-bottom">
              <div className="velora-wordmark-notices">
                {copyright.trim() && <p>{copyright}</p>}
                {policies.length > 0 && (
                  <nav aria-label={`${footerLabel} usage and attribution`}>
                    <ReadingLinks links={policies} />
                  </nav>
                )}
              </div>
              {auxiliary.length > 0 && (
                <nav aria-label={`${footerLabel} quick reading`}>
                  <ReadingLinks links={auxiliary} />
                </nav>
              )}
            </div>
          </>
        )}
        <FooterWordmarkArtwork
          revealRadius={revealRadius}
          strokeWidth={strokeWidth}
        />
      </div>
    </footer>
  );
};
