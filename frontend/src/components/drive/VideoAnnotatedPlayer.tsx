"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { type DriveFile, type VideoAnnotation } from "@/lib/api";
import {
  useAddAnnotation,
  useDeleteAnnotation,
  useFileAnnotations,
} from "@/hooks/useDrive";
import { cn } from "@/lib/utils";

interface Props {
  workspaceId: string | null;
  file: DriveFile;
}

export function VideoAnnotatedPlayer({ workspaceId, file }: Props) {
  const t = useTranslations("drive.video");
  const annotations = useFileAnnotations(workspaceId, file.id).data?.annotations ?? [];
  const addAnn = useAddAnnotation(workspaceId, file.id);
  const removeAnn = useDeleteAnnotation(workspaceId, file.id);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Track active annotation via rAF rather than React's onTimeUpdate (which
  // would flood state updates at 60Hz). Toggling state only when the active
  // pin actually changes keeps the player smooth.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v && annotations.length) {
        const tMs = v.currentTime * 1000;
        const hit = annotations.find(
          (a) => tMs >= a.t_start_ms && tMs <= a.t_end_ms,
        );
        const hitId = hit?.id ?? null;
        setActiveId((prev) => (prev === hitId ? prev : hitId));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [annotations]);

  const seek = (ms: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = ms / 1000;
    void v.play();
  };

  const addAtCurrentFrame = async () => {
    const v = videoRef.current;
    if (!v) return;
    const tMs = Math.round(v.currentTime * 1000);
    const label = window.prompt(t("labelPrompt"), "");
    if (!label) return;
    await addAnn.mutateAsync({
      t_start_ms: tMs,
      t_end_ms: tMs + 2000,
      label,
    });
  };

  if (!file.file_url) return null;

  return (
    <div className="space-y-3" data-testid="video-annotated-player">
      <video
        ref={videoRef}
        src={file.file_url}
        controls
        className="w-full rounded-md bg-black"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration * 1000)}
      />

      {/* Custom timeline with annotation pins */}
      <div className="relative h-10 rounded-md bg-muted/40">
        {duration > 0 &&
          annotations.map((a) => (
            <button
              key={a.id}
              data-testid="video-annotation-pin"
              data-annotation-id={a.id}
              onClick={() => seek(a.t_start_ms)}
              title={a.label}
              className={cn(
                "group absolute top-0 h-full -translate-x-1/2 transition",
                a.id === activeId
                  ? "ring-2 ring-primary-500 z-10"
                  : "hover:z-10",
              )}
              style={{ left: `${(a.t_start_ms / duration) * 100}%` }}
            >
              <span
                className={cn(
                  "block h-full w-1.5 rounded-full",
                  a.source === "manual" ? "bg-emerald-500" : "bg-primary-500",
                )}
              />
              <span className="invisible absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-accent/95 px-2 py-1 text-xs text-foreground shadow-lg group-hover:visible">
                {a.label}
              </span>
            </button>
          ))}
      </div>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={addAtCurrentFrame}
          data-testid="video-add-annotation"
          className="inline-flex items-center gap-1 rounded-md bg-primary-600/20 px-2 py-1 text-primary-300 hover:bg-primary-600/30"
        >
          <Plus className="h-3 w-3" />
          {t("addAtCurrentFrame")}
        </button>
        <span className="text-muted-foreground">
          {t("annotationsCount", { count: annotations.length })}
        </span>
      </div>

      {/* List view */}
      <ul className="space-y-1" data-testid="video-annotation-list">
        {annotations.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between rounded-md bg-background/40 px-2 py-1 text-xs"
          >
            <button
              onClick={() => seek(a.t_start_ms)}
              className="text-left text-foreground hover:underline"
            >
              <span className="text-muted-foreground">
                {fmtMs(a.t_start_ms)}
              </span>{" "}
              {a.label}
            </button>
            {a.source === "manual" && (
              <button
                onClick={() => removeAnn.mutate(a.id)}
                className="text-muted-foreground hover:text-red-400"
              >
                {t("delete")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function fmtMs(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
