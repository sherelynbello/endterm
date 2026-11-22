"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createIdempotencyKey, postIdempotent } from "@/lib/idempotent-fetch";

export interface StudentProfile {
  studentId: string;
  fullName: string;
  email: string;
}

interface BookItem {
  id: string;
  title: string;
  author: string;
  callNumber: string;
  totalCopies: number;
  availableCopies: number;
  isBorrowedByStudent: boolean;
}

interface LibraryPortalProps {
  student: StudentProfile;
  onSignOut: () => void;
}

export default function LibraryPortal({
  student,
  onSignOut,
}: LibraryPortalProps) {
  const [books, setBooks] = useState<BookItem[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingBookId, setPendingBookId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Per-book idempotency keys so retrying the same failed borrow/return reuses its key.
  const actionKeysRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      try {
        const res = await fetch(
          `/api/library/borrow?studentId=${encodeURIComponent(student.studentId)}`
        );
        const data = (await res.json()) as { books?: BookItem[] };
        if (!cancelled && data.books) {
          setBooks(data.books);
        }
      } catch {
        if (!cancelled) {
          setNotice({
            type: "error",
            text: "Unable to load library catalog. Please refresh.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [student.studentId]);

  async function handleBookAction(bookId: string, action: "borrow" | "return") {
    if (pendingBookId) return;

    const mapKey = `${bookId}:${action}`;
    let key = actionKeysRef.current.get(mapKey);
    if (!key) {
      key = createIdempotencyKey();
      actionKeysRef.current.set(mapKey, key);
    }

    setPendingBookId(bookId);
    setNotice(null);

    try {
      const result = await postIdempotent<{
        message?: string;
        error?: string;
        books?: BookItem[];
      }>(
        "/api/library/borrow",
        { studentId: student.studentId, bookId, action },
        key
      );

      if (!result.ok) {
        setNotice({
          type: "error",
          text: result.data.error ?? "Action could not be completed.",
        });
        return;
      }

      actionKeysRef.current.delete(mapKey);
      if (result.data.books) {
        setBooks(result.data.books);
      }
      setNotice({
        type: "success",
        text: result.data.message ?? "Library record updated.",
      });
    } catch {
      setNotice({
        type: "error",
        text: "Network error. Retrying will safely reuse the same idempotency key.",
      });
    } finally {
      setPendingBookId(null);
    }
  }

  const filteredBooks = books.filter((book) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      book.title.toLowerCase().includes(q) ||
      book.author.toLowerCase().includes(q) ||
      book.callNumber.toLowerCase().includes(q)
    );
  });

  const borrowedCount = books.filter((b) => b.isBorrowedByStudent).length;

  return (
    <section
      aria-label="JDJS Library Borrowing Portal"
      className="w-full max-w-2xl rounded-2xl border border-white/12 bg-[#1a2030]/92 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-[#f45b84]/85 bg-[#121725] p-1">
            <Image
              src="/images/jdjs-logo.png"
              alt="JDJS University Crest"
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase">
              JDJS University Library
            </p>
            <h1 className="text-lg font-semibold text-white">
              Welcome, {student.fullName}
            </h1>
            <p className="text-xs text-slate-400">
              ID: <span className="font-mono text-slate-200">{student.studentId}</span>{" "}
              · {borrowedCount} {borrowedCount === 1 ? "book" : "books"} borrowed
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="cursor-pointer rounded-lg border border-white/15 bg-[#262e42] px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-[#313b54] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b84]/70"
        >
          Sign Out
        </button>
      </header>

      <div className="mt-5 flex flex-col gap-4">
        <div className="relative">
          <label htmlFor="catalog-search" className="sr-only">
            Search library catalog
          </label>
          <input
            id="catalog-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, author, or call number..."
            className="w-full rounded-xl border border-white/12 bg-[#282f42]/90 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-[#f45b84] focus:outline-none focus:ring-2 focus:ring-[#f45b84]/35"
          />
        </div>

        {notice && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl border px-3.5 py-2.5 text-sm ${
              notice.type === "success"
                ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                : "border-rose-400/35 bg-rose-500/15 text-rose-200"
            }`}
          >
            {notice.text}
          </div>
        )}

        {isLoading ? (
          <div className="py-10 text-center text-sm text-slate-300">
            Loading library catalog...
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#232a3d]/70 py-8 text-center text-sm text-slate-300">
            No matching books found.
          </div>
        ) : (
          <ul className="space-y-3">
            {filteredBooks.map((book) => {
              const isBusy = pendingBookId === book.id;
              return (
                <li
                  key={book.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-[#232a3d]/75 p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-white">
                      {book.title}
                    </h2>
                    <p className="text-xs text-slate-300">{book.author}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Call No. <span className="font-mono">{book.callNumber}</span> ·{" "}
                      <span
                        className={
                          book.availableCopies > 0
                            ? "text-emerald-300"
                            : "text-amber-300"
                        }
                      >
                        {book.availableCopies}/{book.totalCopies} available
                      </span>
                    </p>
                  </div>

                  <div className="shrink-0">
                    {book.isBorrowedByStudent ? (
                      <button
                        type="button"
                        disabled={pendingBookId !== null}
                        aria-busy={isBusy}
                        onClick={() => handleBookAction(book.id, "return")}
                        className="w-full cursor-pointer rounded-lg border border-white/15 bg-[#2d354c] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#394360] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        {isBusy ? "Returning..." : "Return Book"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          pendingBookId !== null || book.availableCopies <= 0
                        }
                        aria-busy={isBusy}
                        onClick={() => handleBookAction(book.id, "borrow")}
                        className="w-full cursor-pointer rounded-lg bg-[#f45b84] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#e54973] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                      >
                        {isBusy
                          ? "Borrowing..."
                          : book.availableCopies > 0
                          ? "Borrow"
                          : "Unavailable"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-6 text-center text-xs italic text-slate-400">
        &ldquo;Learn Grow Achieve Together&rdquo;
      </p>
    </section>
  );
}
