"use client";

import { Clock } from "lucide-react";
import { DASHBOARD_WIDGETS } from "@/config/dashboardWidgets";

interface ComingSoonWidgetProps {
  widgetId: string;
}

export function ComingSoonWidget({ widgetId }: ComingSoonWidgetProps) {
  const widget = DASHBOARD_WIDGETS[widgetId];
  const name = widget?.name || widgetId;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-muted rounded-lg shrink-0">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">{name}</h3>
        </div>
      </div>
      <div className="p-6">
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <p className="text-muted-foreground text-sm">
            This widget is coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
