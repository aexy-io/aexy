"use client";

import { FileText } from "lucide-react";

interface PdfBlockProps {
  fileUrl: string | null;
  title: string | null;
}

export function PdfBlock({ fileUrl, title }: PdfBlockProps) {
  if (!fileUrl) {
    return <div className="py-2 text-xs text-muted-foreground italic">No PDF uploaded</div>;
  }

  return (
    <div className="py-2">
      <iframe
        src={fileUrl}
        title={title || "PDF document"}
        className="w-full h-96 rounded-md border"
      />
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2"
      >
        <FileText className="w-3 h-3" />
        Open PDF
      </a>
    </div>
  );
}
