"use client";

interface MarkdownBlockProps {
  content: Record<string, unknown>;
}

export function MarkdownBlock({ content }: MarkdownBlockProps) {
  const text = (content.text as string) || (content.data as string) || "";

  if (!text) {
    return <div className="py-2 text-xs text-muted-foreground italic">Empty content</div>;
  }

  return (
    <div className="py-2 prose prose-sm dark:prose-invert max-w-none">
      {/* Render markdown as pre-formatted text — Tiptap readonly could be used for richer rendering */}
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>
    </div>
  );
}
