import {
  lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { inside, requireDirectory } from "./files.mts";
import { readObject, readSnapshot } from "./snapshot.mts";

export function restore(root: string, id: number, destination: string) {
  const snapshot = readSnapshot(root, id);
  const requested = resolve(destination);
  // Resolve the parent first: a shortcut to the project is still inside it.
  const parent = realpathSync(dirname(requested));
  requireDirectory(parent);
  const target = join(parent, basename(requested));
  if (inside(root, target)) throw new Error("Choose a new folder outside the tracked project.");
  if (lstatSync(target, { throwIfNoEntry: false })) throw new Error("Destination already exists: " + target);

  const staging = mkdtempSync(join(parent, ".checkpoint-restore-"));
  let reserved = false;
  try {
    for (const file of snapshot.files) {
      const bytes = readObject(root, file);
      const path = join(staging, file.path);
      if (!inside(staging, path)) throw new Error("Path leaves the restore folder: " + file.path);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes, { flag: "wx" });
    }

    // The bytes checked out. Claim a new directory; never reuse an empty one.
    mkdirSync(target);
    reserved = true;
    for (const name of readdirSync(staging)) renameSync(join(staging, name), join(target, name));
  } catch (error) {
    if (reserved) rmSync(target, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  console.log("Restored #" + id + " | verified files: " + snapshot.files.length + " | " + target);
}
