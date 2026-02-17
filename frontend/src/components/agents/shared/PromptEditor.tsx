"use client";

import { useState, useRef } from "react";
import { Info, Plus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const PROMPT_VARIABLES = [
  { name: "{{sender_name}}", description: "Name of the email sender" },
  { name: "{{sender_email}}", description: "Email address of the sender" },
  { name: "{{company_name}}", description: "Sender's company name" },
  { name: "{{subject}}", description: "Email subject line" },
  { name: "{{message_body}}", description: "Content of the email" },
  { name: "{{thread_summary}}", description: "Summary of the conversation" },
  { name: "{{contact_history}}", description: "Previous interactions with contact" },
  { name: "{{current_time}}", description: "Current date and time" },
  { name: "{{agent_name}}", description: "Name of this agent" },
];

interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  description?: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  showVariables?: boolean;
  className?: string;
}

export function PromptEditor({
  value,
  onChange,
  label,
  description,
  placeholder = "Enter your prompt...",
  rows = 8,
  disabled = false,
  showVariables = true,
  className,
}: PromptEditorProps) {
  const [showVariableMenu, setShowVariableMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.slice(0, start) + variable + value.slice(end);

    onChange(newValue);
    setShowVariableMenu(false);

    // Set cursor position after the inserted variable
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-foreground">
            {label}
          </label>
          {showVariables && (
            <div className="relative">
              <button
                type="button"
                onClick={() => !disabled && setShowVariableMenu(!showVariableMenu)}
                disabled={disabled}
                className={cn(
                  "flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                Insert variable
                <ChevronDown className="h-3.5 w-3.5" />
              </button>

              {showVariableMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowVariableMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-accent border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                    <div className="p-2 border-b border-border text-xs text-muted-foreground flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Click to insert at cursor position
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {PROMPT_VARIABLES.map((variable) => (
                        <button
                          key={variable.name}
                          onClick={() => insertVariable(variable.name)}
                          className="w-full px-3 py-2 text-left hover:bg-muted transition"
                        >
                          <div className="font-mono text-sm text-purple-400">
                            {variable.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {variable.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={cn(
          "w-full px-4 py-3 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground",
          "font-mono text-sm leading-relaxed",
          "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "resize-y min-h-[120px]"
        )}
      />

      {/* Character count */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Use double curly braces for variables: {"{{variable}}"}</span>
        <span>{value.length} characters</span>
      </div>
    </div>
  );
}

// Simpler version for custom instructions
interface InstructionsEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
}

export function InstructionsEditor({
  value,
  onChange,
  label = "Custom Instructions",
  placeholder = "Add specific instructions for how the agent should behave...",
  rows = 4,
  disabled = false,
  className,
}: InstructionsEditorProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={cn(
          "w-full px-4 py-3 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground",
          "text-sm leading-relaxed",
          "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "resize-y"
        )}
      />
    </div>
  );
}
