import { NextResponse } from "next/server";
import { withIdempotency } from "@/lib/idempotency";
import { normalizeStudentId, STUDENT_ID_REGEX } from "@/lib/library-store";
import { readJsonBody } from "@/lib/request-helpers";

interface ForgotPasswordPayload {
  studentId?: string;
}

export async function POST(request: Request) {
  const parsed = await readJsonBody<ForgotPasswordPayload>(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  return withIdempotency(
    request,
    "auth:forgot-password",
    parsed.rawBody,
    async () => {
      const studentId = normalizeStudentId(parsed.data.studentId ?? "");

      if (!STUDENT_ID_REGEX.test(studentId)) {
        return {
          status: 400,
          body: {
            error: "Student ID must follow the format YYYY-NNNN (e.g. 2026-1234).",
          },
        };
      }

      return {
        status: 200,
        body: {
          message: `If ${studentId} is registered, password reset instructions have been sent to ${studentId}@jdjs.edu.`,
        },
      };
    }
  );
}
