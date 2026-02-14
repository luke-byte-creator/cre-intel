"use client";

import { useState } from "react";

export default function InquirePage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    tenantName: "",
    tenantEmail: "",
    tenantPhone: "",
    propertyOfInterest: "",
    businessDescription: "",
    spaceNeedsSf: "",
    tenantCompany: "",
    timeline: "",
    notes: "",
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.tenantName.trim()) e.tenantName = "Full name is required";
    if (!form.tenantEmail.trim()) e.tenantEmail = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.tenantEmail)) e.tenantEmail = "Please enter a valid email";
    if (!form.tenantPhone.trim()) e.tenantPhone = "Phone is required";
    else if (!/\d{7,}/.test(form.tenantPhone.replace(/\D/g, ""))) e.tenantPhone = "Please enter a valid phone number";
    if (!form.propertyOfInterest.trim()) e.propertyOfInterest = "Property of interest is required";
    if (!form.businessDescription.trim()) e.businessDescription = "Business description is required";
    if (!form.spaceNeedsSf.trim()) e.spaceNeedsSf = "Space requirements are required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "form", submittedBy: "tenant" }),
      });
      if (res.ok) setSubmitted(true);
      else {
        const data = await res.json().catch(() => ({}));
        setErrors({ submit: data.error || "Something went wrong. Please try again." });
      }
    } catch {
      setErrors({ submit: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#fafafa",
        color: "#1a1a1a",
        overflowY: "auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 20px 60px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "#111" }}>
            Inquiry Form
          </h1>
{/* removed */}
        </div>

        {submitted ? (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#10b981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                animation: "scaleIn 0.3s ease",
              }}
            >
              <svg width="28" height="28" fill="none" stroke="white" strokeWidth="3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Thank you!</h2>
            <p style={{ color: "#666", fontSize: 15 }}>We&apos;ll be in touch shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20, color: "#333" }}>
              Tell us about your space needs
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="Full Name *" error={errors.tenantName}>
                <input type="text" value={form.tenantName} onChange={set("tenantName")} placeholder="Your full name" style={inputStyle(!!errors.tenantName)} />
              </Field>

              <Field label="Email *" error={errors.tenantEmail}>
                <input type="email" value={form.tenantEmail} onChange={set("tenantEmail")} placeholder="you@example.com" style={inputStyle(!!errors.tenantEmail)} />
              </Field>

              <Field label="Phone *" error={errors.tenantPhone}>
                <input type="tel" value={form.tenantPhone} onChange={set("tenantPhone")} placeholder="306-555-0100" style={inputStyle(!!errors.tenantPhone)} />
              </Field>

              <Field label="Property of Interest *" error={errors.propertyOfInterest}>
                <input type="text" value={form.propertyOfInterest} onChange={set("propertyOfInterest")} placeholder="e.g. 410 22nd St E, Suite 200" style={inputStyle(!!errors.propertyOfInterest)} />
              </Field>

              <Field label="Business Description *" error={errors.businessDescription}>
                <input type="text" value={form.businessDescription} onChange={set("businessDescription")} placeholder="e.g. Dental clinic, law firm, logistics company" style={inputStyle(!!errors.businessDescription)} />
              </Field>

              <Field label="Space Requirements *" error={errors.spaceNeedsSf}>
                <input type="text" value={form.spaceNeedsSf} onChange={set("spaceNeedsSf")} placeholder="e.g. 2,000-5,000 sf" style={inputStyle(!!errors.spaceNeedsSf)} />
              </Field>

              <Field label="Company Name">
                <input type="text" value={form.tenantCompany} onChange={set("tenantCompany")} placeholder="Company name (optional)" style={inputStyle(false)} />
              </Field>

              <Field label="Timeline">
                <select value={form.timeline} onChange={set("timeline")} style={inputStyle(false)}>
                  <option value="">Select timeline</option>
                  <option>Immediate</option>
                  <option>1-3 months</option>
                  <option>3-6 months</option>
                  <option>6-12 months</option>
                  <option>12+ months</option>
                </select>
              </Field>

              <Field label="Additional Notes">
                <textarea value={form.notes} onChange={set("notes")} placeholder="Tell us about your needs..." rows={3} style={{ ...inputStyle(false), resize: "vertical" as const }} />
              </Field>
            </div>

            {errors.submit && (
              <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{errors.submit}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%",
                marginTop: 24,
                padding: "14px",
                background: submitting ? "#999" : "#111",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Submitting..." : "Submit Inquiry"}
            </button>
          </form>
        )}
      </div>

      <style>{`
        @keyframes scaleIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 14px",
    border: `1px solid ${hasError ? "#ef4444" : "#ddd"}`,
    borderRadius: 8,
    fontSize: 15,
    background: "#fff",
    color: "#111",
    outline: "none",
    boxSizing: "border-box",
  };
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#444", marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {error && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  );
}
