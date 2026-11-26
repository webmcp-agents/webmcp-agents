import { cn } from "@/lib/utils";

const Empty = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="empty"
    className={cn(
      "flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed p-6 text-center text-balance",
      className
    )}
    {...props}
  />
);
const EmptyHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="empty-header"
    className={cn("flex max-w-sm flex-col items-center gap-2", className)}
    {...props}
  />
);
const EmptyTitle = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="empty-title"
    className={cn("text-sm font-medium tracking-tight", className)}
    {...props}
  />
);
const EmptyDescription = ({
  className,
  ...props
}: React.ComponentProps<"p">) => (
  <div
    data-slot="empty-description"
    className={cn(
      "text-muted-foreground [&>a:hover]:text-primary text-sm/relaxed [&>a]:underline [&>a]:underline-offset-4",
      className
    )}
    {...props}
  />
);
export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
};
