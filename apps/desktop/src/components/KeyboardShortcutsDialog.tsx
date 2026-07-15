import { Keyboard, X } from "lucide-react";
import { useDialogFocus } from "./use-dialog-focus";

export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { dialogRef, trapFocus } = useDialogFocus<HTMLDivElement>();
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const shortcuts = [
    { label: "Connection settings", keys: [modifier, ","] },
    { label: "Open workspace", keys: [modifier, "Shift", "O"] },
    { label: "Switch to workspace", keys: ["Alt", "1–5"] },
    { label: "Show this guide", keys: ["?"] },
    { label: "Close a dialog", keys: ["Esc"] },
  ];

  return <div className="dialog-backdrop" onMouseDown={onClose}><div
    ref={dialogRef}
    className="shortcut-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="keyboard-shortcuts-title"
    onKeyDown={(event) => { trapFocus(event); if (event.key === "Escape") onClose(); }}
    onMouseDown={(event) => event.stopPropagation()}
  >
    <header><span className="shortcut-title-icon"><Keyboard size={17} /></span><div><strong id="keyboard-shortcuts-title">Keyboard shortcuts</strong><span>Move around Pi Tin without leaving the keyboard.</span></div><button data-dialog-autofocus type="button" aria-label="Close Keyboard shortcuts" onClick={onClose}><X size={17} /></button></header>
    <div className="shortcut-list">{shortcuts.map((shortcut) => <div key={shortcut.label}><span>{shortcut.label}</span><span>{shortcut.keys.map((key) => <kbd key={key}>{key}</kbd>)}</span></div>)}</div>
  </div></div>;
}
