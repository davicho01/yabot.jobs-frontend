import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./DossierAction.css";

// Keyed by the caller on the application's id (see usage below) so this
// resets its local draft whenever the identity changes, instead of an
// effect syncing state after the fact.
//
// Explicit Save button rather than save-on-blur — autosave here gave no
// feedback on whether (or when) a note actually got saved, which read as
// broken rather than automatic. savedNotes (not the initialNotes prop) is
// the dirty-check baseline so it updates the instant Save is clicked,
// without waiting on the round trip back through the parent's mutation and
// query refetch.
export function NotesEditor({
  initialNotes,
  disabled,
  onSave,
  extraActions,
}: {
  initialNotes: string;
  disabled: boolean;
  onSave: (notes: string) => void;
  // Optional content placed in the same row as Save, to its left — e.g.
  // ApplyPage's Archive button, which used to sit in its own row
  // below this one instead of level with it.
  extraActions?: ReactNode;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [justSaved, setJustSaved] = useState(false);
  const savedFlashTimeout = useRef<number | undefined>(undefined);
  const isDirty = notes !== savedNotes;

  useEffect(() => () => window.clearTimeout(savedFlashTimeout.current), []);

  return (
    <div className="apply-page__notes-editor">
      <textarea
        className="apply-page__notes-textarea"
        value={notes}
        disabled={disabled}
        placeholder="Add notes about this application…"
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className={`apply-page__notes-actions${extraActions ? " apply-page__notes-actions--split" : ""}`}>
        {extraActions}
        <button
          type="button"
          className="apply-page__notes-save"
          disabled={disabled || !isDirty}
          onClick={() => {
            onSave(notes);
            setSavedNotes(notes);
            setJustSaved(true);
            window.clearTimeout(savedFlashTimeout.current);
            savedFlashTimeout.current = window.setTimeout(() => setJustSaved(false), 2000);
          }}
        >
          {!isDirty && justSaved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}
