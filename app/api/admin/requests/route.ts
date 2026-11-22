import { NextResponse } from "next/server";
import { withIdempotency } from "@/lib/idempotency";
import { getLibraryState } from "@/lib/library-store";
import { readJsonBody } from "@/lib/request-helpers";

interface RequestDecisionPayload {
  requestId?: string;
  decision?: "Approved" | "Declined";
  dueDate?: string;
}

export async function POST(request: Request) {
  const parsed = await readJsonBody<RequestDecisionPayload>(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  return withIdempotency(
    request,
    "admin:requests:decision",
    parsed.rawBody,
    async () => {
      const requestId = (parsed.data.requestId ?? "").trim();
      const decision = parsed.data.decision;
      const dueDate = (parsed.data.dueDate ?? "").trim();

      if (!requestId || (decision !== "Approved" && decision !== "Declined")) {
        return {
          status: 400,
          body: {
            error: "requestId and decision ('Approved' or 'Declined') are required.",
          },
        };
      }

      const state = getLibraryState();
      const item = state.requests.get(requestId);
      if (!item) {
        return { status: 404, body: { error: "Book request not found." } };
      }

      if (decision === "Approved" && !dueDate) {
        return {
          status: 400,
          body: { error: "Please set a due date before approving this request." },
        };
      }

      if (item.status !== "Pending") {
        return {
          status: 200,
          body: {
            message: `Request ${item.requestCode} is already ${item.status}.`,
            requests: Array.from(state.requests.values()),
            books: Array.from(state.books.values()).sort(
              (a, b) => a.numericId - b.numericId
            ),
          },
        };
      }

      if (decision === "Approved") {
        const book = state.books.get(item.bookId);
        if (book && book.availableCopies > 0) {
          book.availableCopies -= 1;
        }
        item.dueDate = dueDate;
      }

      item.status = decision;

      return {
        status: 200,
        body: {
          message: `${item.requestCode} (${item.bookTitle}) marked as ${decision}.`,
          requests: Array.from(state.requests.values()),
          books: Array.from(state.books.values()).sort(
            (a, b) => a.numericId - b.numericId
          ),
        },
      };
    }
  );
}
