import { NextResponse } from "next/server";
import { withIdempotency } from "@/lib/idempotency";
import {
  getLibraryState,
  normalizeStudentId,
  STUDENT_ID_REGEX,
} from "@/lib/library-store";
import { readJsonBody } from "@/lib/request-helpers";

interface LoginPayload {
  studentId?: string;
  password?: string;
}

export async function POST(request: Request) {
  const parsed = await readJsonBody<LoginPayload>(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  return withIdempotency(request, "auth:login", parsed.rawBody, async () => {
    const studentId = normalizeStudentId(parsed.data.studentId ?? "");
    const password = parsed.data.password ?? "";

    if (!STUDENT_ID_REGEX.test(studentId)) {
      return {
        status: 400,
        body: { error: "Student ID must follow the format YYYY-NNNN (e.g. 2026-1234)." },
      };
    }

    if (password.length < 6) {
      return {
        status: 400,
        body: { error: "Password must be at least 6 characters." },
      };
    }

    const { students } = getLibraryState();
    const account = students.get(studentId);

    if (!account || account.password !== password) {
      return {
        status: 401,
        body: { error: "Invalid Student ID or password." },
      };
    }

    return {
      status: 200,
      body: {
        message: "Signed in to JDJS Library.",
        student: {
          studentId: account.studentId,
          fullName: account.fullName,
          email: account.email,
        },
      },
    };
  });
}
