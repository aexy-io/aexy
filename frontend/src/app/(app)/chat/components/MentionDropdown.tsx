import { useEffect, useRef } from "react";
import { MentionItem } from "@/hooks/useMention";
import { Bot, User } from "lucide-react";

interface MentionDropdownProps {
  items: MentionItem[];
  activeIndex: number;
  onSelect: (item: MentionItem) => void;
  onDismiss: () => void;
}

export function MentionDropdown({ items, activeIndex, onSelect, onDismiss }: MentionDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  // Click-outside to dismiss
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onDismiss]);

  // Auto-scroll active item into view
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (items.length === 0) return null;

  const people = items.filter((i) => i.type === "user");
  const agents = items.filter((i) => i.type === "agent");

  // Build a flat index mapping so we can highlight the right item
  let flatIndex = 0;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-1 w-64 max-h-72 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg z-50"
    >
      {people.length > 0 && (
        <div className="p-1">
          <p className="text-[10px] text-muted-foreground font-medium px-2 py-1">People</p>
          {people.map((item) => {
            const idx = flatIndex++;
            const isActive = idx === activeIndex;
            return (
              <button
                key={item.id}
                ref={isActive ? activeItemRef : undefined}
                onClick={() => onSelect(item)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                  isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                }`}
              >
                {item.avatarUrl ? (
                  <img src={item.avatarUrl} alt={item.name} className="h-5 w-5 rounded-full" />
                ) : (
                  <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <User className="h-3 w-3" />
                  </div>
                )}
                <span className="truncate">{item.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {agents.length > 0 && (
        <div className="p-1">
          {people.length > 0 && <div className="border-t border-border my-1" />}
          <p className="text-[10px] text-muted-foreground font-medium px-2 py-1">Agents</p>
          {agents.map((item) => {
            const idx = flatIndex++;
            const isActive = idx === activeIndex;
            return (
              <button
                key={item.id}
                ref={isActive ? activeItemRef : undefined}
                onClick={() => onSelect(item)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                  isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                }`}
              >
                <div className="h-5 w-5 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center">
                  <Bot className="h-3 w-3" />
                </div>
                <span className="truncate">{item.name}</span>
                {item.handle && (
                  <span className="text-[10px] text-muted-foreground ml-auto">@{item.handle}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
