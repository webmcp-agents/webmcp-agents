"use client";
import { cn } from "@/lib/utils";
import * as React from "react";

const Avatar = ({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm" | "lg";
}) => (
  <div
    data-slot="avatar"
    data-size={size}
    className={cn(
      "group/avatar after:border-border relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
      className
    )}
    {...props}
  />
);
const AvatarFallback = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div
    data-slot="avatar-fallback"
    className={cn(
      "bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-sm group-data-[size=sm]/avatar:text-xs peer-data-[state=error]:flex peer-[*]:hidden",
      className
    )}
    {...props}
  />
);
const AvatarGroup = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="avatar-group"
    className={cn(
      "group/avatar-group *:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2",
      className
    )}
    {...props}
  />
);
export {
  Avatar,
  AvatarFallback,
  AvatarGroup,
};
