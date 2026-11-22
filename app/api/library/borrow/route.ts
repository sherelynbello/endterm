import { NextResponse } from "next/server";
import { withIdempotency } from "@/lib/idempotency";
import {
  getLibraryState,
  normalizeStudentId,
  STUDENT_ID_REGEX,
} from "@/lib/library-store";
import { readJsonBody } from "@/lib/request-helpers";

interface BorrowPayload {
  studentId?: string;
  bookId?: string;
  action?: "borrow" | "return";
}

function serializeCatalog(studentId: string) {
  const { books, borrowedByStudent } = getLibraryState();
  const studentBorrowed = borrowedByStudent.get(studentId) ?? new Set<string>();

  return Array.from(books.values()).map((book) => ({
    ...book,
    isBorrowedByStudent: studentBorrowed.has(book.id),
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = normalizeStudentId(searchParams.get("studentId") ?? "");

  return NextResponse.json({
    books: serializeCatalog(studentId),
  });
}

export async function POST(request: Request) {
  const parsed = await readJsonBody<BorrowPayload>(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  return withIdempotency(
    request,
    "library:borrow",
    parsed.rawBody,
    async () => {
      const studentId = normalizeStudentId(parsed.data.studentId ?? "");
      const bookId = (parsed.data.bookId ?? "").trim();
      const action = parsed.data.action;

      if (!STUDENT_ID_REGEX.test(studentId)) {
        return { status: 400, body: { error: "Valid Student ID is required." } };
      }

      if (!bookId || (action !== "borrow" && action !== "return")) {
        return {
          status: 400,
          body: { error: "bookId and action ('borrow' or 'return') are required." },
        };
      }

      const { books, borrowedByStudent, students } = getLibraryState();
      if (!students.has(studentId)) {
        return { status: 404, body: { error: "Student account not found." } };
      }

      const book = books.get(bookId);
      if (!book) {
        return { status: 404, body: { error: "Book not found." } };
      }

      let studentBorrowed = borrowedByStudent.get(studentId);
      if (!studentBorrowed) {
        studentBorrowed = new Set<string>();
        borrowedByStudent.set(studentId, studentBorrowed);
      }

      if (action === "borrow") {
        if (studentBorrowed.has(bookId)) {
          return {
            status: 200,
            body: {
              message: `You already have "${book.title}" checked out.`,
              books: serializeCatalog(studentId),
            },
          };
        }

        if (book.availableCopies <= 0) {
          return {
            status: 409,
            body: { error: `No copies of "${book.title}" are currently available.` },
          };
        }

        book.availableCopies -= 1;
        studentBorrowed.add(bookId);

        return {
          status: 200,
          body: {
            message: `Borrowed "${book.title}".`,
            books: serializeCatalog(studentId),
          },
        };
      }

      if (!studentBorrowed.has(bookId)) {
        return {
          status: 200,
          body: {
            message: `"${book.title}" is already returned.`,
            books: serializeCatalog(studentId),
          },
        };
      }

      studentBorrowed.delete(bookId);
      book.availableCopies = Math.min(book.totalCopies, book.availableCopies + 1);

      return {
        status: 200,
        body: {
          message: `Returned "${book.title}".`,
          books: serializeCatalog(studentId),
        },
      };
    }
  );
}
