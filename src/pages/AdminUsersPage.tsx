import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { AdminWindowStats } from "../components/AdminWindowStats";
import { ScanActivityChart } from "../components/ScanActivityChart";
import "./AdminCommon.css";

export function AdminUsersPage() {
  // Same query key as the dashboard, so coming from there is instant.
  const dashboardQuery = useQuery({ queryKey: ["admin", "dashboard"], queryFn: adminApi.dashboard });
  const dashboard = dashboardQuery.data;

  return (
    <main className="admin-page">
      <Link to="/admin" className="admin-back-link">
        ← Admin dashboard
      </Link>
      <h1>Users{dashboard ? ` (${dashboard.totals.users.toLocaleString()})` : ""}</h1>

      {dashboard && (
        <section className="admin-section">
          <AdminWindowStats title="Users joined" counts={dashboard.users_joined} />
          <AdminWindowStats title="User activity" counts={dashboard.user_activity} />
        </section>
      )}

      <ScanActivityChart title="Users joined" series="users-joined" />
    </main>
  );
}
