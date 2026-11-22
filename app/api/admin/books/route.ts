import { NextResponse } from "next/server";
import { withIdempotency } from "@/lib/idempotency";
import { BookCondition, getLibraryState } from "@/lib/library-store";
import { readJsonBody } from "@/lib/request-helpers";

interface CreateBookPayload {
  title?: string;
  author?: string;
  genre?: string;
  shelf?: string;
  totalCopies?: number;
  condition?: BookCondition;
  callNumber?: string;
}

interface DeleteBookPayload {
  bookId?: string;
}

const VALID_CONDITIONS: BookCondition[] = ["Good", "Fair", "Needs Repair"];

export async function POST(request: Request) {
  const parsed = await readJsonBody<CreateBookPayload>(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  return withIdempotency(
    request,
    "admin:books:create",
    parsed.rawBody,
    async () => {
      const title = (parsed.data.title ?? "").trim();
      const author = (parsed.data.author ?? "").trim();
      const genre = (parsed.data.genre ?? "").trim();
      const shelf = (parsed.data.shelf ?? "").trim();
      const callNumber = (parsed.data.callNumber ?? "").trim() || "QA76.9 .J35";
      const totalCopies = Number(parsed.data.totalCopies);
      const condition = parsed.data.condition ?? "Good";

      if (title.length < 2 || author.length < 2) {
        return {
          status: 400,
          body: { error: "Title and author must be at least 2 characters." },
        };
      }

      if (!genre || !shelf) {
        return {
          status: 400,
          body: { error: "Genre and shelf location are required." },
        };
      }

      if (!Number.isInteger(totalCopies) || totalCopies < 1 || totalCopies > 100) {
        return {
          status: 400,
          body: { error: "Total copies must be a whole number between 1 and 100." },
        };
      }

      if (!VALID_CONDITIONS.includes(condition)) {
        return {
          status: 400,
          body: { error: "Condition must be Good, Fair, or Needs Repair." },
        };
      }

      const state = getLibraryState();
      const numericId = state.nextBookNumericId;
      state.nextBookNumericId += 1;

      const book = {
        id: `bk-${numericId}`,
        numericId,
        title,
        author,
        callNumber,
        genre,
        shelf,
        condition,
        totalCopies,
        availableCopies: totalCopies,
      };
      state.books.set(book.id, book);

      return {
        status: 201,
        body: {
          message: `Added "${book.title}" to the library inventory.`,
          book,
          books: Array.from(state.books.values()).sort(
            (a, b) => a.numericId - b.numericId
          ),
        },
      };
    }
  );
}

export async function DELETE(request: Request) {
  const parsed = await readJsonBody<DeleteBookPayload>(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  return withIdempotency(
    request,
    "admin:books:delete",
    parsed.rawBody,
    async () => {
      const bookId = (parsed.data.bookId ?? "").trim();
      if (!bookId) {
        return { status: 400, body: { error: "bookId is required." } };
      }

      const state = getLibraryState();
      const existing = state.books.get(bookId);
      if (!existing) {
        return {
          status: 200,
          body: {
            message: "Book already removed from inventory.",
            books: Array.from(state.books.values()).sort(
              (a, b) => a.numericId - b.numericId
            ),
          },
        };
      }

      state.books.delete(bookId);

      return {
        status: 200,
        body: {
          message: `Removed "${existing.title}" from inventory.`,
          books: Array.from(state.books.values()).sort(
            (a, b) => a.numericId - b.numericId
          ),
        },
      };
    }
  );
}
