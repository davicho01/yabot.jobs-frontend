import { useCallback, useState } from "react";
import "./ConfirmDialog.css";

type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmState = ConfirmOptions & {
  message: string;
  resolve: (value: boolean) => void;
};

// Drop-in replacement for window.confirm(message) — call `confirm(message)`,
// await the boolean, and render `dialog` once near the root of the
// component. Promise-based so existing `if (await confirm(...)) { ... }`
// call sites barely change.
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ message, resolve, ...options });
    });
  }, []);

  function respond(value: boolean) {
    state?.resolve(value);
    setState(null);
  }

  const dialog = state && (
    <div className="confirm-dialog__overlay" onClick={() => respond(false)}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {state.title && <h2 className="confirm-dialog__title">{state.title}</h2>}
        <p className="confirm-dialog__message">{state.message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__button" onClick={() => respond(false)}>
            {state.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--danger"
            onClick={() => respond(true)}
          >
            {state.confirmLabel ?? "Delete"}
          </button>
        </div>
      </div>
    </div>
  );

  return { confirm, dialog };
}
