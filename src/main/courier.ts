import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);

// Bee courier — the piece that makes this a desktop app rather than a web page.
// Bee data is end-to-end encrypted and readable ONLY on the owner-authenticated
// machine, so this runs the `bee` CLI locally and forwards each new conversation
// to the hosted backend. Flow:
//   1. `bee login --no-wait` once (the "Connect Bee" button) → owner approves in browser
//   2. poll `bee changed --cursor <c> --json` for new/updated conversations
//   3. `bee conversations get <id> --json` → verbatim utterances (authoritative)
//   4. POST to `${backendUrl}/webhooks/bee/conversation`, signed with the shared
//      secret (X-Webhook-Secret) that the backend guard verifies.
// The cursor is persisted only AFTER a batch fully succeeds → exactly-once.

export type BeeConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type BeePhase = 'setup' | 'approving' | 'active' | 'attention';

export interface CourierStatus {
  state: BeeConnectionState;
  phase: BeePhase; // coarse onboarding phase for the UI
  lastSyncedAt: string | null;
  message: string;
  authUrl?: string; // present while awaiting owner approval
}

export interface CourierConfig {
  backendUrl: string;
  webhookSecret?: string;
  dataDir: string; // where the cursor is persisted (app userData)
  // How to invoke the Bee CLI. The app ships `@beeai/cli` inside the bundle and
  // runs it with Electron's own Node (beeCommand = the app binary, beeArgsPrefix
  // = [<cli entry>], beeEnv = { ELECTRON_RUN_AS_NODE: '1' }) so Nicole never
  // installs Node or npm. Falls back to `bee` on PATH if the bundle is absent.
  beeCommand?: string;
  beeArgsPrefix?: string[];
  beeEnv?: Record<string, string>;
  pollIntervalMs?: number;
}

// Defensive over Bee's exact JSON field names — confirmed at integration time.
interface RawConversation {
  id?: string;
  conversation_id?: string;
  start?: string;
  start_time?: string;
  starts_at?: string;
  end?: string;
  end_time?: string;
  ends_at?: string;
  transcript?: string | { utterances?: RawUtterance[] };
  text?: string;
  utterances?: RawUtterance[];
}
interface RawUtterance {
  speaker?: string;
  speaker_name?: string;
  text?: string;
  content?: string;
}

interface ConversationPayload {
  bee_id: string;
  starts_at: string;
  ends_at: string;
  transcript?: string;
}

class Courier extends EventEmitter {
  private cfg: CourierConfig = { backendUrl: 'http://localhost:3000', dataDir: '.' };
  private state: BeeConnectionState = 'disconnected';
  private lastSyncedAt: string | null = null;
  private lastMessage: string | null = null;
  private authUrl?: string;
  private pollTimer: NodeJS.Timeout | null = null;
  private authWatch: NodeJS.Timeout | null = null;
  private polling = false;

  init(cfg: CourierConfig): void {
    this.cfg = { pollIntervalMs: 60_000, beeCommand: 'bee', beeArgsPrefix: [], ...cfg };
    // Resume automatically if the owner is already authenticated on this machine.
    void this.isAuthenticated().then((authed) => {
      if (authed) this.startPolling();
      else this.setStatus('disconnected', 'Bee not connected — click Connect Bee to start.');
    });
  }

  status(): CourierStatus {
    return {
      state: this.state,
      phase: this.phase(),
      lastSyncedAt: this.lastSyncedAt,
      message: this.messageFor(),
      authUrl: this.authUrl,
    };
  }

  /** Kick off `bee login`; returns the approval URL for the UI to open. */
  async connect(): Promise<CourierStatus> {
    if (this.state === 'connected') return this.status();
    this.setStatus('connecting', 'Starting Bee…');
    try {
      // --no-wait prints the approval link and exits instead of blocking ~5 min.
      const { stdout } = await this.bee(['login', '--no-wait']);
      // Any bee.computer approval link (path not assumed); main only opens this origin.
      const url = /(https:\/\/(?:\w+\.)*bee\.computer\/\S+)/.exec(stdout)?.[1];
      this.authUrl = url;
      this.setStatus(
        'connecting',
        url ? 'Approve Bee access in your browser to finish.' : 'Waiting for you to approve Bee access…',
      );
      this.watchForApproval();
    } catch (err) {
      this.setStatus('error', this.explain(err));
    }
    return this.status();
  }

  stop(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.authWatch) clearInterval(this.authWatch);
    this.pollTimer = this.authWatch = null;
  }

  // --- internals ------------------------------------------------------------

  private messageFor(): string {
    if (this.lastMessage) return this.lastMessage; // an explicit message (esp. an error reason) wins
    switch (this.state) {
      case 'connected':
        return this.lastSyncedAt
          ? `Bee connected · synced ${new Date(this.lastSyncedAt).toLocaleTimeString()}`
          : 'Bee connected · syncing…';
      case 'connecting':
        return this.authUrl ? 'Approve Bee access in your browser to finish.' : 'Starting Bee…';
      case 'error':
        return 'Bee needs attention — click Connect Bee to retry.';
      default:
        return 'Bee not connected — click Connect Bee to start.';
    }
  }

  /** A coarse onboarding phase for the UI, derived from state (no new plumbing). */
  private phase(): 'setup' | 'approving' | 'active' | 'attention' {
    switch (this.state) {
      case 'connected':
        return 'active';
      case 'connecting':
        return 'approving';
      case 'error':
        return 'attention';
      default:
        return 'setup';
    }
  }

  private setStatus(state: BeeConnectionState, message?: string): void {
    this.state = state;
    this.lastMessage = message ?? null; // surface the specific reason to the UI
    if (state === 'connected') this.authUrl = undefined;
    this.emit('status', this.status());
  }

  private async isAuthenticated(): Promise<boolean> {
    try {
      await this.bee(['me', '--json']); // succeeds only when authenticated
      return true;
    } catch {
      return false;
    }
  }

  /** Poll `bee status` until the owner approves (or the ~5-min request expires). */
  private watchForApproval(): void {
    if (this.authWatch) clearInterval(this.authWatch);
    const started = Date.now();
    this.authWatch = setInterval(async () => {
      if (await this.isAuthenticated()) {
        clearInterval(this.authWatch!);
        this.authWatch = null;
        this.startPolling();
      } else if (Date.now() - started > 5 * 60_000) {
        clearInterval(this.authWatch!);
        this.authWatch = null;
        this.setStatus('error', 'Bee approval timed out.');
      }
    }, 4_000);
  }

  private startPolling(): void {
    this.setStatus('connected');
    const tick = async () => {
      await this.pollOnce();
      if (this.state === 'connected') this.pollTimer = setTimeout(tick, this.cfg.pollIntervalMs);
    };
    void tick();
  }

  private async pollOnce(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const cursor = await this.readCursor();
      const args = ['changed', '--json', ...(cursor ? ['--cursor', cursor] : [])];
      const changed = await this.beeJson<Record<string, unknown>>(args);

      const ids = this.conversationIds(changed);
      for (const id of ids) {
        const raw = await this.beeJson<RawConversation>(['conversations', 'get', id, '--json']);
        const payload = normalize(raw, id);
        if (payload) await this.forward(payload); // throws on non-2xx → cursor NOT saved
      }

      // Persist only after the whole batch forwarded successfully (exactly-once).
      const next = pickString(changed.next_cursor, (changed as { nextCursor?: string }).nextCursor);
      if (next) await this.writeCursor(next);

      this.lastSyncedAt = new Date().toISOString();
      this.setStatus('connected');
    } catch (err) {
      this.setStatus('error', this.explain(err));
    } finally {
      this.polling = false;
    }
  }

  private conversationIds(changed: Record<string, unknown>): string[] {
    const c = changed.conversations as unknown;
    const out: string[] = [];
    const collect = (arr: unknown) => {
      if (Array.isArray(arr))
        for (const x of arr) {
          const id = typeof x === 'string' ? x : pickString((x as RawConversation)?.id, (x as RawConversation)?.conversation_id);
          if (id) out.push(id);
        }
    };
    if (Array.isArray(c)) collect(c);
    else if (c && typeof c === 'object') {
      const obj = c as Record<string, unknown>;
      collect(obj.new);
      collect(obj.created);
      collect(obj.updated);
    }
    return [...new Set(out)];
  }

  private async forward(payload: ConversationPayload): Promise<void> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.cfg.webhookSecret) headers['x-webhook-secret'] = this.cfg.webhookSecret;
    const res = await fetch(`${this.cfg.backendUrl}/webhooks/bee/conversation`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`backend webhook → ${res.status}`);
  }

  private cursorPath(): string {
    return join(this.cfg.dataDir, 'bee-cursor');
  }
  private async readCursor(): Promise<string | null> {
    try {
      return (await readFile(this.cursorPath(), 'utf8')).trim() || null;
    } catch {
      return null;
    }
  }
  private async writeCursor(value: string): Promise<void> {
    await writeFile(this.cursorPath(), value, 'utf8');
  }

  private bee(args: string[]) {
    return exec(this.cfg.beeCommand ?? 'bee', [...(this.cfg.beeArgsPrefix ?? []), ...args], {
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, ...(this.cfg.beeEnv ?? {}) },
    });
  }
  private async beeJson<T>(args: string[]): Promise<T> {
    const { stdout } = await this.bee(args);
    return JSON.parse(stdout) as T;
  }

  private explain(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    // The Bee tooling ships inside the app, so this should be rare — keep it
    // human, never mention terminals or installs (Nicole never sees a CLI).
    if (msg.includes('ENOENT')) return "Couldn't start Bee on this device. Please restart the app or contact support.";
    return `Bee had a problem: ${msg.slice(0, 140)}`;
  }
}

// --- pure normalization (exported for tests) --------------------------------

export function normalize(raw: RawConversation, fallbackId: string): ConversationPayload | null {
  const bee_id = pickString(raw.id, raw.conversation_id, fallbackId);
  const start = pickString(raw.starts_at, raw.start, raw.start_time);
  const end = pickString(raw.ends_at, raw.end, raw.end_time);
  if (!bee_id || !start || !end) return null; // no time window → can't correlate; skip
  return {
    bee_id,
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(end).toISOString(),
    transcript: buildTranscript(raw),
  };
}

function buildTranscript(raw: RawConversation): string | undefined {
  const utterances =
    raw.utterances ?? (typeof raw.transcript === 'object' ? raw.transcript?.utterances : undefined);
  if (utterances?.length) {
    const lines = utterances
      .map((u) => {
        const who = pickString(u.speaker, u.speaker_name);
        const what = pickString(u.text, u.content);
        if (!what) return null;
        return who ? `${who}: ${what}` : what;
      })
      .filter((l): l is string => !!l);
    if (lines.length) return lines.join('\n');
  }
  if (typeof raw.transcript === 'string' && raw.transcript) return raw.transcript;
  if (raw.text) return raw.text;
  return undefined;
}

function pickString(...vals: unknown[]): string | undefined {
  return vals.find((v): v is string => typeof v === 'string' && v.length > 0);
}

export const courier = new Courier();
