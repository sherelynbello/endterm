"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import CustomDropdown from "@/components/CustomDropdown";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { createIdempotencyKey, sendIdempotent } from "@/lib/idempotent-fetch";
import type {
  BookCondition,
  BookRequestItem,
  LibraryBook,
  RequestStatus,
} from "@/lib/library-store";

type AdminTab = "dashboard" | "inventory" | "requests" | "analytics";

interface MonthlyPoint {
  month: string;
  count: number;
}

const GENRE_OPTIONS = [
  "Filipino Literature",
  "Classic Fiction",
  "Science Fiction",
  "Fantasy",
  "Self-Development",
  "Young Adult",
  "Computer Science",
  "Design",
  "History",
];

const CONDITION_OPTIONS: BookCondition[] = ["Good", "Fair", "Needs Repair"];

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function StatusBadge({ status }: { status: RequestStatus }) {
  const styles =
    status === "Pending"
      ? "bg-amber-100 text-amber-700"
      : status === "Approved"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-rose-100 text-rose-700";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles}`}
    >
      {status}
    </span>
  );
}

function ConditionBadge({ condition }: { condition: BookCondition }) {
  const styles =
    condition === "Good"
      ? "bg-emerald-100 text-emerald-700"
      : condition === "Fair"
      ? "bg-sky-100 text-sky-700"
      : "bg-amber-100 text-amber-700";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles}`}
    >
      {condition}
    </span>
  );
}

export default function AdminDashboard() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [requests, setRequests] = useState<BookRequestItem[]>([]);
  const [monthlyActivity, setMonthlyActivity] = useState<MonthlyPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Inventory filters
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");

  // Requests filters & due dates
  const [requestQuery, setRequestQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | RequestStatus>("All");
  const [typeFilter, setTypeFilter] = useState<"all" | "Borrow" | "Reserve">("all");
  const [dueDates, setDueDates] = useState<Record<string, string>>({});

  // Add New Book modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newGenre, setNewGenre] = useState("Computer Science");
  const [newShelf, setNewShelf] = useState("");
  const [newCopies, setNewCopies] = useState("5");
  const [newCondition, setNewCondition] = useState<BookCondition>("Good");
  const [newCallNumber, setNewCallNumber] = useState("");
  const [isAddingBook, setIsAddingBook] = useState(false);
  const addBookKeyRef = useRef<string | null>(null);

  // Per-action idempotency keys & busy states
  const [busyId, setBusyId] = useState<string | null>(null);
  const actionKeysRef = useRef<Map<string, string>>(new Map());
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      try {
        const res = await fetch("/api/admin/overview");
        const data = (await res.json()) as {
          books?: LibraryBook[];
          requests?: BookRequestItem[];
          monthlyActivity?: MonthlyPoint[];
        };
        if (!cancelled) {
          setBooks(data.books ?? []);
          setRequests(data.requests ?? []);
          setMonthlyActivity(data.monthlyActivity ?? []);
        }
      } catch {
        if (!cancelled) {
          setToast({
            type: "error",
            text: "Failed to load library admin data.",
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadOverview();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
        setAddModalOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Computed metrics
  const metrics = useMemo(() => {
    const totalCopies = books.reduce((sum, b) => sum + b.totalCopies, 0);
    const availableCopies = books.reduce((sum, b) => sum + b.availableCopies, 0);
    const borrowedCopies = Math.max(0, totalCopies - availableCopies);
    const pendingRequests = requests.filter((r) => r.status === "Pending");
    const approvedRequests = requests.filter((r) => r.status === "Approved");
    const borrowingRate =
      totalCopies > 0 ? Math.round((borrowedCopies / totalCopies) * 100) : 0;
    const approvalRate =
      requests.length > 0
        ? Math.round((approvedRequests.length / requests.length) * 100)
        : 0;
    const availablePercent =
      totalCopies > 0 ? Math.round((availableCopies / totalCopies) * 100) : 0;

    return {
      totalCopies,
      availableCopies,
      borrowedCopies,
      uniqueTitles: books.length,
      pendingCount: pendingRequests.length,
      approvedCount: approvedRequests.length,
      pendingRequests,
      borrowingRate,
      approvalRate,
      availablePercent,
    };
  }, [books, requests]);

  const genreBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of books) {
      counts.set(book.genre, (counts.get(book.genre) ?? 0) + book.totalCopies);
    }
    return Array.from(counts.entries())
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [books]);

  const filteredBooks = useMemo(() => {
    const q = inventoryQuery.trim().toLowerCase();
    return books.filter((book) => {
      if (genreFilter !== "all" && book.genre !== genreFilter) return false;
      if (conditionFilter !== "all" && book.condition !== conditionFilter)
        return false;
      if (!q) return true;
      return (
        book.title.toLowerCase().includes(q) ||
        book.author.toLowerCase().includes(q) ||
        book.genre.toLowerCase().includes(q) ||
        String(book.numericId).includes(q)
      );
    });
  }, [books, inventoryQuery, genreFilter, conditionFilter]);

  const filteredRequests = useMemo(() => {
    const q = requestQuery.trim().toLowerCase();
    return requests.filter((req) => {
      if (statusFilter !== "All" && req.status !== statusFilter) return false;
      if (typeFilter !== "all" && req.type !== typeFilter) return false;
      if (!q) return true;
      return (
        req.studentName.toLowerCase().includes(q) ||
        req.studentId.toLowerCase().includes(q) ||
        req.bookTitle.toLowerCase().includes(q) ||
        req.requestCode.toLowerCase().includes(q)
      );
    });
  }, [requests, requestQuery, statusFilter, typeFilter]);

  const operationalMarkdown = useMemo(() => {
    const topGenre = genreBreakdown[0];
    return `## JDJS Library Operational Summary (2026)

> **Status:** All circulation endpoints are protected with \`Idempotency-Key\` deduplication to prevent duplicate approvals, double-borrows, or duplicate catalog entries.

### Key Circulation Metrics
- **Collection Utilization:** **${metrics.borrowedCopies}** of **${metrics.totalCopies}** copies are currently borrowed (**${metrics.borrowingRate}%** borrowing rate).
- **Available Shelf Stock:** **${metrics.availableCopies}** copies ready across **${metrics.uniqueTitles}** unique titles (**${metrics.availablePercent}%** availability).
- **Request Queue:** **${metrics.pendingCount}** pending request(s) awaiting due-date assignment; **${metrics.approvedCount}** approved (**${metrics.approvalRate}%** approval rate).
${topGenre ? `- **Leading Collection:** **${topGenre.genre}** leads inventory with **${topGenre.count}** copies.` : ""}

| Metric | Current Value | Target |
| --- | --- | --- |
| Total Copies | ${metrics.totalCopies} | 150 |
| Borrowing Rate | ${metrics.borrowingRate}% | 65% |
| Pending Review | ${metrics.pendingCount} | 0 |
| Average Response | 4 hours | < 6 hours |`;
  }, [genreBreakdown, metrics]);

  async function handleDeleteBook(book: LibraryBook) {
    if (busyId) return;
    const mapKey = `delete:${book.id}`;
    let key = actionKeysRef.current.get(mapKey);
    if (!key) {
      key = createIdempotencyKey();
      actionKeysRef.current.set(mapKey, key);
    }

    setBusyId(book.id);
    setToast(null);
    try {
      const res = await sendIdempotent<{
        message?: string;
        error?: string;
        books?: LibraryBook[];
      }>("/api/admin/books", "DELETE", { bookId: book.id }, key);

      if (!res.ok) {
        setToast({
          type: "error",
          text: res.data.error ?? "Unable to remove book.",
        });
        return;
      }

      actionKeysRef.current.delete(mapKey);
      if (res.data.books) setBooks(res.data.books);
      setToast({
        type: "success",
        text: res.data.message ?? `Removed "${book.title}".`,
      });
    } catch {
      setToast({
        type: "error",
        text: "Network error. Retrying will safely reuse the same idempotency key.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleAddBookSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isAddingBook) return;

    if (!addBookKeyRef.current) {
      addBookKeyRef.current = createIdempotencyKey();
    }

    setIsAddingBook(true);
    setToast(null);

    try {
      const res = await sendIdempotent<{
        message?: string;
        error?: string;
        books?: LibraryBook[];
      }>(
        "/api/admin/books",
        "POST",
        {
          title: newTitle,
          author: newAuthor,
          genre: newGenre,
          shelf: newShelf,
          totalCopies: Number(newCopies),
          condition: newCondition,
          callNumber: newCallNumber,
        },
        addBookKeyRef.current
      );

      if (!res.ok) {
        setToast({
          type: "error",
          text: res.data.error ?? "Could not add book.",
        });
        return;
      }

      addBookKeyRef.current = null;
      if (res.data.books) setBooks(res.data.books);
      setToast({
        type: "success",
        text: res.data.message ?? "Book added to inventory.",
      });
      setNewTitle("");
      setNewAuthor("");
      setNewShelf("");
      setNewCallNumber("");
      setNewCopies("5");
      setAddModalOpen(false);
    } catch {
      setToast({
        type: "error",
        text: "Network error. Retrying will safely reuse the same idempotency key.",
      });
    } finally {
      setIsAddingBook(false);
    }
  }

  async function handleRequestDecision(
    reqItem: BookRequestItem,
    decision: "Approved" | "Declined"
  ) {
    if (busyId) return;
    const dueDate = dueDates[reqItem.id] ?? "";
    if (decision === "Approved" && !dueDate) {
      setToast({
        type: "error",
        text: `Please set a due date before approving ${reqItem.requestCode}.`,
      });
      return;
    }

    const mapKey = `req:${reqItem.id}:${decision}:${dueDate}`;
    let key = actionKeysRef.current.get(mapKey);
    if (!key) {
      key = createIdempotencyKey();
      actionKeysRef.current.set(mapKey, key);
    }

    setBusyId(reqItem.id);
    setToast(null);

    try {
      const res = await sendIdempotent<{
        message?: string;
        error?: string;
        requests?: BookRequestItem[];
        books?: LibraryBook[];
      }>(
        "/api/admin/requests",
        "POST",
        { requestId: reqItem.id, decision, dueDate },
        key
      );

      if (!res.ok) {
        setToast({
          type: "error",
          text: res.data.error ?? "Unable to update request.",
        });
        return;
      }

      actionKeysRef.current.delete(mapKey);
      if (res.data.requests) setRequests(res.data.requests);
      if (res.data.books) setBooks(res.data.books);
      setToast({
        type: "success",
        text: res.data.message ?? `Request ${reqItem.requestCode} updated.`,
      });
    } catch {
      setToast({
        type: "error",
        text: "Network error. Retrying will safely reuse the same idempotency key.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopyMarkdown() {
    try {
      await navigator.clipboard.writeText(operationalMarkdown);
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2000);
    } catch {
      setToast({ type: "error", text: "Unable to copy markdown to clipboard." });
    }
  }

  const pageTitle =
    activeTab === "dashboard"
      ? "Dashboard"
      : activeTab === "inventory"
      ? "Inventory"
      : activeTab === "requests"
      ? "Book Requests"
      : "Analytics";

  const maxGenreCount = Math.max(1, ...genreBreakdown.map((g) => g.count));
  const maxMonthlyCount = Math.max(
    1,
    ...monthlyActivity.map((m) => m.count)
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f2f4f8] text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Dark Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col justify-between bg-[#141926] text-slate-200 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div>
          {/* Brand */}
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-[#f45b84]/85 bg-[#101420] p-1">
              <Image
                src="/images/jdjs-logo.png"
                alt="JDJS University Crest"
                width={32}
                height={32}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs font-bold tracking-wider text-white uppercase">
                JDJS University
              </p>
              <p className="text-[10px] tracking-[0.14em] text-slate-400 uppercase">
                Library Admin System
              </p>
            </div>
          </div>

          <p className="mt-3 px-5 text-[10px] font-semibold tracking-[0.18em] text-slate-500 uppercase">
            Administration
          </p>

          <nav aria-label="Admin navigation" className="mt-3 space-y-1.5 px-3">
            {(
              [
                { id: "dashboard", label: "Dashboard" },
                { id: "inventory", label: "Inventory" },
                {
                  id: "requests",
                  label: "Book Requests",
                  badge: metrics.pendingCount,
                },
                { id: "analytics", label: "Analytics" },
              ] as const
            ).map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-[#f45b84] text-white shadow-md shadow-[#f45b84]/25"
                      : "text-slate-300 hover:bg-white/6 hover:text-white"
                  }`}
                >
                  <span>{item.label}</span>
                  {"badge" in item && item.badge > 0 && (
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                        isActive
                          ? "bg-white text-[#f45b84]"
                          : "bg-white text-[#141926]"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Admin Profile Card */}
        <div className="p-4">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#1d2436] p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f45b84] text-xs font-bold text-white">
                LA
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Library Admin</p>
                <p className="text-[11px] text-slate-400">Administrator</p>
              </div>
            </div>
            <button
              type="button"
              title="Sign out to Landing Page"
              aria-label="Sign out to Landing Page"
              onClick={() => router.push("/")}
              className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
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
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Subtle campus watermark */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]">
          <Image
            src="/images/jdjs-campus.jpg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>

        {/* Top Bar */}
        <header className="relative z-20 flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3.5 backdrop-blur-md sm:px-7">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="cursor-pointer rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900">
                {pageTitle}
              </h1>
              <p className="text-xs text-slate-500">Admin control center</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification Bell Dropdown */}
            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="relative cursor-pointer rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  className="h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                  />
                </svg>
                {metrics.pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#f45b84] ring-2 ring-white" />
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <p className="text-xs font-bold text-slate-800">
                      Pending Notifications ({metrics.pendingCount})
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("requests");
                        setNotificationsOpen(false);
                      }}
                      className="cursor-pointer text-xs font-semibold text-[#f45b84] hover:underline"
                    >
                      Review all
                    </button>
                  </div>
                  <div className="mt-2 max-h-60 space-y-2 overflow-y-auto scroll-smooth">
                    {metrics.pendingRequests.length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-500">
                        All book requests have been reviewed.
                      </p>
                    ) : (
                      metrics.pendingRequests.map((req) => (
                        <button
                          key={req.id}
                          type="button"
                          onClick={() => {
                            setActiveTab("requests");
                            setStatusFilter("Pending");
                            setNotificationsOpen(false);
                          }}
                          className="w-full cursor-pointer rounded-xl bg-slate-50 p-2.5 text-left transition hover:bg-slate-100"
                        >
                          <p className="text-xs font-semibold text-slate-800">
                            {req.studentName} · {req.type}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Requested &ldquo;{req.bookTitle}&rdquo; ({req.requestCode})
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <span className="hidden rounded-full border border-[#f45b84]/20 bg-[#fdf2f5] px-3.5 py-1.5 text-xs font-medium italic text-[#d93d68] sm:inline-flex">
              &ldquo;Learn Grow Achieve Together&rdquo;
            </span>
          </div>
        </header>

        {/* Scrollable Workspace */}
        <main className="relative z-10 flex-1 overflow-y-auto scroll-smooth p-4 sm:p-7">
          {toast && (
            <div
              role="status"
              aria-live="polite"
              className={`mb-5 flex items-center justify-between rounded-xl border px-4 py-3 text-sm shadow-xs ${
                toast.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              <span>{toast.text}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="ml-4 cursor-pointer text-xs font-semibold opacity-70 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">
              Loading JDJS Library Admin System...
            </div>
          ) : (
            <>
              {/* DASHBOARD VIEW */}
              {activeTab === "dashboard" && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                        Welcome back, Administrator
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Here is what is happening in the JDJS Library today.
                      </p>
                    </div>
                    <p className="text-xs font-medium text-slate-500">
                      October 4, 2026
                    </p>
                  </div>

                  {/* 4 Live KPI Cards */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        label: "Total Books",
                        value: metrics.totalCopies,
                        sub: `${metrics.uniqueTitles} unique titles`,
                        accent: "bg-rose-50 text-[#f45b84]",
                      },
                      {
                        label: "Books Borrowed",
                        value: metrics.borrowedCopies,
                        sub: `${metrics.availableCopies} copies available`,
                        accent: "bg-indigo-50 text-indigo-600",
                      },
                      {
                        label: "Pending Requests",
                        value: metrics.pendingCount,
                        sub: "Needs your attention",
                        accent: "bg-amber-50 text-amber-600",
                      },
                      {
                        label: "Approved Requests",
                        value: metrics.approvedCount,
                        sub: "Current request history",
                        accent: "bg-emerald-50 text-emerald-600",
                      },
                    ].map((card) => (
                      <div
                        key={card.label}
                        className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:shadow-md"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold ${card.accent}`}
                          >
                            ●
                          </span>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
                            Live
                          </span>
                        </div>
                        <p className="mt-4 text-3xl font-bold text-slate-900">
                          {card.value}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {card.label}
                        </p>
                        <p className="text-xs text-slate-400">{card.sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* Bottom Split: Recent Requests + Quick Actions */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-2">
                      <div className="flex items-center justify-between pb-4">
                        <div>
                          <h3 className="text-base font-bold text-slate-900">
                            Recent Requests
                          </h3>
                          <p className="text-xs text-slate-500">
                            Latest borrowing and reservation activity
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab("requests")}
                          className="cursor-pointer text-xs font-semibold text-[#f45b84] hover:underline"
                        >
                          View all
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="border-y border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500">
                            <tr>
                              <th className="px-3 py-2.5">Student</th>
                              <th className="px-3 py-2.5">Book</th>
                              <th className="px-3 py-2.5">Type</th>
                              <th className="px-3 py-2.5">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {requests.slice(0, 4).map((req) => (
                              <tr key={req.id} className="hover:bg-slate-50/60">
                                <td className="px-3 py-3">
                                  <p className="font-semibold text-slate-800">
                                    {req.studentName}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {req.studentId}
                                  </p>
                                </td>
                                <td className="px-3 py-3 text-slate-700">
                                  {req.bookTitle}
                                </td>
                                <td className="px-3 py-3 text-slate-600">
                                  {req.type}
                                </td>
                                <td className="px-3 py-3">
                                  <StatusBadge status={req.status} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="space-y-5">
                      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
                        <h3 className="text-base font-bold text-slate-900">
                          Quick Actions
                        </h3>
                        <div className="mt-4 space-y-2.5">
                          <button
                            type="button"
                            onClick={() => setAddModalOpen(true)}
                            className="w-full cursor-pointer rounded-xl bg-[#f45b84] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e54973]"
                          >
                            + Add New Book
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab("requests")}
                            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Review Requests
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-[#141926] p-5 text-white shadow-md">
                        <p className="text-[11px] font-bold tracking-[0.14em] text-[#f45b84] uppercase">
                          ⚠ Attention Needed
                        </p>
                        <p className="mt-2 text-3xl font-bold">
                          {metrics.pendingCount}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-300">
                          Book requests are waiting for review and due-date
                          assignment.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setStatusFilter("Pending");
                            setActiveTab("requests");
                          }}
                          className="mt-4 cursor-pointer text-xs font-semibold text-[#f45b84] hover:underline"
                        >
                          Open pending queue →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* INVENTORY VIEW */}
              {activeTab === "inventory" && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">
                        Book Inventory
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Add, review, and remove books from the library collection.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAddModalOpen(true)}
                      className="cursor-pointer rounded-xl bg-[#f45b84] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e54973]"
                    >
                      + Add New Book
                    </button>
                  </div>

                  {/* Search + Dropdown Filters */}
                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs lg:flex-row lg:items-center">
                    <input
                      type="search"
                      value={inventoryQuery}
                      onChange={(e) => setInventoryQuery(e.target.value)}
                      placeholder="Search title, author, genre, or book ID..."
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f45b84] focus:bg-white focus:outline-none"
                    />
                    <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
                      <CustomDropdown
                        value={genreFilter}
                        onChange={setGenreFilter}
                        className="sm:w-44"
                        options={[
                          { value: "all", label: "All Genres" },
                          ...GENRE_OPTIONS.map((g) => ({ value: g, label: g })),
                        ]}
                      />
                      <CustomDropdown
                        value={conditionFilter}
                        onChange={setConditionFilter}
                        className="sm:w-40"
                        options={[
                          { value: "all", label: "All Conditions" },
                          ...CONDITION_OPTIONS.map((c) => ({
                            value: c,
                            label: c,
                          })),
                        ]}
                      />
                    </div>
                    <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 lg:pl-2">
                      <span>{filteredBooks.length} titles</span>
                      <span className="text-emerald-600">
                        {metrics.availableCopies} available
                      </span>
                    </div>
                  </div>

                  {/* Scrollable Table */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
                    <div className="max-h-[520px] overflow-auto scroll-smooth">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Book ID</th>
                            <th className="px-4 py-3">Title &amp; Author</th>
                            <th className="px-4 py-3">Genre</th>
                            <th className="px-4 py-3">Shelf</th>
                            <th className="px-4 py-3">Copies</th>
                            <th className="px-4 py-3">Available</th>
                            <th className="px-4 py-3">Condition</th>
                            <th className="px-4 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredBooks.map((book) => (
                            <tr key={book.id} className="hover:bg-slate-50/70">
                              <td className="px-4 py-3.5 font-semibold text-[#f45b84]">
                                {book.numericId}
                              </td>
                              <td className="px-4 py-3.5">
                                <p className="font-semibold text-slate-900">
                                  {book.title}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {book.author}
                                </p>
                              </td>
                              <td className="px-4 py-3.5 text-slate-600">
                                {book.genre}
                              </td>
                              <td className="px-4 py-3.5 text-slate-600">
                                {book.shelf}
                              </td>
                              <td className="px-4 py-3.5 font-semibold text-slate-800">
                                {book.totalCopies}
                              </td>
                              <td className="px-4 py-3.5 font-semibold text-emerald-600">
                                {book.availableCopies}
                              </td>
                              <td className="px-4 py-3.5">
                                <ConditionBadge condition={book.condition} />
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <button
                                  type="button"
                                  disabled={busyId === book.id}
                                  onClick={() => handleDeleteBook(book)}
                                  aria-label={`Remove ${book.title}`}
                                  className="cursor-pointer rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50 disabled:opacity-50"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    className="h-4 w-4"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                    />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* BOOK REQUESTS VIEW */}
              {activeTab === "requests" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">
                      Book Requests
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Review reservation and borrowing requests, assign due
                      dates, and make decisions.
                    </p>
                  </div>

                  {/* Filter Bar */}
                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs lg:flex-row lg:items-center">
                    <input
                      type="search"
                      value={requestQuery}
                      onChange={(e) => setRequestQuery(e.target.value)}
                      placeholder="Search student, ID, or book..."
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f45b84] focus:bg-white focus:outline-none"
                    />
                    <CustomDropdown
                      value={typeFilter}
                      onChange={(v) =>
                        setTypeFilter(v as "all" | "Borrow" | "Reserve")
                      }
                      className="lg:w-40"
                      options={[
                        { value: "all", label: "All Types" },
                        { value: "Borrow", label: "Borrow" },
                        { value: "Reserve", label: "Reserve" },
                      ]}
                    />
                    <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1">
                      {(["All", "Pending", "Approved", "Declined"] as const).map(
                        (tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setStatusFilter(tab)}
                            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              statusFilter === tab
                                ? "bg-white text-slate-900 shadow-xs"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            {tab}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Request Cards */}
                  <div className="space-y-4">
                    {filteredRequests.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                        No book requests match your current filter.
                      </div>
                    ) : (
                      filteredRequests.map((req) => {
                        const isBusy = busyId === req.id;
                        return (
                          <div
                            key={req.id}
                            className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fdf2f5] text-xs font-bold text-[#d93d68]">
                                  {getInitials(req.studentName)}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold text-slate-900">
                                      {req.studentName}
                                    </p>
                                    <StatusBadge status={req.status} />
                                  </div>
                                  <p className="text-xs text-slate-500">
                                    {req.studentId} · {req.department}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right text-xs text-slate-400">
                                <p className="font-mono font-semibold text-slate-600">
                                  {req.requestCode}
                                </p>
                                <p>{req.requestedAt}</p>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl bg-slate-50/80 p-4 sm:grid-cols-3 sm:items-center">
                              <div>
                                <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                                  Requested Book
                                </p>
                                <p className="mt-0.5 text-sm font-bold text-slate-900">
                                  {req.bookTitle}
                                </p>
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                                  Request Type
                                </p>
                                <p className="mt-0.5 text-sm font-semibold text-[#f45b84]">
                                  {req.type}
                                </p>
                              </div>
                              <div>
                                <label
                                  htmlFor={`due-${req.id}`}
                                  className="block text-[11px] font-semibold tracking-wider text-slate-400 uppercase"
                                >
                                  Set Due Date
                                </label>
                                <input
                                  id={`due-${req.id}`}
                                  type="date"
                                  disabled={req.status !== "Pending"}
                                  value={
                                    req.status === "Pending"
                                      ? dueDates[req.id] ?? ""
                                      : req.dueDate
                                  }
                                  onChange={(e) =>
                                    setDueDates((prev) => ({
                                      ...prev,
                                      [req.id]: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-[#f45b84] focus:outline-none disabled:bg-slate-100"
                                />
                              </div>
                            </div>

                            {req.status === "Pending" && (
                              <div className="mt-4 flex flex-wrap justify-end gap-2.5">
                                <button
                                  type="button"
                                  disabled={busyId !== null}
                                  onClick={() =>
                                    handleRequestDecision(req, "Declined")
                                  }
                                  className="cursor-pointer rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                                >
                                  ✕ Decline
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId !== null}
                                  onClick={() =>
                                    handleRequestDecision(req, "Approved")
                                  }
                                  className="cursor-pointer rounded-xl bg-[#f45b84] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#e54973] disabled:opacity-50"
                                >
                                  {isBusy ? "Saving..." : "✓ Approve Request"}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ANALYTICS VIEW */}
              {activeTab === "analytics" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        label: "Borrowing Rate",
                        value: `${metrics.borrowingRate}%`,
                        sub: "+8% from last month",
                      },
                      {
                        label: "Approval Rate",
                        value: `${metrics.approvalRate}%`,
                        sub: `${metrics.approvedCount} approved requests`,
                      },
                      {
                        label: "Available Copies",
                        value: metrics.availableCopies,
                        sub: `${metrics.availablePercent}% of the collection`,
                      },
                      {
                        label: "Pending Review",
                        value: metrics.pendingCount,
                        sub: "Average response: 4 hours",
                      },
                    ].map((kpi) => (
                      <div
                        key={kpi.label}
                        className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-400 uppercase">
                            Metric
                          </span>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
                            Live
                          </span>
                        </div>
                        <p className="mt-3 text-3xl font-bold text-slate-900">
                          {kpi.value}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {kpi.label}
                        </p>
                        <p className="text-xs text-slate-400">{kpi.sub}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Monthly Borrowing Activity Chart */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-bold text-slate-900">
                            Monthly Borrowing Activity
                          </h3>
                          <p className="text-xs text-slate-500">
                            Approved borrows over the last six months
                          </p>
                        </div>
                        <span className="rounded-full bg-[#fdf2f5] px-3 py-1 text-xs font-bold text-[#f45b84]">
                          2026
                        </span>
                      </div>

                      <div className="mt-8 flex h-56 items-end justify-between gap-3 sm:gap-6">
                        {monthlyActivity.map((point, idx) => {
                          const heightPct = Math.round(
                            (point.count / maxMonthlyCount) * 100
                          );
                          const isLatest = idx === monthlyActivity.length - 1;
                          return (
                            <div
                              key={point.month}
                              className="flex flex-1 flex-col items-center gap-2"
                            >
                              <span className="text-xs font-semibold text-slate-500">
                                {point.count}
                              </span>
                              <div className="flex h-40 w-full items-end justify-center">
                                <div
                                  style={{ height: `${heightPct}%` }}
                                  title={`${point.month}: ${point.count} borrows`}
                                  className={`w-full max-w-[56px] rounded-t-xl transition-all duration-300 ${
                                    isLatest
                                      ? "bg-[#f45b84] shadow-md shadow-[#f45b84]/25"
                                      : "bg-[#fbcfe0] hover:bg-[#f7a8c4]"
                                  }`}
                                />
                              </div>
                              <span className="text-xs font-medium text-slate-500">
                                {point.month}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Collection by Genre */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
                      <h3 className="text-base font-bold text-slate-900">
                        Collection by Genre
                      </h3>
                      <p className="text-xs text-slate-500">
                        Largest categories in inventory
                      </p>

                      <div className="mt-5 space-y-4">
                        {genreBreakdown.map((item) => {
                          const pct = Math.round(
                            (item.count / maxGenreCount) * 100
                          );
                          return (
                            <div key={item.genre}>
                              <div className="mb-1.5 flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-700">
                                  {item.genre}
                                </span>
                                <span className="font-bold text-slate-900">
                                  {item.count}
                                </span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  style={{ width: `${pct}%` }}
                                  className="h-full rounded-full bg-[#f45b84]"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Operational Summary with Proper Markdown */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          Operational Summary
                        </h3>
                        <p className="text-xs text-slate-500">
                          Live Markdown report generated from current inventory
                          and request state
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyMarkdown}
                        className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        {copiedMarkdown ? "Copied Markdown ✓" : "Copy Markdown"}
                      </button>
                    </div>
                    <MarkdownRenderer markdown={operationalMarkdown} />
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Add New Book Modal */}
      {addModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-book-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-xs"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto scroll-smooth rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="add-book-title" className="text-lg font-bold text-slate-900">
                Add New Book
              </h2>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddBookSubmit} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="new-book-title"
                  className="mb-1 block text-xs font-semibold text-slate-700"
                >
                  Book Title
                </label>
                <input
                  id="new-book-title"
                  required
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    addBookKeyRef.current = null;
                  }}
                  placeholder="e.g. Refactoring"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#f45b84] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="new-book-author"
                  className="mb-1 block text-xs font-semibold text-slate-700"
                >
                  Author
                </label>
                <input
                  id="new-book-author"
                  required
                  value={newAuthor}
                  onChange={(e) => {
                    setNewAuthor(e.target.value);
                    addBookKeyRef.current = null;
                  }}
                  placeholder="e.g. Martin Fowler"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#f45b84] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <CustomDropdown
                  id="new-book-genre"
                  label="Genre"
                  value={newGenre}
                  onChange={(val) => {
                    setNewGenre(val);
                    addBookKeyRef.current = null;
                  }}
                  options={GENRE_OPTIONS.map((g) => ({ value: g, label: g }))}
                />
                <CustomDropdown
                  id="new-book-condition"
                  label="Condition"
                  value={newCondition}
                  onChange={(val) => {
                    setNewCondition(val as BookCondition);
                    addBookKeyRef.current = null;
                  }}
                  options={CONDITION_OPTIONS.map((c) => ({
                    value: c,
                    label: c,
                  }))}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="new-book-shelf"
                    className="mb-1 block text-xs font-semibold text-slate-700"
                  >
                    Shelf Location
                  </label>
                  <input
                    id="new-book-shelf"
                    required
                    value={newShelf}
                    onChange={(e) => {
                      setNewShelf(e.target.value);
                      addBookKeyRef.current = null;
                    }}
                    placeholder="e.g. Tech Shelf T3"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#f45b84] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-book-copies"
                    className="mb-1 block text-xs font-semibold text-slate-700"
                  >
                    Total Copies
                  </label>
                  <input
                    id="new-book-copies"
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={newCopies}
                    onChange={(e) => {
                      setNewCopies(e.target.value);
                      addBookKeyRef.current = null;
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#f45b84] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-book-call"
                  className="mb-1 block text-xs font-semibold text-slate-700"
                >
                  Call Number (optional)
                </label>
                <input
                  id="new-book-call"
                  value={newCallNumber}
                  onChange={(e) => {
                    setNewCallNumber(e.target.value);
                    addBookKeyRef.current = null;
                  }}
                  placeholder="e.g. QA76.76.R42 F69"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#f45b84] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingBook}
                  className="cursor-pointer rounded-xl bg-[#f45b84] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#e54973] disabled:opacity-60"
                >
                  {isAddingBook ? "Saving..." : "Add Book"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
