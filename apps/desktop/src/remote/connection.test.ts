import { describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "@pi-tin/protocol";
import { PiConnection, verifyHostProfile } from "./connection";

class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  send(value: string) { this.sent.push(value); }
  closeCode?: number;
  close(code?: number) { this.closeCode = code; }
}

describe("connection auth boundary", () => {
  it("authenticates before commands and correlates responses", async () => {
    (globalThis as any).WebSocket = FakeSocket;
    const socket = new FakeSocket();
    const states: string[] = [];
    const connection = new PiConnection({ onState: (state) => states.push(state), onMessage: vi.fn() }, () => socket as any);
    connection.connect({ host: "10.0.0.2", controlPort: 31415, plannotatorPort: 19432, token: "token" });
    socket.onopen!(new Event("open"));
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({ type: "auth", token: "token" });
    socket.onmessage!({ data: JSON.stringify({ type: "session_list", version: PROTOCOL_VERSION, sessions: [], maxSessions: 5 }) } as MessageEvent);
    const pending = connection.command({ type: "abort", sessionId: "s1" });
    const command = JSON.parse(socket.sent[1]!);
    socket.onmessage!({ data: JSON.stringify({ type: "response", id: command.id, command: "abort", success: true }) } as MessageEvent);
    await expect(pending).resolves.toBeUndefined();
    expect(states).toContain("connected");
    connection.disconnect();
  });

  it("does not reconnect with a stale token after rotation", () => {
    vi.useFakeTimers();
    try {
      (globalThis as any).WebSocket = FakeSocket;
      const socket = new FakeSocket();
      const states: Array<{ state: string; detail?: string }> = [];
      let opens = 0;
      const connection = new PiConnection({
        onState: (state, detail) => states.push({ state, detail }),
        onMessage: vi.fn(),
      }, () => { opens++; return socket as any; });

      connection.connect({ host: "10.0.0.2", controlPort: 31415, plannotatorPort: 19432, token: "old-token" });
      socket.onclose!({ code: 4004, reason: "Token rotated" } as CloseEvent);
      vi.advanceTimersByTime(30_000);

      expect(opens).toBe(1);
      expect(states.at(-1)).toEqual({ state: "error", detail: "Token rotated" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("verifies authentication and host readiness before settings are saved", async () => {
    const socket = new FakeSocket();
    const verification = verifyHostProfile(
      { host: "fe80::1", controlPort: 31415, plannotatorPort: 19432, token: "token" },
      (url) => {
        expect(url).toBe("ws://[fe80::1]:31415");
        return socket as any;
      },
    );

    socket.onopen!(new Event("open"));
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({ type: "auth", version: PROTOCOL_VERSION, token: "token" });
    socket.onmessage!({ data: JSON.stringify({ type: "session_list", version: PROTOCOL_VERSION, sessions: [], maxSessions: 5 }) } as MessageEvent);

    await expect(verification).resolves.toEqual({ sessionCount: 0, maxSessions: 5 });
    expect(socket.closeCode).toBe(1000);
  });

  it("surfaces an authentication failure during verification", async () => {
    const socket = new FakeSocket();
    const verification = verifyHostProfile(
      { host: "10.0.0.2", controlPort: 31415, plannotatorPort: 19432, token: "wrong" },
      () => socket as any,
    );
    socket.onopen!(new Event("open"));
    socket.onmessage!({ data: JSON.stringify({ type: "error", code: "unauthorized", message: "Authentication failed." }) } as MessageEvent);
    await expect(verification).rejects.toThrow("Authentication failed");
  });

  it("times out a host that never completes authentication", async () => {
    vi.useFakeTimers();
    try {
      const socket = new FakeSocket();
      const verification = verifyHostProfile(
        { host: "10.0.0.2", controlPort: 31415, plannotatorPort: 19432, token: "token" },
        () => socket as any,
        250,
      );
      const rejection = expect(verification).rejects.toThrow("did not respond in time");
      await vi.advanceTimersByTimeAsync(250);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
