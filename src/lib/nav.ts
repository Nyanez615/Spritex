import {
  CalendarDays,
  Gamepad2,
  LayoutGrid,
  Settings as SettingsIcon,
  Table2,
  Target,
  Trophy,
  Zap,
} from "lucide-react";

/** Shared between AppSidebar (always visible) and CommandPalette (⌘K) so the two nav surfaces can't drift apart. */
export const NAV_ITEMS = [
  { to: "/" as const, label: "Pokédex", icon: LayoutGrid },
  { to: "/table" as const, label: "Table", icon: Table2 },
  { to: "/games/$gameId" as const, params: { gameId: "sv" }, label: "Games", icon: Gamepad2 },
  { to: "/hunt" as const, label: "Hunt", icon: Target },
  { to: "/dex" as const, label: "Living Dex", icon: Trophy },
  { to: "/quick-counter" as const, label: "Quick Counter", icon: Zap },
  { to: "/timeline" as const, label: "Timeline", icon: CalendarDays },
  { to: "/settings" as const, label: "Settings", icon: SettingsIcon },
];
