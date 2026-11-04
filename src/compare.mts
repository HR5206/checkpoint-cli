import type { Snapshot } from "./snapshot.mts";

type Change = { kind: "added" | "changed" | "deleted"; path: string };

export function compare(before: Snapshot, after: Snapshot): Change[] {
  const oldFiles = new Map(before.files.map(file => [file.path, file.hash] as const));
  const newFiles = new Map(after.files.map(file => [file.path, file.hash] as const));
  const paths = new Set([...oldFiles.keys(), ...newFiles.keys()]);
  const changes: Change[] = [];

  // Compare the two saved inventories; the working folder may have changed again.
  for (const path of [...paths].sort()) {
    if (!oldFiles.has(path)) changes.push({ kind: "added", path });
    else if (!newFiles.has(path)) changes.push({ kind: "deleted", path });
    else if (oldFiles.get(path) !== newFiles.get(path)) changes.push({ kind: "changed", path });
  }
  return changes;
}
