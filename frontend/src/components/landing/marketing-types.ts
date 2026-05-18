import type { LucideIcon } from "lucide-react";

// Tuple shape used across product/marketing landing pages where a section
// renders `[title, Icon]` (badges, status rows) or `[title, body, Icon]`
// (capability cards). Centralized so destructuring yields concrete element
// types instead of a `string | LucideIcon` union that breaks `<Icon />`.
export type IconRow = readonly [title: string, Icon: LucideIcon];
export type IconCapability = readonly [
  title: string,
  body: string,
  Icon: LucideIcon,
];
