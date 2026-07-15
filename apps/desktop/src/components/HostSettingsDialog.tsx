import { useState } from "react";
import { CheckCircle2, LoaderCircle, RotateCcw, Server, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { verifyHostProfile, type HostProfile, type HostVerification } from "../remote/connection";
import { useAppStore } from "../remote/store";
import { useDialogFocus } from "./use-dialog-focus";

const blank = (): HostProfile => ({ host: "", controlPort: 31415, plannotatorPort: 19432, token: "" });
const buildRevision = import.meta.env.VITE_BUILD_REVISION || "development";

function connectionKey(profile: HostProfile): string {
  return JSON.stringify(profile);
}

function validateProfile(profile: HostProfile): string | null {
  if (!profile.host || !profile.token) return "Enter both the Pi host and its generated token.";
  if (/^[a-z]+:\/\//i.test(profile.host) || /[/?#]/.test(profile.host)) return "Enter only a host name or IP address, without a protocol or path.";
  if (![profile.controlPort, profile.plannotatorPort].every((port) => Number.isInteger(port) && port >= 1 && port <= 65_535)) return "Ports must be whole numbers between 1 and 65535.";
  return null;
}

export function HostSettingsDialog({ onClose }: { onClose: () => void }) {
  const profile = useAppStore((state) => state.profile);
  const save = useAppStore((state) => state.saveProfile);
  const clear = useAppStore((state) => state.clearProfile);
  const command = useAppStore((state) => state.command);
  const connectionState = useAppStore((state) => state.connectionState);
  const connectionDetail = useAppStore((state) => state.connectionDetail);
  const sessionCount = useAppStore((state) => state.sessions.length);
  const rpcStatus = useAppStore((state) => state.rpcStatus);
  const [editing, setEditing] = useState<HostProfile>(() => profile ? { ...profile } : blank());
  const [restarting, setRestarting] = useState(false);
  const [phase, setPhase] = useState<"testing" | "saving" | null>(null);
  const [error, setError] = useState<string>();
  const [verified, setVerified] = useState<{ key: string; result: HostVerification; verifiedAt: number }>();
  const { dialogRef, trapFocus } = useDialogFocus<HTMLFormElement>();
  const busy = phase !== null;
  const connected = connectionState === "connected";

  const normalizedProfile = (): HostProfile => ({ ...editing, host: editing.host.trim(), token: editing.token.trim() });
  const checkConnection = async (saveAfter: boolean) => {
    const candidate = normalizedProfile();
    const validationError = validateProfile(candidate);
    if (validationError) { setError(validationError); return; }
    setError(undefined);
    setPhase(saveAfter ? "saving" : "testing");
    try {
      const key = connectionKey(candidate);
      const recentlyVerified = verified?.key === key && Date.now() - verified.verifiedAt < 10_000;
      const result = recentlyVerified ? verified.result : await verifyHostProfile(candidate);
      setVerified({ key, result, verifiedAt: Date.now() });
      if (!saveAfter) return;
      await save(candidate);
      toast.success(`Connected to ${candidate.host}`);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify the Pi host connection.");
    } finally {
      setPhase(null);
    }
  };

  const restartPi = async () => {
    if (!window.confirm("Restart the selected Pi runtime? Its active response will stop, and its current session will be restored.")) return;
    setRestarting(true);
    try {
      await command({ type: "restart_pi" }, 120_000);
      toast.success("Pi restarted on the host");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not restart Pi");
    } finally {
      setRestarting(false);
    }
  };

  const currentVerification = verified?.key === connectionKey(normalizedProfile()) ? verified.result : null;
  const connectionTitle = !profile ? "Connect one trusted Pi host"
    : connected ? `Connected to ${profile.host}`
    : connectionState === "connecting" ? `Connecting to ${profile.host}` : "Connection needs attention";
  const connectionText = !profile ? "Pi Tin stays on your LAN. Enter the address and generated token printed by the host."
    : connected ? `${sessionCount} of 5 workspaces open · Control port ${profile.controlPort}`
    : connectionDetail || "Check that the host is running and the address, token, and firewall are correct.";

  return <div className="dialog-backdrop" onMouseDown={() => { if (!busy) onClose(); }}><form
    ref={dialogRef}
    className="profile-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="connection-settings-title"
    aria-busy={busy}
    onKeyDown={(event) => { trapFocus(event); if (event.key === "Escape" && !busy) onClose(); }}
    onMouseDown={(event) => event.stopPropagation()}
    onSubmit={(event) => { event.preventDefault(); void checkConnection(true); }}
  >
    <header><strong id="connection-settings-title">Connection settings</strong><button type="button" aria-label="Close Connection settings" disabled={busy} onClick={onClose}><X size={17} /></button></header>
    <div className={`connection-summary ${profile ? connectionState : "new"}`}><span className="connection-summary-icon"><Server size={18} /></span><div><strong>{connectionTitle}</strong><span>{connectionText}</span></div></div>
    <label>Host or IP<input data-dialog-autofocus required disabled={busy} value={editing.host} onChange={(event) => { setEditing({ ...editing, host: event.target.value }); setError(undefined); }} placeholder="192.168.1.20" /></label>
    <div className="field-row"><label>Control port<input required disabled={busy} type="number" min="1" max="65535" step="1" value={editing.controlPort} onChange={(event) => { setEditing({ ...editing, controlPort: Number(event.target.value) }); setError(undefined); }} /></label><label>Review port<input required disabled={busy} type="number" min="1" max="65535" step="1" value={editing.plannotatorPort} onChange={(event) => { setEditing({ ...editing, plannotatorPort: Number(event.target.value) }); setError(undefined); }} /></label></div>
    <label>Generated token<input required disabled={busy} type="password" value={editing.token} onChange={(event) => { setEditing({ ...editing, token: event.target.value }); setError(undefined); }} /></label>
    <p>Copy the token printed by `start-host.mjs`. Pi Tin verifies the host before saving these settings.</p>
    {currentVerification && <div className="verification-result" role="status"><CheckCircle2 size={15} /><span><strong>Connection verified</strong>{currentVerification.sessionCount} workspace{currentVerification.sessionCount === 1 ? "" : "s"} ready · limit {currentVerification.maxSessions}</span></div>}
    {error && <p className="session-dialog-error" role="alert">{error}</p>}
    {profile && <div className="host-control"><div><strong>Selected Pi runtime</strong><span>Restart the selected Pi process and restore its current session.</span></div><button type="button" disabled={busy || !connected || rpcStatus === "starting" || restarting} onClick={() => void restartPi()}><RotateCcw className={restarting ? "spin" : undefined} size={15} />{restarting ? "Restarting…" : rpcStatus === "error" ? "Retry Pi" : "Restart Pi"}</button></div>}
    <p className="build-revision">Desktop build {buildRevision}</p>
    <footer>{profile && <button className="danger" type="button" disabled={busy} onClick={() => { if (window.confirm("Remove this Pi host connection?")) void clear().then(onClose); }}><Trash2 size={15} /> Remove connection</button>}<span /><button type="button" disabled={busy} onClick={() => void checkConnection(false)}>{phase === "testing" ? <><LoaderCircle className="spin" size={14} /> Testing…</> : "Test connection"}</button><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={busy}>{phase === "saving" ? <><LoaderCircle className="spin" size={14} /> Verifying…</> : "Save & connect"}</button></footer>
  </form></div>;
}
