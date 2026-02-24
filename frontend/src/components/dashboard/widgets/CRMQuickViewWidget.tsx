"use client";

import Link from "next/link";
import {
  Eye,
  ChevronRight,
  Users,
  Building2,
  DollarSign,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCRMObjects } from "@/hooks/useCRM";

const objectIcons: Record<string, typeof Users> = {
  contacts: Users,
  people: Users,
  persons: Users,
  companies: Building2,
  organizations: Building2,
  deals: DollarSign,
};

function getObjectIcon(name: string) {
  const lower = name.toLowerCase();
  for (const [key, Icon] of Object.entries(objectIcons)) {
    if (lower.includes(key)) return Icon;
  }
  return Layers;
}

export function CRMQuickViewWidget() {
  const { currentWorkspace } = useWorkspace();
  const { objects, isLoading } = useCRMObjects(
    currentWorkspace?.id || null
  );

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-36 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg">
            <Eye className="h-5 w-5 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            CRM Quick View
          </h3>
        </div>
        <Link
          href="/crm"
          className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1 transition"
        >
          Open CRM <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Eye className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view CRM objects.
            </p>
          </div>
        ) : objects && objects.length > 0 ? (
          <div className="space-y-2">
            {objects.map((obj) => {
              const Icon = getObjectIcon(obj.name);
              return (
                <Link
                  key={obj.id}
                  href={`/crm/${obj.slug}`}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-indigo-400" />
                    <span className="text-sm font-medium text-foreground">
                      {obj.name}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {obj.record_count}{" "}
                    {obj.record_count === 1 ? "record" : "records"}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted-foreground text-sm">
              No CRM objects configured yet.
            </p>
            <Link
              href="/crm"
              className="inline-flex items-center gap-1 mt-2 text-indigo-400 hover:text-indigo-300 text-sm transition"
            >
              Set up CRM <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
