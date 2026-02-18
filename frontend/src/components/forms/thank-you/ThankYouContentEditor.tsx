"use client";

import { useState } from "react";
import { Bold, Italic, Underline, Link, Heading1, Heading2, List, ListOrdered, AlignLeft, AlignCenter } from "lucide-react";
import type { TipTapDocument, TipTapNode } from "@/lib/formThemeTypes";

interface ThankYouContentEditorProps {
  content: TipTapDocument | null | undefined;
  onChange: (content: TipTapDocument) => void;
}

// Simple rich text editor - in production you'd use TipTap or similar
export function ThankYouContentEditor({ content, onChange }: ThankYouContentEditorProps) {
  // Convert TipTap format to HTML for editing
  const [html, setHtml] = useState(() => tipTapToHtml(content));

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newHtml = e.target.value;
    setHtml(newHtml);
    // Convert HTML back to TipTap format
    onChange(htmlToTipTap(newHtml));
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground">
        Thank You Message
      </label>

      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 bg-muted rounded-t-lg border border-border border-b-0">
        <button
          type="button"
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="Underline"
        >
          <Underline className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-accent mx-1" />
        <button
          type="button"
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-accent mx-1" />
        <button
          type="button"
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-accent mx-1" />
        <button
          type="button"
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="Link"
        >
          <Link className="w-4 h-4" />
        </button>
      </div>

      {/* Editor */}
      <textarea
        value={html}
        onChange={handleChange}
        placeholder="# Thank You!

Your submission has been received. We'll get back to you soon."
        className="w-full h-48 px-4 py-3 bg-background border border-border rounded-b-lg text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50"
      />

      <p className="text-xs text-muted-foreground">
        Use Markdown: # for heading, **bold**, *italic*, [link](url)
      </p>
    </div>
  );
}

// Simple TipTap to markdown-ish HTML conversion
function tipTapToHtml(doc: TipTapDocument | null | undefined): string {
  if (!doc || !doc.content) return "";

  return doc.content.map((node) => nodeToText(node)).join("\n\n");
}

function nodeToText(node: TipTapNode): string {
  if (node.type === "text") {
    let text = node.text || "";
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "bold") text = `**${text}**`;
        if (mark.type === "italic") text = `*${text}*`;
        if (mark.type === "link") text = `[${text}](${mark.attrs?.href || "#"})`;
      }
    }
    return text;
  }

  const children = node.content ? node.content.map(nodeToText).join("") : "";

  switch (node.type) {
    case "heading":
      const level = (node.attrs?.level as number) || 1;
      return "#".repeat(level) + " " + children;
    case "paragraph":
      return children;
    case "bulletList":
      return node.content ? node.content.map((li) => "- " + nodeToText(li)).join("\n") : "";
    case "orderedList":
      return node.content ? node.content.map((li, i) => `${i + 1}. ` + nodeToText(li)).join("\n") : "";
    case "listItem":
      return children;
    default:
      return children;
  }
}

// Simple markdown to TipTap conversion
function htmlToTipTap(markdown: string): TipTapDocument {
  const lines = markdown.split("\n").filter((l) => l.trim());
  const content: TipTapNode[] = [];

  for (const line of lines) {
    if (line.startsWith("# ")) {
      content.push({
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: line.slice(2) }],
      });
    } else if (line.startsWith("## ")) {
      content.push({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: line.slice(3) }],
      });
    } else if (line.startsWith("### ")) {
      content.push({
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: line.slice(4) }],
      });
    } else {
      // Parse inline formatting
      const textContent = parseInlineFormatting(line);
      content.push({
        type: "paragraph",
        content: textContent,
      });
    }
  }

  return { type: "doc", content };
}

function parseInlineFormatting(text: string): TipTapNode[] {
  // Simple parser - in production use a proper markdown parser
  const nodes: TipTapNode[] = [];

  // Handle bold **text**
  const boldRegex = /\*\*(.+?)\*\*/g;
  // Handle italic *text*
  const italicRegex = /\*(.+?)\*/g;
  // Handle links [text](url)
  const linkRegex = /\[(.+?)\]\((.+?)\)/g;

  let remaining = text;
  let lastIndex = 0;

  // Simple implementation - just return as plain text for now
  // A full implementation would parse all formatting
  if (remaining) {
    nodes.push({ type: "text", text: remaining });
  }

  return nodes;
}
