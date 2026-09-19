import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import "./ProfilePage.css";

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export function ProfilePage() {
  const { user, updateDisplayName } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");

  useEffect(() => {
    setDisplayName(user?.display_name ?? "");
  }, [user?.display_name]);

  const updateMutation = useMutation({
    mutationFn: (name: string) => updateDisplayName(name.trim() || null),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    updateMutation.mutate(displayName);
  }

  if (!user) return null;

  return (
    <main className="profile-page">
      <h1>Profile</h1>
      <p className="profile-page__intro">Manage your account details.</p>

      <section className="profile-section">
        <form onSubmit={handleSubmit} className="profile-form">
          <label>
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              placeholder="Add a display name"
            />
          </label>
          <button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving…" : "Save"}
          </button>
          {updateMutation.isSuccess && <p className="profile-page__success">Saved.</p>}
          {updateMutation.isError && (
            <p className="profile-page__error">
              {updateMutation.error instanceof ApiError ? updateMutation.error.message : "Couldn't save that name."}
            </p>
          )}
        </form>
      </section>

      <section className="profile-section">
        <dl className="profile-details">
          <div className="profile-details__row">
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div className="profile-details__row">
            <dt>Status</dt>
            <dd>{user.status}</dd>
          </div>
          <div className="profile-details__row">
            <dt>Role</dt>
            <dd>{user.role}</dd>
          </div>
          <div className="profile-details__row">
            <dt>Joined</dt>
            <dd>{formatDateTime(user.created_at)}</dd>
          </div>
          <div className="profile-details__row">
            <dt>Last login</dt>
            <dd>{formatDateTime(user.last_login_at)}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
