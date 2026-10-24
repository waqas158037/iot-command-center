import type { SensorTemplate, SimulationProfile } from "@/lib/project-types/types";

/**
 * Deterministic sensor value generator. The same seed and sequence of timestamps always yields
 * the same values, which makes simulator output reproducible for tests and demos.
 */

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (v: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
const round = (v: number, dp = 4) => Math.round(v * 10 ** dp) / 10 ** dp;

export class SensorSimulator {
  private rand: () => number;
  private value: number | null;
  private lastT: number | null = null;
  private phase: number;

  constructor(private profile: SimulationProfile, seed: string, initialValue?: number | null) {
    this.rand = mulberry32(hashSeed(seed));
    this.phase = this.rand() * Math.PI * 2;
    this.value = initialValue ?? null;
  }

  /** Produces the value at time `t`. `abnormal` pushes the sensor into its configured fault condition. */
  next(t: Date, abnormal = false): number {
    const p = this.profile;
    const hoursSinceLast = this.lastT === null ? 0 : Math.max(0, (t.getTime() - this.lastT) / 3600_000);
    this.lastT = t.getTime();
    let v: number;
    switch (p.mode) {
      case "wave": {
        const angle = (2 * Math.PI * (t.getTime() / 60_000)) / p.periodMinutes + this.phase;
        v = abnormal ? p.abnormal + gaussian(this.rand) * p.noise : p.base + p.amplitude * Math.sin(angle) + gaussian(this.rand) * p.noise;
        v = clamp(v, p.min, p.max);
        break;
      }
      case "walk": {
        const current = this.value ?? p.start;
        v = abnormal ? p.abnormal + gaussian(this.rand) * p.step * 0.2 : clamp(current + gaussian(this.rand) * p.step, p.min, p.max);
        // Recover gradually after an abnormal episode instead of jumping back.
        if (!abnormal && (current < p.min || current > p.max)) v = current + (p.start - current) * 0.3;
        break;
      }
      case "counter": {
        const current = this.value ?? p.start;
        const rate = abnormal ? p.abnormalRatePerHour : p.ratePerHour;
        v = current + Math.max(0, rate * hoursSinceLast * (0.7 + this.rand() * 0.6));
        break;
      }
      case "drain": {
        const current = this.value ?? p.start;
        v = abnormal ? p.abnormal : current - p.perHour * hoursSinceLast * (0.8 + this.rand() * 0.4);
        if (!abnormal && v <= p.min) v = p.start; // simulated recharge / refill
        if (!abnormal && current <= p.abnormal + 0.01 && this.value !== null) v = p.start;
        v = clamp(v, 0, 100_000);
        break;
      }
      case "state": {
        if (abnormal) {
          v = p.abnormal;
          break;
        }
        const r = this.rand();
        let acc = 0;
        v = p.states[p.states.length - 1];
        for (let i = 0; i < p.states.length; i++) {
          acc += p.weights[i] ?? 0;
          if (r <= acc) {
            v = p.states[i];
            break;
          }
        }
        break;
      }
      case "event":
        v = this.rand() < (abnormal ? p.abnormalProbability : p.probability) ? 1 : 0;
        break;
    }
    this.value = v;
    return round(v);
  }
}

export type Scenario = "NORMAL" | "ABNORMAL" | "MIXED" | "DISCONNECT" | "SENSOR_DROPOUT";

/** For MIXED, roughly one tick in eight per device is abnormal, chosen deterministically. */
export function isAbnormalTick(scenario: Scenario, deviceId: string, tickIndex: number): boolean {
  if (scenario === "ABNORMAL") return true;
  if (scenario !== "MIXED") return false;
  return mulberry32(hashSeed(`${deviceId}:${tickIndex}`))() < 0.125;
}

export function buildDeviceSimulators(deviceKey: string, sensors: Pick<SensorTemplate, "key" | "simulation">[], initial: Record<string, number | undefined> = {}) {
  return new Map(sensors.map((s) => [s.key, new SensorSimulator(s.simulation, `${deviceKey}:${s.key}`, initial[s.key])]));
}
