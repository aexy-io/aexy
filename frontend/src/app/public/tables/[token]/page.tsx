"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Table2,
  Loader2,
  AlertCircle,
  Lock,
  ChevronUp,
  ChevronDown,
  Plus,
  CheckCircle,
  X,
} from "lucide-react";
import {
  publicTablesApi,
  PublicTableSchema,
  PublicTableRecord,
} from "@/lib/api";
import { FieldRenderer } from "@/components/fields";

function PasswordGate({
  onSubmit,
  error,
  isLoading,
}: {
  onSubmit: (password: string) => void;
  error: string | null;
  isLoading: boolean;
}) {
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Lock className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-gray-900">Password Required</h1>
          <p className="text-gray-500 text-sm mt-1">This table is password protected.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(password);
          }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4"
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoFocus
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          {error && (
            <p className="text-red-500 text-sm flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {isLoading ? "Verifying..." : "Access Table"}
          </button>
        </form>
      </div>
    </div>
  );
}

function getInputType(attributeType: string): string {
  switch (attributeType) {
    case "number":
    case "currency":
    case "rating":
      return "number";
    case "email":
      return "email";
    case "url":
      return "url";
    case "phone":
      return "tel";
    case "date":
      return "date";
    case "checkbox":
      return "checkbox";
    default:
      return "text";
  }
}

function PublicAddRecordForm({
  schema,
  password,
  token,
  onRecordAdded,
}: {
  schema: PublicTableSchema;
  password: string | undefined;
  token: string;
  onRecordAdded: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await publicTablesApi.createRecord(token, values, password);
      setSubmitted(true);
      setValues({});
      onRecordAdded();
      setTimeout(() => {
        setSubmitted(false);
        setExpanded(false);
      }, 2000);
    } catch {
      // Error handled by API interceptor
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 px-4 py-2.5 mb-6 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-sm text-gray-600 hover:text-gray-900 transition-colors w-full justify-center"
      >
        <Plus className="h-4 w-4" />
        Add a record
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Add a record</h3>
        <button
          type="button"
          onClick={() => { setExpanded(false); setValues({}); }}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {schema.fields.map((field) => {
          const inputType = getInputType(field.attribute_type);
          if (inputType === "checkbox") {
            return (
              <label key={field.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!values[field.slug]}
                  onChange={(e) => setValues({ ...values, [field.slug]: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700">{field.name}</span>
              </label>
            );
          }
          if (field.attribute_type === "select" && field.options?.options) {
            const opts = field.options.options as { value: string; label: string }[];
            return (
              <div key={field.id}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{field.name}</label>
                <select
                  value={String(values[field.slug] ?? "")}
                  onChange={(e) => setValues({ ...values, [field.slug]: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select...</option>
                  {opts.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            );
          }
          if (field.attribute_type === "textarea") {
            return (
              <div key={field.id} className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">{field.name}</label>
                <textarea
                  value={String(values[field.slug] ?? "")}
                  onChange={(e) => setValues({ ...values, [field.slug]: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  placeholder={field.name}
                  rows={3}
                />
              </div>
            );
          }
          return (
            <div key={field.id}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{field.name}</label>
              <input
                type={inputType}
                value={String(values[field.slug] ?? "")}
                onChange={(e) => setValues({ ...values, [field.slug]: inputType === "number" ? (e.target.value ? Number(e.target.value) : "") : e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder={field.name}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || submitted}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {submitted ? (
            <>
              <CheckCircle className="h-4 w-4" />
              Added!
            </>
          ) : isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Add Record
            </>
          )}
        </button>
        {!submitted && !isSubmitting && (
          <button
            type="button"
            onClick={() => { setExpanded(false); setValues({}); }}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default function PublicTablePage() {
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
        setError("This share link is no longer available.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) loadData(password);
  }, [token, page]);

  const handlePasswordSubmit = (pw: string) => {
    loadData(pw);
  };

  const sortedRecords = useMemo(() => {
    if (!sortField) return records;
    return [...records].sort((a, b) => {
      const aVal = a.values[sortField];
      const bVal = b.values[sortField];
      const aStr = String(aVal ?? "");
      const bStr = String(bVal ?? "");
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

  if (needsPassword) {
    return (
      <PasswordGate
        onSubmit={handlePasswordSubmit}
        error={passwordError}
        isLoading={isLoading}
      />
    );
  }

  if (isLoading && !schema) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading table...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Table Unavailable</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!schema) return null;

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="p-2.5 rounded-lg"
            style={{
              backgroundColor: schema.color ? `${schema.color}20` : "rgba(147, 51, 234, 0.1)",
            }}
          >
            <Table2
              className="h-6 w-6"
              style={{ color: schema.color || "#a855f7" }}
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{schema.name}</h1>
            {schema.description && (
              <p className="text-gray-500 text-sm mt-0.5">{schema.description}</p>
            )}
          </div>
          <div className="flex-1" />
          <span className="text-sm text-gray-400">{total} records</span>
        </div>

        {/* Add record form (if edit permission) */}
        {schema.permission === "edit" && (
          <PublicAddRecordForm
            schema={schema}
            password={password}
            token={token}
            onRecordAdded={() => loadData(password)}
          />
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  {schema.fields.map((field) => (
                    <th
                      key={field.id}
                      onClick={() => handleSort(field.slug)}
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                    >
                      <span className="flex items-center gap-1">
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
              <tbody className="divide-y divide-gray-100">
                {sortedRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={schema.fields.length}
                      className="px-4 py-12 text-center text-gray-400"
                    >
                      No records yet
                    </td>
                  </tr>
                ) : (
                  sortedRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50/50 transition-colors">
                      {schema.fields.map((field) => (
                        <td key={field.id} className="px-4 py-3 text-sm text-gray-700">
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50/50">
              <span className="text-sm text-gray-500">
                Page {page + 1} of {totalPages} ({total} records)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-300 text-sm mt-8">Powered by Aexy</p>
      </div>
    </div>
  );
}
