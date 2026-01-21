"use client";

import { useState } from "react";
import { User, Mail, Phone, Loader2 } from "lucide-react";
import { CustomQuestion } from "@/lib/booking-api";

interface BookingFormProps {
  questions?: CustomQuestion[];
  onSubmit: (data: BookingFormData) => void;
  loading?: boolean;
  paymentEnabled?: boolean;
  paymentAmount?: number | null;
  paymentCurrency?: string;
  className?: string;
}

export interface BookingFormData {
  name: string;
  email: string;
  phone?: string;
  answers: Record<string, string | boolean>;
}

export function BookingForm({
  questions = [],
  onSubmit,
  loading = false,
  paymentEnabled = false,
  paymentAmount,
  paymentCurrency = "USD",
  className = "",
}: BookingFormProps) {
  const [formData, setFormData] = useState<BookingFormData>({
    name: "",
    email: "",
    phone: "",
    answers: {},
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email address";
    }

    questions.forEach((q) => {
      if (q.required && !formData.answers[q.id]) {
        newErrors[q.id] = "This field is required";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const updateAnswer = (questionId: string, value: string | boolean) => {
    setFormData({
      ...formData,
      answers: { ...formData.answers, [questionId]: value },
    });
    if (errors[questionId]) {
      setErrors({ ...errors, [questionId]: "" });
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Your Name *
        </label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={formData.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value });
              if (errors.name) setErrors({ ...errors, name: "" });
            }}
            className={`w-full pl-10 pr-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.name
                ? "border-red-300 dark:border-red-700"
                : "border-gray-300 dark:border-gray-600"
            }`}
            placeholder="John Doe"
          />
        </div>
        {errors.name && (
          <p className="mt-1 text-sm text-red-500">{errors.name}</p>
        )}
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Email Address *
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="email"
            value={formData.email}
            onChange={(e) => {
              setFormData({ ...formData, email: e.target.value });
              if (errors.email) setErrors({ ...errors, email: "" });
            }}
            className={`w-full pl-10 pr-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.email
                ? "border-red-300 dark:border-red-700"
                : "border-gray-300 dark:border-gray-600"
            }`}
            placeholder="john@example.com"
          />
        </div>
        {errors.email && (
          <p className="mt-1 text-sm text-red-500">{errors.email}</p>
        )}
      </div>

      {/* Phone (Optional) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Phone Number
        </label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="+1 (555) 123-4567"
          />
        </div>
      </div>

      {/* Custom Questions */}
      {questions.map((question) => (
        <div key={question.id}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {question.label} {question.required && "*"}
          </label>
          {question.type === "text" && (
            <input
              type="text"
              value={(formData.answers[question.id] as string) || ""}
              onChange={(e) => updateAnswer(question.id, e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors[question.id]
                  ? "border-red-300 dark:border-red-700"
                  : "border-gray-300 dark:border-gray-600"
              }`}
              placeholder={question.placeholder || ""}
            />
          )}
          {question.type === "textarea" && (
            <textarea
              value={(formData.answers[question.id] as string) || ""}
              onChange={(e) => updateAnswer(question.id, e.target.value)}
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors[question.id]
                  ? "border-red-300 dark:border-red-700"
                  : "border-gray-300 dark:border-gray-600"
              }`}
              placeholder={question.placeholder || ""}
            />
          )}
          {question.type === "select" && question.options && (
            <select
              value={(formData.answers[question.id] as string) || ""}
              onChange={(e) => updateAnswer(question.id, e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors[question.id]
                  ? "border-red-300 dark:border-red-700"
                  : "border-gray-300 dark:border-gray-600"
              }`}
            >
              <option value="">Select an option</option>
              {question.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
          {question.type === "checkbox" && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!formData.answers[question.id]}
                onChange={(e) => updateAnswer(question.id, e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {question.placeholder || "Yes"}
              </span>
            </label>
          )}
          {errors[question.id] && (
            <p className="mt-1 text-sm text-red-500">{errors[question.id]}</p>
          )}
        </div>
      ))}

      {/* Payment Summary */}
      {paymentEnabled && paymentAmount && paymentAmount > 0 && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Total due
            </span>
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: paymentCurrency,
              }).format(paymentAmount / 100)}
            </span>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading
          ? "Confirming..."
          : paymentEnabled && paymentAmount
            ? "Pay & Confirm Booking"
            : "Confirm Booking"}
      </button>
    </form>
  );
}
