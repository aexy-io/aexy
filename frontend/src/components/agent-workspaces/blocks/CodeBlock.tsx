"use client";

interface CodeBlockProps {
  content: Record<string, unknown>;
}

export function CodeBlock({ content }: CodeBlockProps) {
  const code = (content.text as string) || (content.data as string) || "";
  const language = (content.language as string) || "";

  return (
    <div className="py-2">
      {language && (
        <span className="text-xs text-muted-foreground mb-1 block">{language}</span>
      )}
      <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-x-auto font-mono max-h-96 overflow-y-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}
