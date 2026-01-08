"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  Database,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { motion } from "framer-motion";

type ImportMethod = "csv" | "manual" | "skip";

export default function DataImport() {
  const router = useRouter();
  const [selectedMethod, setSelectedMethod] = useState<ImportMethod | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "text/csv" || file.name.endsWith(".csv"))) {
      setUploadedFile(file);
      setSelectedMethod("csv");
      simulateUpload();
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setSelectedMethod("csv");
      simulateUpload();
    }
  };

  const simulateUpload = () => {
    setUploadStatus("uploading");
    setTimeout(() => {
      setUploadStatus("success");
    }, 1500);
  };

  const handleContinue = () => {
    localStorage.setItem("crm_onboarding_import", selectedMethod || "skip");
    router.push("/crm/onboarding/connect");
  };

  const importMethods = [
    {
      id: "csv" as ImportMethod,
      icon: FileSpreadsheet,
      title: "Import from CSV",
      description: "Upload a spreadsheet with your contacts and companies",
      color: "from-green-500 to-emerald-600",
    },
    {
      id: "manual" as ImportMethod,
      icon: Database,
      title: "Add manually",
      description: "Start fresh and add records one by one",
      color: "from-blue-500 to-blue-600",
    },
    {
      id: "skip" as ImportMethod,
      icon: Sparkles,
      title: "Start empty",
      description: "Set up later - explore the CRM first",
      color: "from-slate-500 to-slate-600",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Progress indicator - 6 steps now with connect */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              step <= 3
                ? "w-8 bg-purple-500"
                : "w-4 bg-slate-700"
            }`}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-3">
            Import your data
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto">
            Bring your existing contacts and companies into Aexy CRM,
            or start fresh.
          </p>
        </div>

        {/* Import method selection */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          {importMethods.map((method) => {
            const isSelected = selectedMethod === method.id;
            return (
              <motion.button
                key={method.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setSelectedMethod(method.id);
                  if (method.id !== "csv") {
                    setUploadedFile(null);
                    setUploadStatus("idle");
                  }
                }}
                className={`relative p-5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-slate-800/80 border-purple-500/50 ring-2 ring-purple-500/20"
                    : "bg-slate-800/30 border-slate-700/50 hover:border-slate-600/50"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="w-5 h-5 text-purple-400" />
                  </div>
                )}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${method.color} flex items-center justify-center mb-4`}>
                  <method.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-white mb-1">{method.title}</h3>
                <p className="text-sm text-slate-400">{method.description}</p>
              </motion.button>
            );
          })}
        </div>

        {/* CSV Upload area */}
        {selectedMethod === "csv" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-8"
          >
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                isDragging
                  ? "border-purple-500 bg-purple-500/10"
                  : uploadedFile
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-slate-700 hover:border-slate-600"
              }`}
            >
              {uploadedFile ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-3">
                    {uploadStatus === "uploading" ? (
                      <div className="w-10 h-10 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                    ) : uploadStatus === "success" ? (
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-green-400" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                        <AlertCircle className="w-6 h-6 text-red-400" />
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-white font-medium">{uploadedFile.name}</p>
                    <p className="text-sm text-slate-400">
                      {(uploadedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>

                  {uploadStatus === "success" && (
                    <p className="text-sm text-green-400">
                      File ready for import
                    </p>
                  )}

                  <button
                    onClick={() => {
                      setUploadedFile(null);
                      setUploadStatus("idle");
                    }}
                    className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Remove file
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-slate-500 mx-auto mb-4" />
                  <p className="text-white font-medium mb-1">
                    Drop your CSV file here
                  </p>
                  <p className="text-sm text-slate-400 mb-4">
                    or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <p className="text-xs text-slate-500">
                    Supports CSV files up to 10MB
                  </p>
                </>
              )}
            </div>

            {/* CSV format guide */}
            <div className="mt-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
              <h4 className="text-sm font-medium text-white mb-2">CSV Format Guide</h4>
              <p className="text-xs text-slate-400 mb-2">
                Your CSV should include headers in the first row. Supported columns:
              </p>
              <div className="flex flex-wrap gap-2">
                {["name", "email", "company", "phone", "title", "website", "notes"].map((col) => (
                  <span key={col} className="px-2 py-0.5 rounded bg-slate-700/50 text-xs text-slate-300 font-mono">
                    {col}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-800">
          <button
            onClick={() => router.push("/crm/onboarding/template")}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <button
            onClick={handleContinue}
            disabled={!selectedMethod || (selectedMethod === "csv" && uploadStatus !== "success")}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              selectedMethod && (selectedMethod !== "csv" || uploadStatus === "success")
                ? "bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 shadow-lg shadow-purple-500/25"
                : "bg-slate-800 text-slate-500 cursor-not-allowed"
            }`}
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
