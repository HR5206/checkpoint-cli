import { createHash, randomUUID } from "node:crypto";
import {
  lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync
} from "node:fs";
import { join } from "node:path";
import { checkFilePath, requireDirectory, requireFile } from "./files.mts";

export type SavedFile = { path: string; hash: string; bytes: number };
export type Snapshot = { id: number; createdAt: string; note: string; files: SavedFile[] };

export function fingerprint(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function publishFile(path: string, data: string | Uint8Array) {
  // Write beside the final file so readers never pick up half a manifest.
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    writeFileSync(temporary, data, { flag: "wx" });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function makeDirectory(path: string) {
  mkdirSync(path, { recursive: true });
  requireDirectory(path);
}

function snapshotDirectories(root: string) {
  return { store: join(root, ".checkpoint"), objects: join(root, ".checkpoint", "objects"),
    snapshots: join(root, ".checkpoint", "snapshots") };
}

export function saveSnapshot(root: string, paths: string[], note: string): Snapshot {
  const { store, objects, snapshots } = snapshotDirectories(root);
  makeDirectory(store);
  makeDirectory(objects);
  makeDirectory(snapshots);

  const files: SavedFile[] = [];
  let added = 0;
  for (const path of paths) {
    checkFilePath(path);
    const source = join(root, path);
    requireFile(source);
    const bytes = readFileSync(source);
    const hash = fingerprint(bytes);
    const object = join(objects, hash);

    if (!lstatSync(object, { throwIfNoEntry: false })) {
      // Use the same bytes we hashed: the working file could change on disk.
      publishFile(object, bytes);
      added++;
    } else {
      requireFile(object);
      if (!readFileSync(object).equals(bytes)) {
        throw new Error("Stored bytes do not match for " + path + ". Save stopped.");
      }
    }
    files.push({ path, hash, bytes: bytes.length });
  }

  let id = 1;
  while (lstatSync(join(snapshots, String(id)), { throwIfNoEntry: false })) id++;
  const directory = join(snapshots, String(id));
  mkdirSync(directory);
  const manifest: Snapshot = { id, createdAt: new Date().toISOString(), note, files };
  // A numbered folder alone doesn't mean the save finished.
  publishFile(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("Saved #" + id + " | files: " + files.length + " | new objects: " + added);
  return manifest;
}

export function snapshotId(value: string): number {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) {
    throw new Error("Snapshot ID must be a positive whole number: " + value);
  }
  return id;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseManifest(text: string, id: number): Snapshot {
  const raw: unknown = JSON.parse(text);
  if (!record(raw) || raw.id !== id || typeof raw.note !== "string" ||
      typeof raw.createdAt !== "string" || !Number.isFinite(Date.parse(raw.createdAt)) ||
      !Array.isArray(raw.files)) {
    throw new Error("Unexpected manifest fields");
  }

  const names = new Set<string>();
  const files: SavedFile[] = [];
  for (const item of raw.files) {
    if (!record(item) || typeof item.path !== "string" || typeof item.hash !== "string" ||
        !/^[0-9a-f]{64}$/.test(item.hash) || typeof item.bytes !== "number" ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 0) {
      throw new Error("Invalid file entry");
    }
    checkFilePath(item.path);
    if (names.has(item.path)) throw new Error("Duplicate path: " + item.path);
    names.add(item.path);
    files.push({ path: item.path, hash: item.hash, bytes: item.bytes });
  }
  return { id, createdAt: raw.createdAt, note: raw.note, files };
}

export function readSnapshot(root: string, id: number): Snapshot {
  const { store, snapshots } = snapshotDirectories(root);
  const directory = join(snapshots, String(id));
  const file = join(directory, "manifest.json");
  if (!lstatSync(store, { throwIfNoEntry: false })) throw new Error("No snapshots in " + root);
  requireDirectory(store);
  requireDirectory(snapshots);
  if (!lstatSync(directory, { throwIfNoEntry: false })) throw new Error("Snapshot #" + id + " does not exist.");
  requireDirectory(directory);
  if (!lstatSync(file, { throwIfNoEntry: false })) throw new Error("Snapshot #" + id + " is incomplete.");
  requireFile(file);
  try {
    return parseManifest(readFileSync(file, "utf8"), id);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    throw new Error("Cannot read snapshot #" + id + ": " + why);
  }
}

export function history(root: string): Snapshot[] {
  const { store, snapshots } = snapshotDirectories(root);
  if (!lstatSync(store, { throwIfNoEntry: false })) return [];
  requireDirectory(store);
  if (!lstatSync(snapshots, { throwIfNoEntry: false })) return [];
  requireDirectory(snapshots);
  const ids = readdirSync(snapshots, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^[1-9]\d*$/.test(entry.name))
    .filter(entry => lstatSync(join(snapshots, entry.name, "manifest.json"), { throwIfNoEntry: false }))
    .map(entry => snapshotId(entry.name)).sort((a, b) => b - a);
  return ids.map(id => readSnapshot(root, id));
}

export function readObject(root: string, file: SavedFile): Buffer {
  const { store, objects } = snapshotDirectories(root);
  requireDirectory(store);
  requireDirectory(objects);
  const path = join(objects, file.hash);
  requireFile(path);
  const bytes = readFileSync(path);
  if (bytes.length !== file.bytes || fingerprint(bytes) !== file.hash) {
    throw new Error("Integrity check failed for " + file.path);
  }
  return bytes;
}
