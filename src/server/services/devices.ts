import type { DeviceStatus, Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http/errors";
import { paginated } from "@/lib/http/pagination";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { canOnProject, type Actor } from "@/lib/permissions/policies";
import { getMeasurement } from "@/lib/telemetry/measurements";
import type { ProjectConfiguration } from "@/lib/project-types/types";
import {
  createDeviceSchema,
  createSensorSchema,
  listDevicesSchema,
  rotateCredentialSchema,
  updateDeviceSchema,
  updateSensorSchema,
  type CreateDeviceInput,
  type CreateSensorInput,
  type UpdateDeviceInput,
} from "@/lib/validation/schemas";
import type { z } from "zod";
import { accessibleProjectIds, assertDeviceAction, assertProjectAction, assertSensorAction } from "./access";
import { recordAudit } from "./audit";

interface AuditCtx {
  requestId?: string;
  ip?: string;
}

export const DEVICE_SECRET_PREFIX = "icc_dev_";

/** Public device fields. Credential hashes are never selected for API responses. */
export const deviceSelect = {
  id: true,
  name: true,
  deviceIdentifier: true,
  projectId: true,
  hardwareModel: true,
  firmwareVersion: true,
  protocol: true,
  status: true,
  locationDescription: true,
  latitude: true,
  longitude: true,
  lastSeenAt: true,
  heartbeatTimeoutSec: true,
  configuration: true,
  createdAt: true,
  updatedAt: true,
  deactivatedAt: true,
  project: { select: { id: true, name: true, projectCode: true, projectType: { select: { key: true, name: true, isSensitive: true } } } },
  _count: { select: { sensors: true } },
} satisfies Prisma.DeviceSelect;

export function heartbeatTimeoutFor(device: { heartbeatTimeoutSec: number | null }) {
  return device.heartbeatTimeoutSec ?? env().DEVICE_HEARTBEAT_TIMEOUT_SECONDS;
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "device";
}

export async function listDevices(actor: Actor, query: z.input<typeof listDevicesSchema>) {
  const q = listDevicesSchema.parse(query);
  const ids = await accessibleProjectIds(actor);
  if (q.projectId && ids && !ids.includes(q.projectId)) throw notFound("Project");
  const where: Prisma.DeviceWhereInput = {
    ...(q.projectId ? { projectId: q.projectId } : ids ? { projectId: { in: ids } } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.protocol ? { protocol: q.protocol } : {}),
    ...(q.search
      ? { OR: [{ name: { contains: q.search, mode: "insensitive" } }, { deviceIdentifier: { contains: q.search, mode: "insensitive" } }, { locationDescription: { contains: q.search, mode: "insensitive" } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.device.findMany({ where, select: deviceSelect, orderBy: [{ status: "asc" }, { name: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.device.count({ where }),
  ]);
  return paginated(items, total, q);
}

export async function getDevice(actor: Actor, deviceId: string) {
  const { access } = await assertDeviceAction(actor, deviceId, "project.view");
  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: deviceSelect });
  if (!device) throw notFound("Device");
  const credentials = await prisma.deviceCredential.findMany({
    where: { deviceId },
    orderBy: { credentialVersion: "desc" },
    take: 10,
    select: { id: true, secretPrefix: true, credentialVersion: true, expiresAt: true, revokedAt: true, lastUsedAt: true, createdAt: true },
  });
  return {
    ...device,
    heartbeatTimeoutEffective: heartbeatTimeoutFor(device),
    credentials,
    access: {
      canUpdate: canOnProject(actor, "device.update", access),
      canConfigure: canOnProject(actor, "device.configure", access),
      canManageCredentials: canOnProject(actor, "device.credentials.manage", access),
      canManageSensors: canOnProject(actor, "sensor.manage", access),
      canDeactivate: canOnProject(actor, "device.deactivate", access),
    },
  };
}

async function issueCredential(tx: Tx, deviceId: string, expiresInDays?: number) {
  const last = await tx.deviceCredential.findFirst({ where: { deviceId }, orderBy: { credentialVersion: "desc" }, select: { credentialVersion: true } });
  const secret = DEVICE_SECRET_PREFIX + randomToken(32);
  const credential = await tx.deviceCredential.create({
    data: {
      deviceId,
      credentialHash: sha256Hex(secret),
      secretPrefix: secret.slice(0, DEVICE_SECRET_PREFIX.length + 6),
      credentialVersion: (last?.credentialVersion ?? 0) + 1,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400_000) : null,
    },
    select: { id: true, credentialVersion: true, secretPrefix: true, expiresAt: true, createdAt: true },
  });
  return { secret, credential };
}

/** Creates sensors for a device from the project's (per-project) sensor templates. */
export async function createTemplateSensors(tx: Tx, deviceId: string, configuration: ProjectConfiguration) {
  for (const s of configuration.sensors) {
    const m = getMeasurement(s.measurement);
    if (!m) continue;
    await tx.sensor.create({
      data: {
        deviceId,
        sensorKey: s.key,
        name: s.name,
        sensorType: s.measurement,
        unit: m.canonicalUnit,
        origin: s.origin ?? "MEASURED",
        description: s.description ?? "",
        minValue: s.minValue ?? null,
        maxValue: s.maxValue ?? null,
        configuration: m.stateLabels ? { stateLabels: m.stateLabels } : {},
      },
    });
  }
}

export async function createDevice(actor: Actor, input: CreateDeviceInput, ctx: AuditCtx = {}) {
  const data = createDeviceSchema.parse(input);
  await assertProjectAction(actor, data.projectId, "device.create");
  const project = await prisma.project.findUniqueOrThrow({ where: { id: data.projectId }, select: { projectCode: true, configuration: true } });
  const deviceIdentifier = data.deviceIdentifier ?? `${project.projectCode.toLowerCase()}-${slug(data.name)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  if (await prisma.device.findUnique({ where: { deviceIdentifier }, select: { id: true } })) {
    throw conflict("Device identifier is already registered", { field: "deviceIdentifier" });
  }

  return prisma.$transaction(async (tx) => {
    const device = await tx.device.create({
      data: {
        name: data.name,
        deviceIdentifier,
        projectId: data.projectId,
        hardwareModel: data.hardwareModel,
        firmwareVersion: data.firmwareVersion,
        protocol: data.protocol,
        status: "UNKNOWN", // never assumed online until a heartbeat arrives
        locationDescription: data.locationDescription,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        heartbeatTimeoutSec: data.heartbeatTimeoutSec ?? null,
        statusEvents: { create: { newStatus: "UNKNOWN", reason: "Device registered" } },
      },
      select: { id: true, deviceIdentifier: true, name: true, protocol: true },
    });
    if (data.createTemplateSensors) await createTemplateSensors(tx, device.id, project.configuration as unknown as ProjectConfiguration);
    // Simulated devices are driven by the worker and never authenticate, so they get no secret.
    const issued = data.protocol === "SIMULATED" ? null : await issueCredential(tx, device.id);
    await recordAudit({ actorId: actor.id, action: "device.register", resourceType: "device", resourceId: device.id, metadata: { projectId: data.projectId, protocol: data.protocol, deviceIdentifier }, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
    return { device, secret: issued?.secret ?? null, credential: issued?.credential ?? null };
  });
}

export async function updateDevice(actor: Actor, deviceId: string, input: UpdateDeviceInput, ctx: AuditCtx = {}) {
  const data = updateDeviceSchema.parse(input);
  const { device, access } = await assertDeviceAction(actor, deviceId, "device.configure");
  const canFullUpdate = canOnProject(actor, "device.update", access);
  const metadataFields = ["name", "projectId", "hardwareModel", "locationDescription", "latitude", "longitude", "active"] as const;
  if (!canFullUpdate && metadataFields.some((f) => data[f] !== undefined)) {
    throw forbidden("Engineers may only change device configuration, firmware version and heartbeat timeout");
  }
  if (data.projectId && data.projectId !== device.projectId) {
    await assertProjectAction(actor, data.projectId, "device.create");
  }

  const current = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });
  const update: Prisma.DeviceUncheckedUpdateInput = {};
  for (const key of ["name", "projectId", "hardwareModel", "firmwareVersion", "locationDescription", "latitude", "longitude", "heartbeatTimeoutSec"] as const) {
    if (data[key] !== undefined) (update as Record<string, unknown>)[key] = data[key];
  }
  if (data.configuration) update.configuration = { ...(current.configuration as object), ...data.configuration };

  let statusChange: { from: DeviceStatus; to: DeviceStatus; reason: string } | null = null;
  if (data.active === false && current.status !== "DISABLED") {
    statusChange = { from: current.status, to: "DISABLED", reason: `Deactivated by ${actor.id}` };
    update.status = "DISABLED";
    update.deactivatedAt = new Date();
  } else if (data.active === true && current.status === "DISABLED") {
    statusChange = { from: current.status, to: "UNKNOWN", reason: `Reactivated by ${actor.id}` };
    update.status = "UNKNOWN";
    update.deactivatedAt = null;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.device.update({ where: { id: deviceId }, data: update, select: deviceSelect });
    if (data.projectId && data.projectId !== device.projectId) {
      // Rules scoped to this device belong to the old project; detach them.
      await tx.alertRule.updateMany({ where: { deviceId, projectId: device.projectId }, data: { isEnabled: false } });
    }
    if (statusChange) {
      await tx.deviceStatusEvent.create({ data: { deviceId, previousStatus: statusChange.from, newStatus: statusChange.to, reason: statusChange.to === "DISABLED" ? "Deactivated by user" : "Reactivated by user" } });
      if (statusChange.to === "DISABLED") await tx.deviceCredential.updateMany({ where: { deviceId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await recordAudit(
      { actorId: actor.id, action: statusChange?.to === "DISABLED" ? "device.deactivate" : statusChange ? "device.reactivate" : "device.update", resourceType: "device", resourceId: deviceId, metadata: { fields: Object.keys(data) }, requestId: ctx.requestId, ipAddress: ctx.ip },
      tx,
    );
    return updated;
  });
}

export async function deleteDevice(actor: Actor, deviceId: string, ctx: AuditCtx = {}) {
  await assertDeviceAction(actor, deviceId, "device.deactivate");
  const hasReadings = await prisma.telemetryReading.findFirst({ where: { deviceId }, select: { id: true } });
  if (hasReadings) throw conflict("This device has telemetry history. Deactivate it instead so historical records are preserved.");
  await prisma.$transaction(async (tx) => {
    await tx.alert.updateMany({ where: { deviceId }, data: { deviceId: null } });
    await tx.sensor.deleteMany({ where: { deviceId } });
    await tx.device.delete({ where: { id: deviceId } });
    await recordAudit({ actorId: actor.id, action: "device.delete", resourceType: "device", resourceId: deviceId, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
  });
}

export async function rotateDeviceCredential(actor: Actor, deviceId: string, input: z.input<typeof rotateCredentialSchema>, ctx: AuditCtx = {}) {
  const opts = rotateCredentialSchema.parse(input);
  await assertDeviceAction(actor, deviceId, "device.credentials.manage");
  const device = await prisma.device.findUniqueOrThrow({ where: { id: deviceId }, select: { protocol: true, status: true } });
  if (device.protocol === "SIMULATED") throw badRequest("Simulated devices do not use credentials");
  if (device.status === "DISABLED") throw badRequest("Reactivate the device before issuing a credential");

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    // Old credentials stop working immediately, or after an optional grace period for field updates.
    const graceEnd = new Date(now.getTime() + opts.graceMinutes * 60_000);
    if (opts.graceMinutes > 0) {
      await tx.deviceCredential.updateMany({ where: { deviceId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: graceEnd } }] }, data: { expiresAt: graceEnd } });
    } else {
      await tx.deviceCredential.updateMany({ where: { deviceId, revokedAt: null }, data: { revokedAt: now } });
    }
    const issued = await issueCredential(tx, deviceId, opts.expiresInDays);
    await recordAudit({ actorId: actor.id, action: "device.credential.rotate", resourceType: "device", resourceId: deviceId, metadata: { version: issued.credential.credentialVersion, graceMinutes: opts.graceMinutes }, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
    return issued;
  });
}

export async function revokeDeviceCredentials(actor: Actor, deviceId: string, ctx: AuditCtx = {}) {
  await assertDeviceAction(actor, deviceId, "device.credentials.manage");
  return prisma.$transaction(async (tx) => {
    const res = await tx.deviceCredential.updateMany({ where: { deviceId, revokedAt: null }, data: { revokedAt: new Date() } });
    await recordAudit({ actorId: actor.id, action: "device.credential.revoke", resourceType: "device", resourceId: deviceId, metadata: { revoked: res.count }, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
    return { revoked: res.count };
  });
}

export async function deviceStatusHistory(actor: Actor, deviceId: string, limit = 50) {
  await assertDeviceAction(actor, deviceId, "project.view");
  return prisma.deviceStatusEvent.findMany({ where: { deviceId }, orderBy: { occurredAt: "desc" }, take: Math.min(limit, 200) });
}

// ── Sensors ──────────────────────────────────────────────

export const sensorSelect = {
  id: true,
  deviceId: true,
  sensorKey: true,
  name: true,
  sensorType: true,
  unit: true,
  origin: true,
  description: true,
  configuration: true,
  minValue: true,
  maxValue: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SensorSelect;

export async function listSensorsForDevice(actor: Actor, deviceId: string) {
  await assertDeviceAction(actor, deviceId, "project.view");
  return prisma.sensor.findMany({ where: { deviceId }, select: sensorSelect, orderBy: { name: "asc" } });
}

export async function listSensors(actor: Actor, query: { projectId?: string; sensorType?: string; search?: string; page?: number; pageSize?: number }) {
  const ids = await accessibleProjectIds(actor);
  if (query.projectId && ids && !ids.includes(query.projectId)) throw notFound("Project");
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const where: Prisma.SensorWhereInput = {
    device: query.projectId ? { projectId: query.projectId } : ids ? { projectId: { in: ids } } : {},
    ...(query.sensorType ? { sensorType: query.sensorType } : {}),
    ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { sensorKey: { contains: query.search, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.sensor.findMany({
      where,
      select: { ...sensorSelect, device: { select: { id: true, name: true, status: true, protocol: true, project: { select: { id: true, name: true } } } } },
      orderBy: [{ device: { name: "asc" } }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sensor.count({ where }),
  ]);
  return paginated(items, total, { page, pageSize });
}

export async function getSensor(actor: Actor, sensorId: string) {
  await assertSensorAction(actor, sensorId, "project.view");
  return prisma.sensor.findUniqueOrThrow({ where: { id: sensorId }, select: { ...sensorSelect, device: { select: { id: true, name: true, projectId: true, protocol: true } } } });
}

export async function createSensor(actor: Actor, deviceId: string, input: CreateSensorInput, ctx: AuditCtx = {}) {
  const data = createSensorSchema.parse(input);
  await assertDeviceAction(actor, deviceId, "sensor.manage");
  const m = getMeasurement(data.sensorType)!;
  if (await prisma.sensor.findUnique({ where: { deviceId_sensorKey: { deviceId, sensorKey: data.sensorKey } }, select: { id: true } })) {
    throw conflict("A sensor with this key already exists on the device", { field: "sensorKey" });
  }
  return prisma.$transaction(async (tx) => {
    const sensor = await tx.sensor.create({
      data: {
        deviceId,
        sensorKey: data.sensorKey,
        name: data.name,
        sensorType: data.sensorType,
        unit: m.canonicalUnit, // always stored in canonical units
        origin: data.origin,
        description: data.description,
        minValue: data.minValue ?? null,
        maxValue: data.maxValue ?? null,
        configuration: m.stateLabels ? { stateLabels: m.stateLabels } : {},
      },
      select: sensorSelect,
    });
    await recordAudit({ actorId: actor.id, action: "sensor.create", resourceType: "sensor", resourceId: sensor.id, metadata: { deviceId, sensorKey: data.sensorKey, sensorType: data.sensorType }, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
    return sensor;
  });
}

export async function updateSensor(actor: Actor, sensorId: string, input: z.input<typeof updateSensorSchema>, ctx: AuditCtx = {}) {
  const data = updateSensorSchema.parse(input);
  await assertSensorAction(actor, sensorId, "sensor.manage");
  const current = await prisma.sensor.findUniqueOrThrow({ where: { id: sensorId } });
  const min = data.minValue !== undefined ? data.minValue : current.minValue?.toNumber() ?? null;
  const max = data.maxValue !== undefined ? data.maxValue : current.maxValue?.toNumber() ?? null;
  if (min !== null && max !== null && max <= min) throw badRequest("Maximum must be greater than minimum", { field: "maxValue" });
  return prisma.$transaction(async (tx) => {
    const sensor = await tx.sensor.update({ where: { id: sensorId }, data, select: sensorSelect });
    await recordAudit({ actorId: actor.id, action: "sensor.update", resourceType: "sensor", resourceId: sensorId, metadata: { ...data }, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
    return sensor;
  });
}

export async function deleteSensor(actor: Actor, sensorId: string, ctx: AuditCtx = {}) {
  await assertSensorAction(actor, sensorId, "sensor.manage");
  const hasReadings = await prisma.telemetryReading.findFirst({ where: { sensorId }, select: { id: true } });
  if (hasReadings) throw conflict("This sensor has telemetry history. Disable it instead so historical records are preserved.");
  await prisma.$transaction(async (tx) => {
    await tx.alert.updateMany({ where: { sensorId }, data: { sensorId: null } });
    await tx.sensor.delete({ where: { id: sensorId } });
    await recordAudit({ actorId: actor.id, action: "sensor.delete", resourceType: "sensor", resourceId: sensorId, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
  });
}
