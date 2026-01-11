"use client";

import { CheckCircle } from "lucide-react";
import { themeToCSSSVariables, tipTapToHtml, getFormContainerStyles } from "@/lib/formThemeUtils";
import type { ThankYouPageConfig, FormTheme } from "@/lib/formThemeTypes";

interface ThankYouPreviewProps {
  config: ThankYouPageConfig;
  theme: FormTheme;
  ticketNumber?: number;
}

export function ThankYouPreview({ config, theme, ticketNumber }: ThankYouPreviewProps) {
  const cssVars = themeToCSSSVariables(theme);
  const containerStyles = getFormContainerStyles(theme);

  const content = config.content;
  const layout = config.layout;

  // Convert TipTap message to HTML
  const messageHtml = tipTapToHtml(content?.message);

  // Get animation class
  const animationClass = layout?.animation === "slide"
    ? "animate-slide-up"
    : layout?.animation === "none"
    ? ""
    : "animate-fade-in";

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        ...containerStyles,
        height: "400px",
      }}
    >
      <div
        className={`h-full flex items-center justify-center p-6 ${animationClass}`}
        style={{
          textAlign: layout?.alignment || "center",
        }}
      >
        <div
          style={{
            maxWidth: layout?.max_width || "480px",
            padding: layout?.padding || "24px",
            width: "100%",
          }}
        >
          {/* Success Icon */}
          <div
            className="mb-4"
            style={{ textAlign: layout?.alignment || "center" }}
          >
            <CheckCircle
              className="inline-block"
              style={{
                width: "48px",
                height: "48px",
                color: "var(--form-success, #22c55e)",
              }}
            />
          </div>

          {/* Image (top position) */}
          {content?.image?.url && content.image.position === "top" && (
            <div
              className="mb-4"
              style={{ textAlign: layout?.alignment || "center" }}
            >
              <img
                src={content.image.url}
                alt={content.image.alt || ""}
                style={{
                  maxWidth: content.image.max_width || "200px",
                  display: "inline-block",
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}

          {/* Message */}
          {messageHtml ? (
            <div
              className="prose prose-invert max-w-none mb-4"
              style={{
                color: "var(--form-text)",
                textAlign: layout?.alignment || "center",
              }}
              dangerouslySetInnerHTML={{ __html: messageHtml }}
            />
          ) : (
            <div className="mb-4">
              <h1
                className="text-2xl font-bold mb-2"
                style={{ color: "var(--form-text)" }}
              >
                Thank You!
              </h1>
              <p style={{ color: "var(--form-text-secondary)" }}>
                Your submission has been received.
              </p>
            </div>
          )}

          {/* Ticket Number */}
          {content?.show_ticket_number !== false && ticketNumber && (
            <div
              className="mb-6 p-4 rounded-lg inline-block"
              style={{
                backgroundColor: "var(--form-surface, #ffffff)",
                border: "1px solid var(--form-border, #e2e8f0)",
              }}
            >
              <p
                className="text-sm mb-1"
                style={{ color: "var(--form-text-secondary)" }}
              >
                {content?.ticket_number_label || "Your Reference Number"}
              </p>
              <p
                className="text-xl font-mono font-bold"
                style={{ color: "var(--form-primary)" }}
              >
                TKT-{ticketNumber}
              </p>
            </div>
          )}

          {/* Image (bottom position) */}
          {content?.image?.url && content.image.position === "bottom" && (
            <div
              className="mb-4"
              style={{ textAlign: layout?.alignment || "center" }}
            >
              <img
                src={content.image.url}
                alt={content.image.alt || ""}
                style={{
                  maxWidth: content.image.max_width || "200px",
                  display: "inline-block",
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}

          {/* Buttons */}
          {content?.buttons && content.buttons.length > 0 && (
            <div
              className="flex gap-3 flex-wrap"
              style={{
                justifyContent: layout?.alignment === "left" ? "flex-start" : "center",
              }}
            >
              {content.buttons.map((button, index) => {
                const isPrimary = button.style === "primary";
                const isLink = button.style === "link";

                return (
                  <button
                    key={button.id || index}
                    type="button"
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      isLink ? "underline" : ""
                    }`}
                    style={
                      isPrimary
                        ? {
                            backgroundColor: "var(--form-btn-primary-bg, var(--form-primary))",
                            color: "var(--form-btn-primary-text, #fff)",
                            borderRadius: "var(--form-btn-primary-radius, var(--form-border-radius))",
                          }
                        : isLink
                        ? {
                            color: "var(--form-primary)",
                            backgroundColor: "transparent",
                          }
                        : {
                            backgroundColor: "var(--form-btn-secondary-bg, transparent)",
                            color: "var(--form-btn-secondary-text, var(--form-primary))",
                            border: "1px solid var(--form-btn-secondary-border, var(--form-primary))",
                            borderRadius: "var(--form-border-radius, 6px)",
                          }
                    }
                  >
                    {button.text}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
        .animate-slide-up {
          animation: slide-up 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}
