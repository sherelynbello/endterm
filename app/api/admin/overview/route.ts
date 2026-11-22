import { NextResponse } from "next/server";
import { getLibraryState } from "@/lib/library-store";

const MONTHLY_BORROWING_ACTIVITY = [
  { month: "May", count: 44 },
  { month: "Jun", count: 58 },
  { month: "Jul", count: 51 },
  { month: "Aug", count: 72 },
  { month: "Sep", count: 65 },
  { month: "Oct", count: 84 },
];

export async function GET() {
  const { books, requests } = getLibraryState();

  return NextResponse.json({
    books: Array.from(books.values()).sort((a, b) => a.numericId - b.numericId),
    requests: Array.from(requests.values()),
    monthlyActivity: MONTHLY_BORROWING_ACTIVITY,
  });
}
