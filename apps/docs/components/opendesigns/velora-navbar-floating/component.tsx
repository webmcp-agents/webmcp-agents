"use client";

import { ArrowRight01Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OpenDesignsLogo } from "@/components/ui/opendesigns-logo";
import { cn } from "@/lib/utils";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { PopoverContext, useSlottedContext } from "react-aria-components";

import { brand, useBrandName } from "../_shared/brand";
import { availableFloatingLinks, normalizeFloatingNav } from "./navigation";
import type { FloatingNavLink } from "./navigation";
import {
  useMobileNavigationFit,
  useScrollCompact,
} from "./use-navigation-layout";

import "./styles.css";

export type { FloatingNavLink } from "./navigation";
export interface NavbarFloatingProps {
  activeHref?: string;
  className?: string;
  compactWidth?: number;
  defaultMenuOpen?: boolean;
  homeAction: { href: string; label: string };
  items: readonly FloatingNavLink[];
  maxWidth?: number;
  menuOpen?: boolean;
  navigationLabel?: string;
  onMenuOpenChange?: (open: boolean) => void;
  /** Told when the links fold into the menu (true: only the menu button is in the bar) or unfold. */
  onCollapsedChange?: (collapsed: boolean) => void;
  primaryAction: FloatingNavLink;
  /** Controls that stay in the bar at every width (a theme toggle), between the links and the actions. */
  extra?: ReactNode;
  scrollContainer?: RefObject<HTMLElement | null>;
  secondaryAction?: FloatingNavLink | null;
  threshold?: number;
}
const NavAction = ({
  action,
  primary = false,
}: {
  action: FloatingNavLink;
  primary?: boolean;
}) => {
  const variant = primary ? "default" : "ghost";
  const content = (
    <>
      <span className="min-w-0 text-balance whitespace-normal">
        {action.label}
      </span>
      {primary && (
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          aria-hidden="true"
          data-icon="inline-end"
        />
      )}
    </>
  );
  return (
    <LinkButton
      href={action.href}
      isDisabled={action.disabled}
      variant={variant}
      size="touch"
      className="max-w-full"
    >
      {content}
    </LinkButton>
  );
};

/** Preserve MenuTrigger's native context while choosing a local layout-only portal container. */
const FloatingMenuPortal = ({
  children,
  container,
}: {
  children: ReactNode;
  container: HTMLDivElement | null;
}) => {
  const context = useSlottedContext(PopoverContext);
  const value = useMemo(
    () => ({ ...context, UNSTABLE_portalContainer: container ?? undefined }),
    [context, container]
  );
  return (
    <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>
  );
};

/** Native scrolling may compact the pill; native React Aria owns the actual menu. */
export const NavbarFloating = ({
  activeHref,
  className,
  compactWidth,
  defaultMenuOpen = false,
  extra,
  homeAction,
  items,
  maxWidth,
  menuOpen,
  navigationLabel = `${brand.name} main navigation`,
  onMenuOpenChange,
  onCollapsedChange,
  primaryAction,
  scrollContainer,
  secondaryAction,
  threshold,
}: NavbarFloatingProps) => {
  const brandName = useBrandName();
  const dimensions = normalizeFloatingNav(threshold, compactWidth, maxWidth);
  const compact = useScrollCompact(dimensions.threshold, scrollContainer);
  const [innerOpen, setInnerOpen] = useState(defaultMenuOpen);
  const requestedOpen = menuOpen ?? innerOpen;
  const frame = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null
  );
  const attachFrame = useCallback((next: HTMLDivElement | null) => {
    frame.current = next;
    setPortalContainer(next);
  }, []);
  const trigger = useRef<HTMLButtonElement>(null);
  const home = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const restoreHome = useRef(false);
  const close = useRef<(() => void) | null>(null);
  const handleOpenChange = (next: boolean) => {
    if (next === requestedOpen) {
      return;
    }
    if (menuOpen === undefined) {
      setInnerOpen(next);
    }
    onMenuOpenChange?.(next);
  };
  useLayoutEffect(() => {
    close.current = () => handleOpenChange(false);
  });
  const handleHidden = useCallback(() => {
    const element = menu.current;
    restoreHome.current = Boolean(
      element?.contains(element.ownerDocument.activeElement)
    );
    close.current?.();
  }, []);
  const available = useMobileNavigationFit(frame, trigger, handleHidden);
  const reportCollapsed = useRef(onCollapsedChange);
  reportCollapsed.current = onCollapsedChange;
  useLayoutEffect(() => {
    if (available !== null) reportCollapsed.current?.(available);
  }, [available]);
  const handleMenuRef = useCallback((next: HTMLDivElement | null) => {
    const previous = menu.current;
    menu.current = next;
    if (next === null && previous && restoreHome.current) {
      restoreHome.current = false;
      queueMicrotask(() => {
        const target =
          home.current?.querySelector<HTMLAnchorElement>("a[href]");
        if (
          target?.isConnected &&
          target.getClientRects().length > 0 &&
          target.ownerDocument.activeElement === target.ownerDocument.body
        ) {
          target.focus();
        }
      });
    }
  }, []);
  const links = availableFloatingLinks(items);
  const style = {
    "--velora-floating-compact": `${dimensions.compactWidth}px`,
    "--velora-floating-max": `${dimensions.maxWidth}px`,
  } as CSSProperties;
  return (
    <header
      className={cn("velora-floating-header", className)}
      data-compact={compact}
      style={style}
    >
      <div ref={attachFrame} className="velora-floating-frame">
        <nav
          aria-label={
            navigationLabel.trim()
              ? navigationLabel
              : `${brandName} main navigation`
          }
          className="velora-floating-bar"
        >
          <div ref={home} className="velora-floating-home">
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
          <div className="velora-floating-desktop-links">
            <ul>
              {links.map((link) => (
                <li key={link.id}>
                  <LinkButton
                    href={link.href}
                    isDisabled={link.disabled}
                    aria-current={activeHref === link.href ? "page" : undefined}
                    size="touch"
                    variant="ghost"
                    className="max-w-full"
                  >
                    <span className="min-w-0 text-balance whitespace-normal">
                      {link.label}
                    </span>
                  </LinkButton>
                </li>
              ))}
            </ul>
          </div>
          {extra && <div className="velora-floating-extra">{extra}</div>}
          <div className="velora-floating-desktop-actions">
            {secondaryAction && <NavAction action={secondaryAction} />}
            <NavAction action={primaryAction} primary />
          </div>
          <div className="velora-floating-mobile-control">
            <DropdownMenu
              isOpen={
                available === true && Boolean(portalContainer) && requestedOpen
              }
              onOpenChange={handleOpenChange}
            >
              <DropdownMenuTrigger
                ref={trigger}
                aria-label="Open navigation menu"
                variant="ghost"
                size="icon-touch"
              >
                <HugeiconsIcon icon={Menu01Icon} aria-hidden="true" />
              </DropdownMenuTrigger>
              <FloatingMenuPortal container={portalContainer}>
                <DropdownMenuContent
                  ref={handleMenuRef}
                  aria-label={`${navigationLabel} mobile menu`}
                  placement="bottom end"
                  className="max-h-[min(70dvh,40rem)] w-[min(22rem,calc(100vw-2rem))]"
                >
                  {links.length > 0 && (
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Read and explore</DropdownMenuLabel>
                      {links.map((link) => (
                        <DropdownMenuItem
                          key={link.id}
                          id={`navigation-${link.id}`}
                          href={link.href}
                          textValue={link.label}
                          isDisabled={link.disabled}
                          render={(nativeProps) => {
                            if ("href" in nativeProps) {
                              return (
                                <a
                                  {...nativeProps}
                                  aria-current={
                                    activeHref === link.href
                                      ? "page"
                                      : undefined
                                  }
                                >
                                  {nativeProps.children}
                                </a>
                              );
                            }
                            return (
                              <div {...nativeProps}>{nativeProps.children}</div>
                            );
                          }}
                        >
                          {link.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  )}
                  {links.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Next step</DropdownMenuLabel>
                    {secondaryAction && (
                      <DropdownMenuItem
                        id="secondary-action"
                        href={secondaryAction.href}
                        textValue={secondaryAction.label}
                        isDisabled={secondaryAction.disabled}
                      >
                        {secondaryAction.label}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      id="primary-action"
                      href={primaryAction.href}
                      textValue={primaryAction.label}
                      isDisabled={primaryAction.disabled}
                    >
                      {primaryAction.label}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </FloatingMenuPortal>
            </DropdownMenu>
          </div>
        </nav>
      </div>
    </header>
  );
};
