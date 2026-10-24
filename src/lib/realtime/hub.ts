import { Client } from "pg";
import { logger } from "@/lib/logging/logger";
import { REALTIME_CHANNEL, type RealtimeEvent } from "./events";

type Listener = (event: RealtimeEvent) => void;

/**
 * One LISTEN connection per server process, fanned out to every SSE subscriber.
 * Reconnects with bounded exponential backoff if the database connection drops.
 */
class RealtimeHub {
  private client: Client | null = null;
  private listeners = new Set<Listener>();
  private connecting: Promise<void> | null = null;
  private retryMs = 1000;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.ensureConnected();
    return () => this.listeners.delete(listener);
  }

  get connected() {
    return this.client !== null;
  }

  private async ensureConnected() {
    if (this.client || this.connecting) return this.connecting ?? undefined;
    this.connecting = (async () => {
      const url = new URL(process.env.DATABASE_URL!);
      url.searchParams.delete("schema");
      const client = new Client({ connectionString: url.toString() });
      try {
        await client.connect();
        await client.query(`LISTEN ${REALTIME_CHANNEL}`);
        client.on("notification", (msg) => {
          if (!msg.payload) return;
          try {
            const event = JSON.parse(msg.payload) as RealtimeEvent;
            for (const l of this.listeners) l(event);
          } catch (err) {
            logger.warn({ err }, "invalid realtime payload");
          }
        });
        client.on("error", (err) => {
          logger.warn({ err }, "realtime LISTEN connection error");
          this.reset();
        });
        client.on("end", () => this.reset());
        this.client = client;
        this.retryMs = 1000;
      } catch (err) {
        logger.warn({ err, retryMs: this.retryMs }, "realtime LISTEN connection failed");
        await client.end().catch(() => {});
        setTimeout(() => void this.ensureConnected(), this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, 30_000);
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  private reset() {
    const c = this.client;
    this.client = null;
    c?.end().catch(() => {});
    if (this.listeners.size > 0) setTimeout(() => void this.ensureConnected(), this.retryMs);
  }
}

const g = globalThis as unknown as { realtimeHub?: RealtimeHub };
export const realtimeHub = g.realtimeHub ?? (g.realtimeHub = new RealtimeHub());
