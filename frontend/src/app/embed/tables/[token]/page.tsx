"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  Lock,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  publicTablesApi,
  PublicTableSchema,
  PublicTableRecord,
} from "@/lib/api";
import { FieldRenderer } from "@/components/fields";

export default function EmbedTablePage() {
  const params = useParams();
  const token = params.token as string;

  const [schema, setSchema] = useState<PublicTableSchema | null>(null);
  const [records, setRecords] = useState<PublicTableRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const loadData = async (pw?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setPasswordError(null);

      const tableSchema = await publicTablesApi.getSchema(token, pw);
      setSchema(tableSchema);
      setNeedsPassword(false);

      const data = await publicTablesApi.getRecords(token, { skip: page * pageSize, limit: pageSize }, pw);
      setRecords(data.records);
      setTotal(data.total);
      if (pw) setPassword(pw);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        if (!pw) {
          setNeedsPassword(true);
        } else {
          setPasswordError("Incorrect password");
          setNeedsPassword(true);
        }
      } else if (status === 404) {
        setError("This table is no longer available.");
      } else {
        setError("Failed to load table.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) loadData(password);
  }, [token, page]);

  const sortedRecords = useMemo(() => {
    if (!sortField) return records;
    return [...records].sort((a, b) => {
      const aStr = String(a.values[sortField] ?? "");
      const bStr = String(b.values[sortField] ?? "");
      return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [records, sortField, sortDir]);

  const handleSort = (slug: string) => {
    if (sortField === slug) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(slug);
      setSortDir("asc");
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  // Password gate — minimal for embed
  if (needsPassword) {
    return (
      <div className="h-screen flex items-center justify-center bg-white p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = (e.target as HTMLFormElement).elements.namedItem("pw") as HTMLInputElement;
            loadData(input.value);
          }}
          className="w-full max-w-xs space-y-3 text-center"
        >
          <Lock className="h-8 w-8 text-gray-400 mx-auto" />
          <p className="text-sm text-gray-600">Password required</p>
          <input
            name="pw"
            type="password"
            autoFocus
            placeholder="Enter password"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {passwordError && (
            <p className="text-red-500 text-xs">{passwordError}</p>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {isLoading ? "..." : "Access"}
          </button>
        </form>
      </div>
    );
  }

  // Loading
  if (isLoading && !schema) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-white p-4">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!schema) return null;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-200">
              {schema.fields.map((field) => (
                <th
                  key={field.id}
                  onClick={() => handleSort(field.slug)}
                  className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none whitespace-nowrap bg-gray-50/80"
                >
                  <span className="inline-flex items-center gap-1">
                    {field.name}
                    {sortField === field.slug && (
                      sortDir === "asc"
                        ? <ChevronUp className="h-3 w-3" />
                        : <ChevronDown className="h-3 w-3" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sortedRecords.length === 0 ? (
              <tr>
                <td
                  colSpan={schema.fields.length}
                  className="px-3 py-8 text-center text-gray-400 text-sm"
                >
                  No records
                </td>
              </tr>
            ) : (
              sortedRecords.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50/50">
                  {schema.fields.map((field) => (
                    <td key={field.id} className="px-3 py-2 text-sm text-gray-700">
                      <FieldRenderer
                        value={record.values[field.slug]}
                        type={field.attribute_type}
                        config={field.options || {}}
                        surface="table_cell"
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer: record count + pagination */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-gray-50/50 text-xs text-gray-400 shrink-0">
        <span>{total} record{total !== 1 ? "s" : ""}</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-2 py-1 border border-gray-200 rounded hover:bg-white disabled:opacity-40 transition-colors"
            >
              Prev
            </button>
            <span>
              {page + 1}/{totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 border border-gray-200 rounded hover:bg-white disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
