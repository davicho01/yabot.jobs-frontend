import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resumesApi } from "../api/resumes";
import { ApiError } from "../api/client";
import type { SkillAddition } from "../api/types";
import "./AddSkillModal.css";

// The fixed catch-all option alongside a resume's own extracted
// work-history roles — for a skill that doesn't belong under one specific
// job (e.g. a general tool/technology), routed to a Skills-type section
// instead. See app.services.prompts.RESUME_SKILL_ADDITIONS_PROMPT.
export const GENERAL_TARGET_ROLE = "General / Skills section";

// Lets the candidate explain a missing skill they actually have real
// experience with, and say which of their own past roles it belongs
// under — saved immediately (not just local state) so working through
// several skills survives a refresh. See ResumeOptimizationPage, which
// batches every save here into one "Add missing skills to resume" pass.
export function AddSkillModal({
  resumeId,
  keyword,
  existing,
  onClose,
}: {
  resumeId: string;
  keyword: string;
  existing: SkillAddition | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const rolesQuery = useQuery({ queryKey: ["resume-roles", resumeId], queryFn: () => resumesApi.roles(resumeId) });
  const roleOptions = [...(rolesQuery.data?.roles ?? []), GENERAL_TARGET_ROLE];

  const [targetRole, setTargetRole] = useState(existing?.target_role ?? "");
  const [explanation, setExplanation] = useState(existing?.explanation ?? "");
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const roleMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roleMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (roleMenuRef.current && !roleMenuRef.current.contains(event.target as Node)) setRoleMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [roleMenuOpen]);

  function invalidateAndClose() {
    queryClient.invalidateQueries({ queryKey: ["skill-additions", resumeId] });
    onClose();
  }

  const saveMutation = useMutation({
    mutationFn: () => resumesApi.saveSkillAddition(resumeId, { keyword, target_role: targetRole, explanation }),
    onSuccess: invalidateAndClose,
  });
  const deleteMutation = useMutation({
    mutationFn: () => resumesApi.deleteSkillAddition(resumeId, existing!.id),
    onSuccess: invalidateAndClose,
  });

  const canSave = targetRole.trim() !== "" && explanation.trim() !== "";
  const error = saveMutation.error ?? deleteMutation.error;

  return (
    <div className="add-skill-modal__overlay" onClick={onClose}>
      <div
        className="add-skill-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${keyword} to resume`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="add-skill-modal__header">
          <h2>
            Add <span className="tag tag--secondary">{keyword}</span>
          </h2>
          <button type="button" className="add-skill-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="add-skill-modal__intro">
          Explain the real experience behind this skill, and which of your past roles it belongs to — it'll be
          turned into a bullet point when you apply your changes.
        </p>

        <label className="add-skill-modal__label" id="add-skill-modal-role-label">
          Which job does this belong to?
        </label>
        <div className="action-dropdown add-skill-modal__role-dropdown" ref={roleMenuRef}>
          <button
            type="button"
            className="rescan-button add-skill-modal__role-button"
            aria-haspopup="listbox"
            aria-expanded={roleMenuOpen}
            aria-labelledby="add-skill-modal-role-label"
            onClick={() => setRoleMenuOpen((o) => !o)}
          >
            <span>{targetRole || "Choose a role"}</span>
            <span aria-hidden="true">↓</span>
          </button>
          {roleMenuOpen && (
            <div className="action-dropdown-menu" role="listbox">
              {rolesQuery.isLoading && <button disabled>Loading roles…</button>}
              {roleOptions.map((role) => (
                <button
                  key={role}
                  type="button"
                  role="option"
                  aria-selected={role === targetRole}
                  onClick={() => {
                    setTargetRole(role);
                    setRoleMenuOpen(false);
                  }}
                >
                  {role}
                  {role === targetRole ? " ✓" : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="add-skill-modal__label" htmlFor="add-skill-modal-explanation">
          Explain the experience
        </label>
        <textarea
          id="add-skill-modal-explanation"
          className="add-skill-modal__textarea"
          value={explanation}
          placeholder="e.g. Ran our Kubernetes clusters in production for two years, including upgrades and on-call."
          onChange={(e) => setExplanation(e.target.value)}
        />

        {error && <p className="add-skill-modal__error">{error instanceof ApiError ? error.message : "Something went wrong."}</p>}

        <div className="add-skill-modal__actions">
          {existing && (
            <button
              type="button"
              className="add-skill-modal__remove"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </button>
          )}
          <button
            type="button"
            className="add-skill-modal__save"
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
