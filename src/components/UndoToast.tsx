import { useEffect } from "react";
import { clearUndo, runUndo, useUndo } from "../lib/store";

/** "Logged Filter coffee · Undo" for 6 seconds after anything you log, on every screen. */
export function UndoToast() {
  const u = useUndo();
  useEffect(() => {
    if (!u) return;
    const t = setTimeout(clearUndo, 6000);
    return () => clearTimeout(t);
  }, [u]);
  if (!u) return null;
  return (
    <div className="toast" role="status">
      <span>{u.label}</span>
      <button type="button" onClick={runUndo}>Undo</button>
    </div>
  );
}
