import { useEffect, useState } from "react";
import { Brain, ChevronDown, Code2, Moon, Settings, Sparkles, Sun, Unplug, Zap } from "lucide-react";
import { Toaster, toast } from "sonner";
import { HostSettingsDialog } from "./components/HostSettingsDialog";
import { Thread } from "./components/assistant-ui/Thread";
import { ReviewPanel } from "./components/review/ReviewPanel";
import { PiRuntimeProvider } from "./runtime/PiRuntimeProvider";
import { useAppStore } from "./remote/store";

export default function App() {
  const hydrate = useAppStore((state) => state.hydrateProfile);
  const profile = useAppStore((state) => state.profile);
  const session = useAppStore((state) => state.session);
  const state = useAppStore((store) => store.connectionState);
  const detail = useAppStore((store) => store.connectionDetail);
  const command = useAppStore((store) => store.command);
  const review = useAppStore((store) => store.review);
  const showReview = useAppStore((store) => store.showReview);
  const error = useAppStore((store) => store.lastError);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dark, setDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => { void hydrate().then(() => { if (!useAppStore.getState().profile) setSettingsOpen(true); }); }, [hydrate]);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  useEffect(() => { if (error) toast.error(error); }, [error]);

  const run = (label: string, promise: Promise<unknown>) => toast.promise(promise, { loading: label, success: `${label} requested`, error: (caught) => caught.message });
  const connected = state === "connected";

  return <div className="app-shell">
    <main>
      <header className="topbar">
        <div className="session-heading"><strong>{session.sessionName || "Remote Pi session"}</strong><span>{session.cwd || (profile ? "Waiting for Pi…" : "Configure the connection in Settings")}</span></div>
        <div className={`connection-pill ${state}`}><i />{state}{detail && <span> · {detail}</span>}</div>
        <div className="top-actions">
          <label className="select-control"><Sparkles size={15} /><select disabled={!connected} value={session.model ? `${session.model.provider}/${session.model.id}` : ""} onChange={(event) => { const [provider, ...rest] = event.target.value.split("/"); run("Switch model", command({ type: "set_model", provider, modelId: rest.join("/") })); }}><option value="">Model</option>{session.availableModels.map((model) => <option key={`${model.provider}/${model.id}`} value={`${model.provider}/${model.id}`}>{model.name || model.id}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-control"><Brain size={15} /><select disabled={!connected} value={session.thinkingLevel} onChange={(event) => run("Thinking level", command({ type: "set_thinking", level: event.target.value as any }))}>{["off", "minimal", "low", "medium", "high", "xhigh"].map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label>
          <button disabled={!connected} className={session.planPhase !== "idle" ? "active-control" : ""} onClick={() => run("Plan mode", command({ type: "set_plan_mode", mode: session.planPhase === "idle" ? "enter" : "exit" }))}><Zap size={15} /> Plan</button>
          <button disabled={!connected || Boolean(review)} onClick={() => run("Code review", command({ type: "start_code_review" }))}><Code2 size={15} /> Review changes</button>
          <button disabled={!connected || session.isRunning} onClick={() => run("Compact", command({ type: "compact" }))}>Compact</button>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} title="Connection settings"><Settings size={16} /></button>
          <button className="icon-button" onClick={() => setDark((value) => !value)} title="Toggle theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
      </header>
      {state !== "connected" && <div className="offline-banner"><Unplug size={15} />{state === "connecting" ? "Connecting to Pi…" : profile ? "Pi is offline. Messages and controls are disabled until the connection returns." : "Open Settings to configure your Pi host."}</div>}
      {review && <nav className="view-tabs"><button className={!review.visible ? "active" : ""} onClick={() => showReview(false)}>Chat</button><button className={review.visible ? "active" : ""} onClick={() => showReview(true)}><span className="review-pulse" />Review</button></nav>}
      <section className="workspace">
        {review?.visible ? <ReviewPanel /> : <PiRuntimeProvider><Thread /></PiRuntimeProvider>}
      </section>
    </main>
    {settingsOpen && <HostSettingsDialog onClose={() => setSettingsOpen(false)} />}
    <Toaster richColors position="bottom-right" theme={dark ? "dark" : "light"} />
  </div>;
}
