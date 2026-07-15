import { PROTOCOL_VERSION, parseServerMessage, type ClientCommand, type ClientCommandInput, type ServerMessage } from "@pi-tin/protocol";

export type HostProfile = {
  host: string;
  controlPort: number;
  plannotatorPort: number;
  token: string;
};

type ConnectionHooks = {
  onState: (state: "connecting" | "connected" | "offline" | "error", detail?: string) => void;
  onMessage: (message: ServerMessage) => void;
};

type SocketLike = Pick<WebSocket, "readyState" | "send" | "close"> & {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
};

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export type HostVerification = { sessionCount: number; maxSessions: number };

function profileWebSocketUrl(profile: HostProfile): string {
  const host = profile.host.includes(":") && !profile.host.startsWith("[") ? `[${profile.host}]` : profile.host;
  return `ws://${host}:${profile.controlPort}`;
}

export function verifyHostProfile(
  profile: HostProfile,
  socketFactory: (url: string) => SocketLike = (url) => new WebSocket(url),
  timeoutMs = 8_000,
): Promise<HostVerification> {
  return new Promise((resolve, reject) => {
    let socket: SocketLike;
    let settled = false;
    const finish = (result: { value: HostVerification } | { error: Error }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(1000, "Connection check complete"); } catch {}
      if ("value" in result) resolve(result.value);
      else reject(result.error);
    };
    const timer = setTimeout(() => finish({ error: new Error("The Pi host did not respond in time.") }), timeoutMs);

    try {
      socket = socketFactory(profileWebSocketUrl(profile));
    } catch (error) {
      clearTimeout(timer);
      settled = true;
      reject(error instanceof Error ? error : new Error("Could not open a connection to the Pi host."));
      return;
    }
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "auth", version: PROTOCOL_VERSION, token: profile.token }));
    };
    socket.onmessage = (event) => {
      try {
        const message = parseServerMessage(JSON.parse(String(event.data)));
        if (message.type === "session_list") {
          finish({ value: { sessionCount: message.sessions.length, maxSessions: message.maxSessions } });
        } else if (message.type === "error") {
          finish({ error: new Error(message.message) });
        }
      } catch {
        finish({ error: new Error("The Pi host returned an invalid response. Update the host and desktop app together.") });
      }
    };
    socket.onerror = () => finish({ error: new Error("Could not reach the Pi host. Check its address, port, and firewall.") });
    socket.onclose = (event) => {
      if (!settled) finish({ error: new Error(event.reason || `The Pi host closed the connection (${event.code}).`) });
    };
  });
}

export class PiConnection {
  private socket: SocketLike | null = null;
  private profile: HostProfile | null = null;
  private stopped = true;
  private generation = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pending = new Map<string, Pending>();

  constructor(private hooks: ConnectionHooks, private socketFactory: (url: string) => SocketLike = (url) => new WebSocket(url)) {}

  connect(profile: HostProfile): void {
    this.disconnect();
    this.profile = profile;
    this.stopped = false;
    this.reconnectAttempt = 0;
    this.open();
  }

  disconnect(): void {
    this.stopped = true;
    this.generation++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close(1000, "Updating connection settings");
    this.socket = null;
    this.rejectPending("Disconnected");
  }

  async command(command: ClientCommandInput, timeoutMs = 15_000): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error("Not connected");
    const id = crypto.randomUUID();
    const payload = { ...command, id } as ClientCommand;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${command.type} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.send(JSON.stringify(payload));
    });
  }

  private open(): void {
    if (!this.profile || this.stopped) return;
    const generation = ++this.generation;
    this.hooks.onState("connecting");
    const socket = this.socketFactory(profileWebSocketUrl(this.profile));
    this.socket = socket;
    socket.onopen = () => {
      if (generation !== this.generation || !this.profile) return;
      socket.send(JSON.stringify({ type: "auth", version: PROTOCOL_VERSION, token: this.profile.token }));
    };
    socket.onmessage = (event) => {
      if (generation !== this.generation) return;
      try {
        const message = parseServerMessage(JSON.parse(String(event.data)));
        if (message.type === "session_list" || message.type === "snapshot") {
          this.reconnectAttempt = 0;
          this.hooks.onState("connected");
        }
        if (message.type === "response") {
          const pending = this.pending.get(message.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(message.id);
            message.success ? pending.resolve(message.data) : pending.reject(new Error(message.error || `${message.command} failed`));
          }
        }
        if (message.type === "error" && message.code === "unauthorized") this.hooks.onState("error", message.message);
        this.hooks.onMessage(message);
      } catch (error) {
        this.hooks.onState("error", error instanceof Error ? error.message : "Invalid server message");
      }
    };
    socket.onerror = () => {
      if (generation === this.generation) this.hooks.onState("error", "WebSocket connection failed");
    };
    socket.onclose = (event) => {
      if (generation !== this.generation) return;
      this.socket = null;
      this.rejectPending("Connection closed");
      const terminalError = event.code === 4002 || event.code === 4003 || event.code === 4004;
      if (this.stopped || terminalError) {
        this.hooks.onState(terminalError ? "error" : "offline", event.reason || undefined);
        return;
      }
      this.hooks.onState("offline", "Reconnecting…");
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(10_000, 500 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private rejectPending(reason: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
