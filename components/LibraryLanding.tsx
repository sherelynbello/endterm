"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { createIdempotencyKey, postIdempotent } from "@/lib/idempotent-fetch";
import LibraryPortal, { StudentProfile } from "@/components/LibraryPortal";

type AuthMode = "login" | "signup" | "forgot";

interface StatusNotice {
  type: "error" | "success";
  message: string;
}

const STUDENT_ID_PATTERN = /^\d{4}-\d{4}$/;

export default function LibraryLanding() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [studentId, setStudentId] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [authenticatedStudent, setAuthenticatedStudent] =
    useState<StudentProfile | null>(null);

  // Maintains a stable Idempotency-Key for the current logical submission so
  // network retries reuse the same key, while input edits or mode switches rotate it.
  const idempotencyKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  function getOrCreateIdempotencyKey(): string {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createIdempotencyKey();
    }
    return idempotencyKeyRef.current;
  }

  function rotateIdempotencyKey() {
    idempotencyKeyRef.current = null;
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setNotice(null);
    setFieldErrors({});
    setShowPassword(false);
    rotateIdempotencyKey();
  }

  function updateField(
    setter: (value: string) => void,
    fieldName: string,
    value: string
  ) {
    setter(value);
    rotateIdempotencyKey();
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
    if (notice) {
      setNotice(null);
    }
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    const trimmedId = studentId.trim();

    if (!STUDENT_ID_PATTERN.test(trimmedId)) {
      errors.studentId = "Use the format YYYY-NNNN (e.g. 2026-1234).";
    }

    if (mode === "signup") {
      if (fullName.trim().length < 2) {
        errors.fullName = "Enter your full name (at least 2 characters).";
      }
      if (password.length < 8) {
        errors.password = "Password must be at least 8 characters.";
      }
      if (password !== confirmPassword) {
        errors.confirmPassword = "Passwords do not match.";
      }
    } else if (mode === "login") {
      if (password.length < 6) {
        errors.password = "Password must be at least 6 characters.";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlightRef.current || isSubmitting) return;
    if (!validateForm()) return;

    inFlightRef.current = true;
    setIsSubmitting(true);
    setNotice(null);

    const trimmedId = studentId.trim();
    const idempotencyKey = getOrCreateIdempotencyKey();

    try {
      if (mode === "login") {
        const res = await postIdempotent<{
          message?: string;
          error?: string;
          student?: StudentProfile;
        }>(
          "/api/auth/login",
          { studentId: trimmedId, password },
          idempotencyKey
        );

        if (!res.ok || !res.data.student) {
          setNotice({
            type: "error",
            message: res.data.error ?? "Unable to sign in. Please try again.",
          });
          return;
        }

        rotateIdempotencyKey();
        setAuthenticatedStudent(res.data.student);
      } else if (mode === "signup") {
        const res = await postIdempotent<{
          message?: string;
          error?: string;
          student?: StudentProfile;
        }>(
          "/api/auth/signup",
          {
            studentId: trimmedId,
            fullName: fullName.trim(),
            password,
          },
          idempotencyKey
        );

        if (!res.ok || !res.data.student) {
          setNotice({
            type: "error",
            message: res.data.error ?? "Unable to create account.",
          });
          return;
        }

        rotateIdempotencyKey();
        setAuthenticatedStudent(res.data.student);
      } else {
        const res = await postIdempotent<{
          message?: string;
          error?: string;
        }>(
          "/api/auth/forgot-password",
          { studentId: trimmedId },
          idempotencyKey
        );

        if (!res.ok) {
          setNotice({
            type: "error",
            message: res.data.error ?? "Unable to process password reset.",
          });
          return;
        }

        rotateIdempotencyKey();
        setNotice({
          type: "success",
          message:
            res.data.message ??
            "Password reset instructions have been sent to your student email.",
        });
      }
    } catch {
      setNotice({
        type: "error",
        message:
          "Network error. Clicking submit again will safely retry with the same idempotency key.",
      });
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  function fillDemoAccount() {
    setMode("login");
    setStudentId("2026-1234");
    setPassword("password123");
    setFieldErrors({});
    setNotice(null);
    rotateIdempotencyKey();
  }

  function handleSignOut() {
    setAuthenticatedStudent(null);
    setPassword("");
    setConfirmPassword("");
    setNotice(null);
    rotateIdempotencyKey();
  }

  const headingText =
    mode === "login"
      ? "JDJS Library"
      : mode === "signup"
      ? "Create Account"
      : "Reset Password";

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#0d111c] px-4 py-10 sm:px-6">
      {/* Full-bleed campus backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <Image
          src="/images/jdjs-campus.jpg"
          alt="JDJS University Campus Entrance"
          fill
          priority
          sizes="100vw"
          className="scale-105 object-cover object-center blur-[3px] brightness-75"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b101d]/55 via-[#0b101d]/45 to-[#0b101d]/75" />
      </div>

      <main className="relative z-10 flex w-full justify-center">
        {authenticatedStudent ? (
          <LibraryPortal
            student={authenticatedStudent}
            onSignOut={handleSignOut}
          />
        ) : (
          <section
            aria-labelledby="auth-card-title"
            className="w-full max-w-[420px] rounded-2xl border border-white/12 bg-[#1a2030]/90 p-7 shadow-[0_24px_64px_rgba(0,0,0,0.58)] backdrop-blur-xl sm:p-8"
          >
            {/* Brand Header */}
            <div className="flex items-center justify-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-[#f45b84]/85 bg-[#121725] p-1 shadow-sm">
                <Image
                  src="/images/jdjs-logo.png"
                  alt="JDJS University Crest"
                  width={36}
                  height={36}
                  priority
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold tracking-[0.06em] text-white uppercase">
                  JDJS University
                </p>
                <p className="text-[10px] font-medium tracking-[0.18em] text-slate-300/85 uppercase">
                  Library Borrowing System
                </p>
              </div>
            </div>

            <h1
              id="auth-card-title"
              className="mt-6 text-center text-2xl font-bold tracking-tight text-white"
            >
              {headingText}
            </h1>

            {mode !== "login" && (
              <p className="mt-1.5 text-center text-xs text-slate-300">
                {mode === "signup"
                  ? "Register your Student ID to borrow books and manage holds."
                  : "Enter your Student ID to receive reset instructions."}
              </p>
            )}

            {notice && (
              <div
                role="status"
                aria-live="polite"
                className={`mt-5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
                  notice.type === "error"
                    ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
                    : "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
                }`}
              >
                {notice.message}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              noValidate
              className="mt-6 space-y-4"
            >
              {/* Student ID */}
              <div>
                <label
                  htmlFor="student-id"
                  className="mb-1.5 block text-xs font-medium text-slate-200"
                >
                  Student ID
                </label>
                <input
                  id="student-id"
                  name="studentId"
                  type="text"
                  autoComplete="username"
                  inputMode="numeric"
                  placeholder="e.g. 2026-1234"
                  value={studentId}
                  onChange={(e) =>
                    updateField(setStudentId, "studentId", e.target.value)
                  }
                  aria-invalid={Boolean(fieldErrors.studentId)}
                  aria-describedby={
                    fieldErrors.studentId ? "student-id-error" : undefined
                  }
                  className={`w-full rounded-xl border bg-[#2c3347]/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-400 transition focus:outline-none focus:ring-2 ${
                    fieldErrors.studentId
                      ? "border-rose-400/80 focus:border-rose-400 focus:ring-rose-400/30"
                      : "border-white/12 focus:border-[#f45b84] focus:ring-[#f45b84]/35"
                  }`}
                />
                {fieldErrors.studentId && (
                  <p
                    id="student-id-error"
                    className="mt-1.5 text-xs text-rose-300"
                  >
                    {fieldErrors.studentId}
                  </p>
                )}
              </div>

              {/* Full Name (Sign Up only) */}
              {mode === "signup" && (
                <div>
                  <label
                    htmlFor="full-name"
                    className="mb-1.5 block text-xs font-medium text-slate-200"
                  >
                    Full Name
                  </label>
                  <input
                    id="full-name"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    placeholder="e.g. Alex Rivera"
                    value={fullName}
                    onChange={(e) =>
                      updateField(setFullName, "fullName", e.target.value)
                    }
                    aria-invalid={Boolean(fieldErrors.fullName)}
                    aria-describedby={
                      fieldErrors.fullName ? "full-name-error" : undefined
                    }
                    className={`w-full rounded-xl border bg-[#2c3347]/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-400 transition focus:outline-none focus:ring-2 ${
                      fieldErrors.fullName
                        ? "border-rose-400/80 focus:border-rose-400 focus:ring-rose-400/30"
                        : "border-white/12 focus:border-[#f45b84] focus:ring-[#f45b84]/35"
                    }`}
                  />
                  {fieldErrors.fullName && (
                    <p
                      id="full-name-error"
                      className="mt-1.5 text-xs text-rose-300"
                    >
                      {fieldErrors.fullName}
                    </p>
                  )}
                </div>
              )}

              {/* Password (Login & Sign Up) */}
              {mode !== "forgot" && (
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-xs font-medium text-slate-200"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) =>
                        updateField(setPassword, "password", e.target.value)
                      }
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={
                        fieldErrors.password ? "password-error" : undefined
                      }
                      className={`w-full rounded-xl border bg-[#2c3347]/80 py-2.5 pr-11 pl-3.5 text-sm text-white placeholder:text-slate-400 transition focus:outline-none focus:ring-2 ${
                        fieldErrors.password
                          ? "border-rose-400/80 focus:border-rose-400 focus:ring-rose-400/30"
                          : "border-white/12 focus:border-[#f45b84] focus:ring-[#f45b84]/35"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3.5 text-slate-400 transition hover:text-slate-200 focus-visible:text-white focus-visible:outline-none"
                    >
                      {showPassword ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 4.24A9.77 9.77 0 0112 4c5 0 9.27 3.11 11 7.5a11.83 11.83 0 01-4.3 5.36M6.61 6.61A11.84 11.84 0 001 11.5C2.73 15.89 7 19 12 19a9.7 9.7 0 004.39-1.04"
                          />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.062 12.348a1 1 0 010-.696 10.75 10.75 0 0119.876 0 1 1 0 010 .696 10.75 10.75 0 01-19.876 0z"
                          />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p
                      id="password-error"
                      className="mt-1.5 text-xs text-rose-300"
                    >
                      {fieldErrors.password}
                    </p>
                  )}

                  {mode === "login" && (
                    <div className="mt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={fillDemoAccount}
                        className="cursor-pointer text-xs text-slate-400 transition hover:text-slate-200 focus-visible:outline-none focus-visible:underline"
                      >
                        Use demo ID (2026-1234)
                      </button>
                      <button
                        type="button"
                        onClick={() => switchMode("forgot")}
                        className="cursor-pointer text-xs font-medium text-[#f45b84] transition hover:text-[#ff789c] focus-visible:outline-none focus-visible:underline"
                      >
                        Forgot Password?
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Confirm Password (Sign Up only) */}
              {mode === "signup" && (
                <div>
                  <label
                    htmlFor="confirm-password"
                    className="mb-1.5 block text-xs font-medium text-slate-200"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="confirm-password"
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) =>
                      updateField(
                        setConfirmPassword,
                        "confirmPassword",
                        e.target.value
                      )
                    }
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={
                      fieldErrors.confirmPassword
                        ? "confirm-password-error"
                        : undefined
                    }
                    className={`w-full rounded-xl border bg-[#2c3347]/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-400 transition focus:outline-none focus:ring-2 ${
                      fieldErrors.confirmPassword
                        ? "border-rose-400/80 focus:border-rose-400 focus:ring-rose-400/30"
                        : "border-white/12 focus:border-[#f45b84] focus:ring-[#f45b84]/35"
                    }`}
                  />
                  {fieldErrors.confirmPassword && (
                    <p
                      id="confirm-password-error"
                      className="mt-1.5 text-xs text-rose-300"
                    >
                      {fieldErrors.confirmPassword}
                    </p>
                  )}
                </div>
              )}

              {/* Primary & Secondary Actions */}
              <div className="space-y-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#f45b84] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#f45b84]/20 transition hover:bg-[#e54973] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b84] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a2030] disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {isSubmitting && (
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                    />
                  )}
                  {isSubmitting
                    ? "Please wait..."
                    : mode === "login"
                    ? "Login"
                    : mode === "signup"
                    ? "Create Account"
                    : "Send Reset Link"}
                </button>

                {mode === "login" ? (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => switchMode("signup")}
                    className="w-full cursor-pointer rounded-xl border border-white/15 bg-[#282f42]/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#323b52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Sign Up
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => switchMode("login")}
                    className="w-full cursor-pointer rounded-xl border border-white/15 bg-[#282f42]/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#323b52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Back to Login
                  </button>
                )}
              </div>
            </form>

            <p className="mt-6 text-center text-xs italic text-slate-400">
              &ldquo;Learn Grow Achieve Together&rdquo;
            </p>
            <div className="mt-3 text-center">
              <Link
                href="/admin"
                className="text-xs font-medium text-slate-400 transition hover:text-[#f45b84] focus-visible:outline-none focus-visible:underline"
              >
                Open Library Admin System →
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
