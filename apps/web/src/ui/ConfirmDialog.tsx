import { useEffect } from "react";
import { createPortal } from "react-dom";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Sair",
  cancelText = "Continuar editando",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const dialog = (
    <div className="ui-modal" role="dialog" aria-modal="true" aria-label={title}>
      <button className="ui-modal__backdrop" onClick={onCancel} aria-label="Fechar" />
      <div className="ui-modal__card ui-card">
        <h3 className="ui-modal__title">{title}</h3>
        <p className="ui-modal__message">{message}</p>

        <div className="ui-actions ui-modal__actions">
          <button className="ui-btn" onClick={onConfirm}>
            {confirmText}
          </button>
          <button className="ui-btn ui-btn--ghost" onClick={onCancel}>
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
