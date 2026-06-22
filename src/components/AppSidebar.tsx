import { Link } from "@tanstack/react-router";
import { APP_NAME } from "@/lib/constants";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border">
      <div className="flex h-14 items-center px-4 border-b border-border">
        <span className="font-bold text-lg tracking-tight text-foreground">{APP_NAME}</span>
      </div>
      <nav className="flex-1 overflow-auto p-2 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => (
          <Link
            key={to}
            to={to}
            {...rest}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: "bg-muted text-foreground font-medium" }}
            activeOptions={{ exact: to === "/" }}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
      <div className={cn("p-2 text-[11px] text-muted-foreground border-t border-border")}>
        <kbd className="rounded border border-border px-1 py-0.5 font-mono">⌘K</kbd> to search
      </div>
    </aside>
  );
}
