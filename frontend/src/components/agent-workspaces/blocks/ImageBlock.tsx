"use client";

interface ImageBlockProps {
  fileUrl: string | null;
  title: string | null;
}

export function ImageBlock({ fileUrl, title }: ImageBlockProps) {
  if (!fileUrl) {
    return <div className="py-2 text-xs text-muted-foreground italic">No image uploaded</div>;
  }

  return (
    <div className="py-2">
      <img
        src={fileUrl}
        alt={title || "Block image"}
        className="max-w-full rounded-md border"
        loading="lazy"
      />
    </div>
  );
}
