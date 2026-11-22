import { NextResponse } from "next/server";
import { withIdempotency } from "@/lib/idempotency";
import {
  getLibraryState,
  normalizeStudentId,
  STUDENT_ID_REGEX,
} from "@/lib/library-store";
import { readJsonBody } from "@/lib/request-helpers";

interface SignupPayload {
  studentId?: string;
  fullName?: string;
  password?: string;
}

export async function POST(request: Request) {
  const parsed = await readJsonBody<SignupPayload>(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  return withIdempotency(request, "auth:signup", parsed.rawBody, async () => {
    const studentId = normalizeStudentId(parsed.data.studentId ?? "");
    const fullName = (parsed.data.fullName ?? "").trim();
    const password = parsed.data.password ?? "";

    if (!STUDENT_ID_REGEX.test(studentId)) {
      return {
        status: 400,
        body: { error: "Student ID must follow the format YYYY-NNNN (e.g. 2026-1234)." },
      };
    }

    if (fullName.length < 2) {
      return {
        status: 400,
        body: { error: "Full name must be at least 2 characters." },
      };
    }

    if (password.length < 8) {
      return {
        status: 400,
        body: { error: "Password must be at least 8 characters." },
      };
    }

    const { students } = getLibraryState();
    if (students.has(studentId)) {
      return {
        status: 409,
        body: { error: `Student ID ${studentId} is already registered.` },
      };
    }

    const account = {
      studentId,
      fullName,
      email: `${studentId}@jdjs.edu`,
      password,
      createdAt: new Date().toISOString(),
    };
    students.set(studentId, account);

    return {
      status: 201,
      body: {
        message: "Account created and signed in.",
        student: {
          studentId: account.studentId,
          fullName: account.fullName,
          email: account.email,
        },
      },
    };
  });
}
