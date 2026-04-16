"use client";

interface TableBlockProps {
  content: Record<string, unknown>;
}

export function TableBlock({ content }: TableBlockProps) {
  const headers = (content.headers as string[]) || [];
  const rows = (content.rows as string[][]) || [];
  const text = content.text as string;

  // If content is markdown table text, render as pre
  if (text && !headers.length) {
    return (
      <div className="py-2 text-sm">
        <pre className="whitespace-pre-wrap font-mono text-xs">{text}</pre>
      </div>
    );
  }

  if (headers.length === 0) {
    return <div className="py-2 text-xs text-muted-foreground italic">No table data</div>;
  }

  return (
    <div className="py-2 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="text-left px-3 py-2 border-b font-medium text-muted-foreground text-xs"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-muted/30">
              {headers.map((_, ci) => (
                <td key={ci} className="px-3 py-1.5 border-b text-xs">
                  {row[ci] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
