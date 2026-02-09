"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Award,
  RefreshCw,
  Plus,
  X,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  complianceApi,
  CertificationWithStats,
  DeveloperCertificationWithDetails,
  Certification,
} from "@/lib/api";

// ---- Create Certification Type Modal ----
function CreateCertificationModal({
  workspaceId,
  developerId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  developerId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [validityMonths, setValidityMonths] = useState<number | "">("");
  const [renewalRequired, setRenewalRequired] = useState(true);
  const [category, setCategory] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !issuingAuthority.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await complianceApi.certifications.create(workspaceId, developerId, {
        name: name.trim(),
        description: description.trim() || undefined,
        issuing_authority: issuingAuthority.trim(),
        validity_months: validityMonths ? Number(validityMonths) : undefined,
        renewal_required: renewalRequired,
        category: category.trim() || undefined,
        is_required: isRequired,
        external_url: externalUrl.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create certification");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              New Certification Type
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Certification Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., AWS Solutions Architect"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Issuing Authority
            </label>
            <input
              type="text"
              value={issuingAuthority}
              onChange={(e) => setIssuingAuthority(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Amazon Web Services"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Brief description..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Validity (months)
              </label>
              <input
                type="number"
                value={validityMonths}
                onChange={(e) => setValidityMonths(e.target.value ? Number(e.target.value) : "")}
                min={1}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., 36"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category <span className="text-gray-400">(opt)</span>
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Cloud"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              External URL <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://..."
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={renewalRequired}
                onChange={(e) => setRenewalRequired(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Renewal required
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Required for compliance
            </label>
          </div>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !issuingAuthority.trim() || submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Certification
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Add Developer Certification Modal ----
function AddDeveloperCertModal({
  workspaceId,
  developerId,
  certifications,
  onClose,
  onAdded,
}: {
  workspaceId: string;
  developerId: string;
  certifications: CertificationWithStats[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [certificationId, setCertificationId] = useState(certifications[0]?.id || "");
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().split("T")[0]);
  const [expiryDate, setExpiryDate] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certificationId || !issuedDate) return;
    setSubmitting(true);
    setError(null);
    try {
      await complianceApi.developerCertifications.add(workspaceId, developerId, {
        certification_id: certificationId,
        developer_id: developerId,
        issued_date: issuedDate,
        expiry_date: expiryDate || undefined,
        credential_id: credentialId.trim() || undefined,
        verification_url: verificationUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onAdded();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add certification");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Add My Certification
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Certification
            </label>
            <select
              value={certificationId}
              onChange={(e) => setCertificationId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {certifications.map((cert) => (
                <option key={cert.id} value={cert.id}>
                  {cert.name} ({cert.issuing_authority})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Issued Date
              </label>
              <input
                type="date"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Expiry Date <span className="text-gray-400">(opt)</span>
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Credential ID <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., AWS-SAA-12345"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Verification URL <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="url"
              value={verificationUrl}
              onChange={(e) => setVerificationUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Additional notes..."
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!certificationId || !issuedDate || submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Certification
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Main Page ----
export default function ComplianceCertificationsPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [certifications, setCertifications] = useState<CertificationWithStats[]>([]);
  const [myCertifications, setMyCertifications] = useState<DeveloperCertificationWithDetails[]>([]);
  const [showCreateType, setShowCreateType] = useState(false);
  const [showAddMyCert, setShowAddMyCert] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    try {
      const [certsRes, myCertsRes] = await Promise.all([
        complianceApi.certifications.list(currentWorkspaceId),
        complianceApi.developerCertifications.list(currentWorkspaceId, {
          developer_id: user?.id,
        }),
      ]);
      setCertifications(certsRes.items || []);
      setMyCertifications(myCertsRes.items || []);
    } catch (err) {
      console.error("Failed to load certifications:", err);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspaceId, user?.id]);

  useEffect(() => {
    if (isAuthenticated && currentWorkspaceId) {
      fetchData();
    }
  }, [isAuthenticated, currentWorkspaceId, fetchData]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Certifications</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Track employee certifications and renewal deadlines
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchData}
            className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {certifications.length > 0 && (
            <button
              onClick={() => setShowAddMyCert(true)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
            >
              <Award className="h-4 w-4" />
              Add My Cert
            </button>
          )}
          <button
            onClick={() => setShowCreateType(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Type
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* My Certifications */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              My Certifications
            </h2>
            {myCertifications.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
                <Award className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-4">No certifications recorded</p>
                {certifications.length > 0 && (
                  <button
                    onClick={() => setShowAddMyCert(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add Certification
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-4">
                {myCertifications.map((cert) => (
                  <div
                    key={cert.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Award className="h-5 w-5 text-blue-500" />
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {cert.certification_name || "Certification"}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {cert.certification_issuing_authority}
                          {cert.credential_id && <> &middot; {cert.credential_id}</>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Issued: {new Date(cert.issued_date).toLocaleDateString()}
                          {cert.expiry_date && (
                            <> &middot; Expires: {new Date(cert.expiry_date).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {cert.verification_url && (
                        <a
                          href={cert.verification_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                          title="Verify"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          cert.status === "active"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : cert.status === "expired"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : cert.status === "expiring_soon"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                        }`}
                      >
                        {cert.status === "expiring_soon" ? "Expiring Soon" : cert.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All Certifications */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              All Certification Types
            </h2>
            {certifications.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
                <ShieldCheck className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-4">No certification types configured</p>
                <button
                  onClick={() => setShowCreateType(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Create Certification Type
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {certifications.map((cert) => (
                  <div
                    key={cert.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-blue-500" />
                        <div>
                          <h3 className="font-medium text-gray-900 dark:text-white">{cert.name}</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{cert.issuing_authority}</p>
                        </div>
                      </div>
                      {cert.is_required && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          Required
                        </span>
                      )}
                    </div>
                    {cert.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{cert.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        {cert.active_holders || 0} active
                      </span>
                      {(cert.expiring_soon_count || 0) > 0 && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <Clock className="h-3.5 w-3.5" />
                          {cert.expiring_soon_count} expiring soon
                        </span>
                      )}
                      {(cert.expired_count || 0) > 0 && (
                        <span className="flex items-center gap-1 text-red-500">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {cert.expired_count} expired
                        </span>
                      )}
                      {cert.validity_months && (
                        <span className="text-gray-400">
                          Valid: {cert.validity_months}mo
                        </span>
                      )}
                    </div>
                    {cert.external_url && (
                      <a
                        href={cert.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-2"
                      >
                        <ExternalLink className="h-3 w-3" />
                        More info
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateType && currentWorkspaceId && user?.id && (
        <CreateCertificationModal
          workspaceId={currentWorkspaceId}
          developerId={user.id}
          onClose={() => setShowCreateType(false)}
          onCreated={fetchData}
        />
      )}

      {showAddMyCert && currentWorkspaceId && user?.id && certifications.length > 0 && (
        <AddDeveloperCertModal
          workspaceId={currentWorkspaceId}
          developerId={user.id}
          certifications={certifications}
          onClose={() => setShowAddMyCert(false)}
          onAdded={fetchData}
        />
      )}
    </div>
  );
}
