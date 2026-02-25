"use client";

import { Extension } from "@tiptap/core";
import Suggestion, { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { createRoot, Root } from "react-dom/client";
import { createElement } from "react";

// ─── Command Definitions ───────────────────────────────────────────

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  iconSvg: string; // SVG path for vanilla DOM rendering
  category: string;
  action: (editor: SuggestionProps["editor"]) => void;
}

const SLASH_COMMANDS: SlashCommand[] = [
  // Text
  {
    id: "heading1",
    label: "Heading 1",
    description: "Large section heading",
    iconSvg: "M4 12h8M4 18V6M12 18V6M17 12l3-6v12",
    category: "Text",
    action: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "heading2",
    label: "Heading 2",
    description: "Medium section heading",
    iconSvg: "M4 12h8M4 18V6M12 18V6M21 18h-5c0-3 5-3 5-6 0-1.5-1.5-3-3.5-2.5",
    category: "Text",
    action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "heading3",
    label: "Heading 3",
    description: "Small section heading",
    iconSvg: "M4 12h8M4 18V6M12 18V6M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2M17.5 13.5c1.7 1 3.5 0 3.5-1.5",
    category: "Text",
    action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  // Lists
  {
    id: "bullet_list",
    label: "Bullet List",
    description: "Create a simple bulleted list",
    iconSvg: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    category: "Lists",
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "numbered_list",
    label: "Numbered List",
    description: "Create a numbered list",
    iconSvg: "M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1",
    category: "Lists",
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "task_list",
    label: "Task List",
    description: "Track tasks with checkboxes",
    iconSvg: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
    category: "Lists",
    action: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  // Blocks
  {
    id: "blockquote",
    label: "Quote",
    description: "Capture a quotation",
    iconSvg: "M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3",
    category: "Blocks",
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code_block",
    label: "Code Block",
    description: "Write a code snippet",
    iconSvg: "M16 18l6-6-6-6M8 6l-6 6 6 6",
    category: "Blocks",
    action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "divider",
    label: "Divider",
    description: "Visually divide sections",
    iconSvg: "M5 12h14",
    category: "Blocks",
    action: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  // Insert
  {
    id: "table",
    label: "Table",
    description: "Insert a simple table",
    iconSvg: "M12 3v18M3 9h18M3 15h18M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z",
    category: "Insert",
    action: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "image",
    label: "Image",
    description: "Embed an image from URL",
    iconSvg: "M21 15V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10m18 0l-3.5-3.5a2 2 0 00-3 0L3 21m18-6v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
    category: "Insert",
    action: (editor) => {
      const url = window.prompt("Image URL");
      if (url) editor.chain().focus().setImage({ src: url }).run();
    },
  },
  {
    id: "database",
    label: "Database",
    description: "Insert an inline database table",
    iconSvg: "M21 5c0 1.1-3.6 2-8 2s-8-.9-8-2m16 0c0-1.1-3.6-2-8-2s-8 .9-8 2m16 0v6M5 5v6m0 0c0 1.1 3.6 2 8 2s8-.9 8-2M5 11v6c0 1.1 3.6 2 8 2s8-.9 8-2v-6",
    category: "Insert",
    action: (editor) => {
      editor
        .chain()
        .focus()
        .insertContent({ type: "inlineDatabase", attrs: { tableId: null } })
        .run();
    },
  },
];

// ─── Vanilla DOM Command List ──────────────────────────────────────

function createIcon(svgPath: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", svgPath);
  svg.appendChild(path);
  return svg;
}

class CommandListDOM {
  element: HTMLDivElement;
  private items: SlashCommand[] = [];
  private selectedIndex = 0;
  private onSelect: ((item: SlashCommand) => void) | null = null;
  private buttons: HTMLButtonElement[] = [];

  constructor() {
    this.element = document.createElement("div");
    this.element.style.cssText =
      "background:var(--popover);border:1px solid var(--border);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.4);overflow:hidden;width:260px;max-height:320px;overflow-y:auto;";
  }

  update(items: SlashCommand[], onSelect: (item: SlashCommand) => void) {
    this.items = items;
    this.selectedIndex = 0;
    this.onSelect = onSelect;
    this.render();
  }

  private render() {
    this.element.innerHTML = "";
    this.buttons = [];

    if (this.items.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:12px;font-size:13px;color:var(--muted-foreground);";
      empty.textContent = "No commands found";
      this.element.appendChild(empty);
      return;
    }

    // Group by category
    let lastCategory = "";
    this.items.forEach((item, idx) => {
      if (item.category !== lastCategory) {
        lastCategory = item.category;
        const header = document.createElement("div");
        header.style.cssText =
          "padding:10px 12px 4px;font-size:10px;font-weight:600;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:0.05em;";
        header.textContent = item.category;
        this.element.appendChild(header);
      }

      const btn = document.createElement("button");
      btn.style.cssText =
        "width:100%;display:flex;align-items:center;gap:10px;padding:8px 12px;text-align:left;border:none;background:transparent;cursor:pointer;transition:background 0.1s;font-family:inherit;";
      btn.dataset.index = String(idx);

      const iconWrap = document.createElement("div");
      iconWrap.style.cssText =
        "padding:6px;border-radius:6px;background:var(--muted);color:var(--muted-foreground);flex-shrink:0;display:flex;align-items:center;justify-content:center;";
      iconWrap.appendChild(createIcon(item.iconSvg));

      const textWrap = document.createElement("div");
      textWrap.style.cssText = "min-width:0;overflow:hidden;";

      const label = document.createElement("div");
      label.style.cssText = "font-size:13px;font-weight:500;color:var(--foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      label.textContent = item.label;

      const desc = document.createElement("div");
      desc.style.cssText = "font-size:11px;color:var(--muted-foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      desc.textContent = item.description;

      textWrap.appendChild(label);
      textWrap.appendChild(desc);
      btn.appendChild(iconWrap);
      btn.appendChild(textWrap);

      btn.addEventListener("click", () => {
        this.onSelect?.(item);
      });

      btn.addEventListener("mouseenter", () => {
        this.selectedIndex = idx;
        this.highlightSelected();
      });

      this.element.appendChild(btn);
      this.buttons.push(btn);
    });

    this.highlightSelected();
  }

  private highlightSelected() {
    this.buttons.forEach((btn, i) => {
      btn.style.background = i === this.selectedIndex ? "var(--accent)" : "transparent";
    });
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === "ArrowUp") {
      this.selectedIndex = (this.selectedIndex + this.items.length - 1) % this.items.length;
      this.highlightSelected();
      this.buttons[this.selectedIndex]?.scrollIntoView({ block: "nearest" });
      return true;
    }
    if (event.key === "ArrowDown") {
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
      this.highlightSelected();
      this.buttons[this.selectedIndex]?.scrollIntoView({ block: "nearest" });
      return true;
    }
    if (event.key === "Enter") {
      const item = this.items[this.selectedIndex];
      if (item) this.onSelect?.(item);
      return true;
    }
    return false;
  }
}

// ─── Suggestion Config ─────────────────────────────────────────────

const suggestionConfig = {
  items: ({ query }: { query: string }) => {
    const q = query.toLowerCase();
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.id.includes(q)
    );
  },

  render: () => {
    let commandList: CommandListDOM | null = null;
    let popup: TippyInstance | null = null;

    return {
      onStart: (props: SuggestionProps) => {
        commandList = new CommandListDOM();
        commandList.update(props.items as SlashCommand[], (item) => {
          props.command(item);
        });

        if (!props.clientRect) return;

        popup = tippy(document.body, {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: commandList.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
          animation: false,
          maxWidth: "none",
        });
      },

      onUpdate: (props: SuggestionProps) => {
        commandList?.update(props.items as SlashCommand[], (item) => {
          props.command(item);
        });
        if (props.clientRect && popup) {
          popup.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
        }
      },

      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === "Escape") {
          popup?.hide();
          return true;
        }
        return commandList?.onKeyDown(props.event) ?? false;
      },

      onExit: () => {
        popup?.destroy();
        commandList = null;
      },
    };
  },

  char: "/",
  allowSpaces: false,
  startOfLine: false,

  command: ({
    editor,
    range,
    props,
  }: {
    editor: SuggestionProps["editor"];
    range: { from: number; to: number };
    props: SlashCommand;
  }) => {
    // Delete the slash + query text
    editor.chain().focus().deleteRange(range).run();
    // Execute the command action
    props.action(editor);
  },
};

// ─── Extension ─────────────────────────────────────────────────────

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: suggestionConfig,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

export default SlashCommands;
