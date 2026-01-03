"use client";

import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Upload,
  X,
  Mail,
  User,
  Phone,
  Trash2,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Edit2,
} from "lucide-react";
import { Assessment, EmailTemplateConfig } from "@/lib/api";
import { useAssessmentCandidates, useEmailTemplate } from "@/hooks/useAssessments";

interface Step4Props {
  assessment: Assessment;
  assessmentId: string;
  organizationId: string;
  onSave: (data: {
    candidates: Array<{ email: string; name: string; phone?: string; source?: string }>;
    email_template?: EmailTemplateConfig;
    send_immediately?: boolean;
  }) => Promise<Assessment>;
  onNext: () => void;
  onPrev: () => void;
}

interface CandidateInput {
  id: string;
  email: string;
  name: string;
  phone: string;
  source: string;
  isValid: boolean;
  error?: string;
}

const DEFAULT_EMAIL_TEMPLATE = {
  subject: "You're invited to complete an assessment",
  body: `Dear {{candidate_name}},

You have been invited to complete the {{assessment_title}} assessment.

Please click the link below to begin:
{{assessment_link}}

The assessment will be available from {{start_date}} to {{end_date}}.

Good luck!

Best regards,
{{company_name}}`,
  include_instructions: true,
  include_deadline: true,
};

export default function Step4AddCandidates({
  assessment,
  assessmentId,
  organizationId,
  onSave,
  onNext,
  onPrev,
}: Step4Props) {
  const [candidates, setCandidates] = useState<CandidateInput[]>([]);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplateConfig>(DEFAULT_EMAIL_TEMPLATE);
  const [sendImmediately, setSendImmediately] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    candidates: existingCandidates,
    isLoading: isLoadingCandidates,
    addCandidate,
    importCandidates,
    removeCandidate,
    isImporting,
    importResult,
  } = useAssessmentCandidates(assessmentId, organizationId);

  const { emailTemplate: savedTemplate, isLoading: isLoadingTemplate } = useEmailTemplate(
    assessmentId,
    organizationId
  );

  useEffect(() => {
    if (savedTemplate) {
      setEmailTemplate(savedTemplate);
    }
  }, [savedTemplate]);

  useEffect(() => {
    if (existingCandidates && existingCandidates.length > 0) {
      setCandidates(
        existingCandidates.map((c) => ({
          id: c.id,
          email: c.candidate_email || "",
          name: c.candidate_name || "",
          phone: "",
          source: c.source || "manual",
          isValid: true,
        }))
      );
    }
  }, [existingCandidates]);

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleAddCandidate = () => {
    const newCandidate: CandidateInput = {
      id: `temp-${Date.now()}`,
      email: "",
      name: "",
      phone: "",
      source: "manual",
      isValid: false,
    };
    setCandidates([...candidates, newCandidate]);
  };

  const handleCandidateChange = (id: string, field: keyof CandidateInput, value: string) => {
    setCandidates(
      candidates.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: value };
        updated.isValid = validateEmail(updated.email) && updated.name.trim().length > 0;
        if (field === "email" && value && !validateEmail(value)) {
          updated.error = "Invalid email format";
        } else {
          updated.error = undefined;
        }
        return updated;
      })
    );
  };

  const handleRemoveCandidate = async (id: string) => {
    if (id.startsWith("temp-")) {
      setCandidates(candidates.filter((c) => c.id !== id));
    } else {
      try {
        await removeCandidate(id);
        setCandidates(candidates.filter((c) => c.id !== id));
      } catch (error) {
        console.error("Failed to remove candidate:", error);
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportSuccess(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n").filter((line) => line.trim());

        if (lines.length === 0) {
          setImportError("File is empty");
          return;
        }

        // Parse header
        const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
        const emailIndex = header.findIndex((h) => h.includes("email"));
        const nameIndex = header.findIndex((h) => h.includes("name"));
        const phoneIndex = header.findIndex((h) => h.includes("phone"));

        if (emailIndex === -1) {
          setImportError("CSV must have an 'email' column");
          return;
        }

        if (nameIndex === -1) {
          setImportError("CSV must have a 'name' column");
          return;
        }

        const newCandidates: CandidateInput[] = [];
        const errors: string[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""));
          const email = values[emailIndex] || "";
          const name = values[nameIndex] || "";
          const phone = phoneIndex !== -1 ? values[phoneIndex] : "";

          if (!email || !name) continue;

          if (!validateEmail(email)) {
            errors.push(`Row ${i + 1}: Invalid email "${email}"`);
            continue;
          }

          if (candidates.some((c) => c.email === email) || newCandidates.some((c) => c.email === email)) {
            errors.push(`Row ${i + 1}: Duplicate email "${email}"`);
            continue;
          }

          newCandidates.push({
            id: `temp-${Date.now()}-${i}`,
            email,
            name,
            phone,
            source: "csv_import",
            isValid: true,
          });
        }

        if (newCandidates.length > 0) {
          setCandidates([...candidates, ...newCandidates]);
          setImportSuccess(`Successfully imported ${newCandidates.length} candidates`);
        }

        if (errors.length > 0) {
          setImportError(`${errors.length} rows had issues:\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? `\n...and ${errors.length - 5} more` : ""}`);
        }
      } catch (error) {
        setImportError("Failed to parse CSV file. Please check the format.");
      }
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const validCandidates = candidates
        .filter((c) => c.isValid)
        .map((c) => ({
          email: c.email,
          name: c.name,
          phone: c.phone || undefined,
          source: c.source,
        }));

      await onSave({
        candidates: validCandidates,
        email_template: emailTemplate,
        send_immediately: sendImmediately,
      });
      onNext();
    } catch (error) {
      console.error("Failed to save step 4:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const validCandidatesCount = candidates.filter((c) => c.isValid).length;
  const isValid = validCandidatesCount > 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Add Candidates</h2>
        <p className="text-gray-500">Invite candidates to take this assessment</p>
      </div>

      {/* Summary Bar */}
      <div className="bg-blue-50 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-blue-600 font-medium">Total Candidates</p>
            <p className="text-2xl font-bold text-blue-900">{candidates.length}</p>
          </div>
          <div>
            <p className="text-xs text-blue-600 font-medium">Valid</p>
            <p className="text-2xl font-bold text-green-600">{validCandidatesCount}</p>
          </div>
          {candidates.length - validCandidatesCount > 0 && (
            <div>
              <p className="text-xs text-blue-600 font-medium">Invalid</p>
              <p className="text-2xl font-bold text-red-600">
                {candidates.length - validCandidatesCount}
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={handleAddCandidate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Candidate
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Import Messages */}
      {importError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700 whitespace-pre-line">{importError}</div>
          <button onClick={() => setImportError(null)} className="ml-auto">
            <X className="w-4 h-4 text-red-600" />
          </button>
        </div>
      )}

      {importSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <div className="text-sm text-green-700">{importSuccess}</div>
          <button onClick={() => setImportSuccess(null)} className="ml-auto">
            <X className="w-4 h-4 text-green-600" />
          </button>
        </div>
      )}

      {/* CSV Format Help */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <FileSpreadsheet className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">CSV Format</span>
        </div>
        <p className="text-xs text-gray-500 mb-2">
          Upload a CSV file with the following columns (header required):
        </p>
        <code className="text-xs bg-white px-2 py-1 rounded border">
          email,name,phone
        </code>
      </div>

      {/* Candidates List */}
      <div className="bg-white rounded-lg border">
        {candidates.length === 0 ? (
          <div className="p-12 text-center">
            <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No candidates added</h3>
            <p className="text-gray-500 mb-4">
              Add candidates manually or import from a CSV file
            </p>
            <button
              onClick={handleAddCandidate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Add First Candidate
            </button>
          </div>
        ) : (
          <div className="divide-y">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="col-span-4">Email</div>
              <div className="col-span-3">Name</div>
              <div className="col-span-2">Phone</div>
              <div className="col-span-2">Source</div>
              <div className="col-span-1"></div>
            </div>

            {/* Rows */}
            {candidates.map((candidate) => (
              <div
                key={candidate.id}
                className={`grid grid-cols-12 gap-4 px-4 py-3 items-center ${
                  !candidate.isValid && candidate.email ? "bg-red-50" : ""
                }`}
              >
                <div className="col-span-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={candidate.email}
                      onChange={(e) => handleCandidateChange(candidate.id, "email", e.target.value)}
                      placeholder="email@example.com"
                      className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white text-gray-900 placeholder-gray-400 ${
                        candidate.error ? "border-red-300" : ""
                      }`}
                    />
                  </div>
                  {candidate.error && (
                    <p className="text-xs text-red-600 mt-1">{candidate.error}</p>
                  )}
                </div>
                <div className="col-span-3">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={candidate.name}
                      onChange={(e) => handleCandidateChange(candidate.id, "name", e.target.value)}
                      placeholder="Full Name"
                      className="w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white text-gray-900 placeholder-gray-400"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={candidate.phone}
                      onChange={(e) => handleCandidateChange(candidate.id, "phone", e.target.value)}
                      placeholder="Optional"
                      className="w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white text-gray-900 placeholder-gray-400"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <span
                    className={`inline-flex px-2 py-1 text-xs rounded-full ${
                      candidate.source === "csv_import"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {candidate.source === "csv_import" ? "CSV Import" : "Manual"}
                  </span>
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    onClick={() => handleRemoveCandidate(candidate.id)}
                    className="p-2 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Email Template */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="font-medium text-gray-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Invitation Email Template
          </h3>
          <button
            onClick={() => setShowEmailEditor(!showEmailEditor)}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            <Edit2 className="w-4 h-4" />
            {showEmailEditor ? "Hide Editor" : "Customize"}
          </button>
        </div>

        {showEmailEditor && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={emailTemplate.subject}
                onChange={(e) =>
                  setEmailTemplate({ ...emailTemplate, subject: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
              <textarea
                value={emailTemplate.body}
                onChange={(e) => setEmailTemplate({ ...emailTemplate, body: e.target.value })}
                rows={10}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm bg-white text-gray-900 placeholder-gray-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                Available variables: {"{{candidate_name}}"}, {"{{assessment_title}}"},{" "}
                {"{{assessment_link}}"}, {"{{start_date}}"}, {"{{end_date}}"}, {"{{company_name}}"}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailTemplate.include_instructions}
                  onChange={(e) =>
                    setEmailTemplate({
                      ...emailTemplate,
                      include_instructions: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-700">Include instructions</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailTemplate.include_deadline}
                  onChange={(e) =>
                    setEmailTemplate({ ...emailTemplate, include_deadline: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-700">Include deadline</span>
              </label>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer pt-2">
          <input
            type="checkbox"
            checked={sendImmediately}
            onChange={(e) => setSendImmediately(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700">
            Send invitations immediately after publishing
          </span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t">
        <button
          onClick={onPrev}
          className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          Previous
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || isSaving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? "Saving..." : "Save & Continue"}
        </button>
      </div>
    </div>
  );
}
