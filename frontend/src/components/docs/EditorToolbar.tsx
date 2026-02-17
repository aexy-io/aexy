"use client";

import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Undo,
  Redo,
  Save,
  Code2,
  FileText,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EditorToolbarProps {
  editor: Editor;
  onSave?: () => void;
  editorMode?: "rich" | "markdown";
  onModeToggle?: () => void;
}

export function EditorToolbar({ editor, onSave, editorMode = "rich", onModeToggle }: EditorToolbarProps) {
  // Add link
  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);

    if (url === null) {
      return;
    }

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  // Add image
  const addImage = useCallback(() => {
    const url = window.prompt("Image URL");

    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  // Add table
  const addTable = useCallback(() => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  return (
    <div className="flex items-center gap-1 px-4 py-2">
      {/* Undo/Redo - only show if history extension is available */}
      {editor.can().undo && (
        <>
          <ToolbarGroup>
            <ToolbarButton
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              tooltip="Undo"
              shortcut="⌘Z"
            >
              <Undo className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              tooltip="Redo"
              shortcut="⌘⇧Z"
            >
              <Redo className="h-4 w-4" />
            </ToolbarButton>
          </ToolbarGroup>

          <ToolbarDivider />
        </>
      )}

      {/* Text Formatting */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          tooltip="Bold"
          shortcut="⌘B"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          tooltip="Italic"
          shortcut="⌘I"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          tooltip="Underline"
          shortcut="⌘U"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
          tooltip="Strikethrough"
          shortcut="⌘⇧S"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive("code")}
          tooltip="Inline Code"
          shortcut="⌘E"
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          tooltip="Heading 1"
          shortcut="⌘⌥1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          tooltip="Heading 2"
          shortcut="⌘⌥2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          tooltip="Heading 3"
          shortcut="⌘⌥3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          tooltip="Bullet List"
          shortcut="⌘⇧8"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          tooltip="Numbered List"
          shortcut="⌘⇧7"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          isActive={editor.isActive("taskList")}
          tooltip="Task List"
          shortcut="⌘⇧9"
        >
          <CheckSquare className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Blocks */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          tooltip="Quote"
          shortcut="⌘⇧B"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          tooltip="Code Block"
        >
          <Code2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          tooltip="Horizontal Rule"
        >
          <Minus className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Insert */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={setLink}
          isActive={editor.isActive("link")}
          tooltip="Add Link"
          shortcut="⌘K"
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={addImage} tooltip="Add Image">
          <ImageIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={addTable} tooltip="Insert Table">
          <TableIcon className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarGroup>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Mode Toggle */}
      {onModeToggle && (
        <button
          onClick={onModeToggle}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition mr-2",
            editorMode === "markdown"
              ? "bg-amber-600 hover:bg-amber-500 text-white"
              : "bg-accent hover:bg-muted text-foreground"
          )}
          title={editorMode === "markdown" ? "Switch to Rich Editor" : "Switch to Markdown Mode"}
        >
          {editorMode === "markdown" ? (
            <>
              <FileText className="h-4 w-4" />
              Rich
            </>
          ) : (
            <>
              <FileCode className="h-4 w-4" />
              Markdown
            </>
          )}
        </button>
      )}

      {/* Save Button */}
      {onSave && (
        <button
          onClick={onSave}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground bg-primary-600 hover:bg-primary-500 rounded-lg transition-all duration-200 shadow-md shadow-primary-500/20 hover:shadow-primary-500/30"
        >
          <Save className="h-4 w-4" />
          Save
        </button>
      )}
    </div>
  );
}

// Toolbar Group Component
function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 bg-muted/40 rounded-md p-0.5">
      {children}
    </div>
  );
}

// Toolbar Button Component
interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  tooltip?: string;
  shortcut?: string;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  tooltip,
  shortcut,
  children,
}: ToolbarButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={cn(
          "p-1.5 rounded transition-all duration-150",
          isActive
            ? "bg-primary-500/20 text-primary-400"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/80",
          disabled && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground"
        )}
      >
        {children}
      </button>

      {/* Tooltip */}
      {showTooltip && tooltip && !disabled && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 pointer-events-none">
          <div className="bg-background border border-border text-foreground text-xs px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap flex items-center gap-2">
            <span>{tooltip}</span>
            {shortcut && (
              <span className="text-muted-foreground font-mono text-[10px]">{shortcut}</span>
            )}
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 bg-background border-l border-t border-border rotate-45" />
        </div>
      )}
    </div>
  );
}

// Divider Component
function ToolbarDivider() {
  return <div className="w-px h-5 bg-accent/50 mx-1" />;
}
