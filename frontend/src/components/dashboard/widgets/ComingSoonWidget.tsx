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
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-lg">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">{name}</h3>
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
