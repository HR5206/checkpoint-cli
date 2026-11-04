#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles, projectRoot, requireFile } from "./files.mts";
import { fingerprint, history, readSnapshot, saveSnapshot, snapshotId } from "./snapshot.mts";
import { compare } from "./compare.mts";
import { restore } from "./restore.mts";

const help = [
  "Checkpoint — local snapshots for project folders", "",
  "node src/checkpoint.mts scan <folder>",
  'node src/checkpoint.mts save <folder> ["note"]',
  "node src/checkpoint.mts history [folder]",
  "node src/checkpoint.mts compare [folder] <old-id> <new-id>",
  "node src/checkpoint.mts restore [folder] <id> --to <new-folder>", "",
  "If omitted, [folder] means the current directory."
].join("\n");

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(help);
    return;
  }

  if (command === "scan" || command === "save") {
    if (!args[0] || (command === "scan" && args.length !== 1)) throw new Error(help);
    const root = projectRoot(args[0]);
    const files = listFiles(root).sort();
    if (command === "save") {
      saveSnapshot(root, files, args.slice(1).join(" "));
      return;
    }
    for (const file of files) {
      const path = join(root, file);
      requireFile(path);
      const hash = fingerprint(readFileSync(path));
      console.log(hash.slice(0, 12) + "  " + file);
    }
    console.log("Files scanned:", files.length);
    return;
  }

  if (command === "history") {
    if (args.length > 1) throw new Error(help);
    const items = history(projectRoot(args[0] ?? "."));
    if (!items.length) console.log("No completed snapshots yet.");
    for (const item of items) {
      console.log("#" + item.id + " | " + item.createdAt + " | files: " + item.files.length + " | " + (item.note || "(no note)"));
    }
    return;
  }

  if (command === "compare") {
    if (args.length !== 2 && args.length !== 3) throw new Error(help);
    const root = projectRoot(args.length === 3 ? args[0] : ".");
    const [oldId, newId] = args.slice(-2).map(snapshotId);
    const changes = compare(readSnapshot(root, oldId), readSnapshot(root, newId));
    console.log("Compare #" + oldId + " -> #" + newId);
    if (!changes.length) console.log("No file changes.");
    for (const change of changes) console.log(change.kind.padEnd(7) + "  " + change.path);
    return;
  }

  if (command === "restore") {
    if (args.length !== 3 && args.length !== 4) throw new Error(help);
    const root = projectRoot(args.length === 4 ? args[0] : ".");
    const [number, flag, destination] = args.slice(-3);
    if (flag !== "--to" || !destination) throw new Error(help);
    restore(root, snapshotId(number), destination);
    return;
  }

  throw new Error("Unknown command: " + command + "\n" + help);
}

try {
  main();
} catch (error) {
  console.error("checkpoint:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
