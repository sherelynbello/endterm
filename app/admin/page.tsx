import type { Metadata } from "next";
import AdminDashboard from "@/components/AdminDashboard";

export const metadata: Metadata = {
  title: "JDJS University — Library Admin System",
  description:
    "Manage JDJS University Library book inventory, borrowing requests, and circulation analytics.",
};

export default function AdminPage() {
  return <AdminDashboard />;
}
