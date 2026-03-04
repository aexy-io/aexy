import { useState, useCallback, useRef } from "react";

export interface MentionItem {
  id: string;
  name: string;
  type: "user" | "agent";
  /** Only for agents */
  handle?: string | null;
  avatarUrl?: string | null;
}

interface UseMentionReturn {
  mentionActive: boolean;
  mentionQuery: string;
  mentionIndex: number;
  mentionStartPos: number;
  /** Call from textarea onChange — pass current cursor position */
  handleChange: (cursorPos: number, value: string) => void;
  /** Call from textarea onKeyDown — returns true if the event was consumed (prevent default + don't send) */
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, itemCount: number) => boolean;
  /** Insert the selected mention into the textarea value */
  selectMention: (
    item: MentionItem,
    textareaRef: React.RefObject<HTMLTextAreaElement | null>,
    content: string,
    setContent: (v: string) => void,
  ) => void;
  /** Close the mention dropdown */
  dismiss: () => void;
}

export function useMention(): UseMentionReturn {
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const activeRef = useRef(false);

  const dismiss = useCallback(() => {
    setMentionActive(false);
    setMentionQuery("");
    setMentionIndex(0);
    setMentionStartPos(-1);
    activeRef.current = false;
  }, []);

  const handleChange = useCallback(
    (cursorPos: number, value: string) => {
      // Find the last '@' before cursor that sits after whitespace or start-of-text
      let atPos = -1;
      for (let i = cursorPos - 1; i >= 0; i--) {
        if (value[i] === "@") {
          if (i === 0 || /\s/.test(value[i - 1])) {
            atPos = i;
          }
          break;
        }
        // Stop scanning if we hit whitespace (no @ in this word)
        if (/\s/.test(value[i])) break;
      }

      if (atPos >= 0) {
        const query = value.slice(atPos + 1, cursorPos);
        // Only activate if query doesn't contain spaces (single word search)
        if (!/\s/.test(query)) {
          setMentionActive(true);
          setMentionQuery(query);
          setMentionStartPos(atPos);
          setMentionIndex(0);
          activeRef.current = true;
          return;
        }
      }

      if (activeRef.current) {
        dismiss();
      }
    },
    [dismiss],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, itemCount: number): boolean => {
      if (!activeRef.current || itemCount === 0) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % itemCount);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + itemCount) % itemCount);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        // The caller will read mentionIndex and call selectMention
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
        return true;
      }
      return false;
    },
    [dismiss],
  );

  const selectMention = useCallback(
    (
      item: MentionItem,
      textareaRef: React.RefObject<HTMLTextAreaElement | null>,
      content: string,
      setContent: (v: string) => void,
    ) => {
      if (mentionStartPos < 0) return;

      const mentionType = item.type === "agent" ? "agent" : "user";
      const replacement = `@[${item.name}](mention:${mentionType}:${item.id}) `;
      const before = content.slice(0, mentionStartPos);
      // Find end of current query (cursor position)
      const textarea = textareaRef.current;
      const cursorPos = textarea?.selectionStart ?? content.length;
      const after = content.slice(cursorPos);
      const newContent = before + replacement + after;
      setContent(newContent);

      // Reposition cursor after the inserted mention
      const newCursorPos = before.length + replacement.length;
      setTimeout(() => {
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd = newCursorPos;
          textarea.focus();
        }
      }, 0);

      dismiss();
    },
    [mentionStartPos, dismiss],
  );

  return {
    mentionActive,
    mentionQuery,
    mentionIndex,
    mentionStartPos,
    handleChange,
    handleKeyDown,
    selectMention,
    dismiss,
  };
}
