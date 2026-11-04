import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync,
  rmSync, statSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSnapshot } from "../src/snapshot.mts";

const cli = fileURLToPath(new URL("../src/checkpoint.mts", import.meta.url));
const lab = mkdtempSync(join(tmpdir(), "checkpoint-demo-"));
const project = join(lab, "portfolio");

function run(...args: string[]) {
  console.log("\n> checkpoint " + args.map(word => word.includes(" ") ? '"' + word + '"' : word).join(" "));
  execFileSync(process.execPath, [cli, ...args], { cwd: lab, stdio: "inherit" });
}

try {
  const html = "<h1>Workstation 98</h1>\n";
  const original = "body { color: navy; }\n";
  const edited = "body { color: maroon; }\n";
  mkdirSync(join(project, "styles"), { recursive: true });
  writeFileSync(join(project, "index.html"), html);
  writeFileSync(join(project, "styles", "site.css"), original);

  console.log("Checkpoint demo | uses a temporary portfolio folder");
  run("scan", "portfolio");
  run("save", "portfolio", "Original palette");
  writeFileSync(join(project, "styles", "site.css"), edited);
  run("save", "portfolio", "Try maroon");
  run("save", "portfolio", "Same contents, different note");

  renameSync(join(project, "index.html"), join(project, "home.html"));
  run("save", "portfolio", "Rename the homepage");
  run("history", "portfolio");
  run("compare", "portfolio", "1", "4");
  run("restore", "portfolio", "1", "--to", "recovered");

  assert.equal(readFileSync(join(lab, "recovered", "styles", "site.css"), "utf8"), original);
  assert.equal(readFileSync(join(lab, "recovered", "index.html"), "utf8"), html);
  assert.equal(readFileSync(join(project, "styles", "site.css"), "utf8"), edited);
  assert.equal(existsSync(join(project, "index.html")), false);
  assert.equal(readFileSync(join(project, "home.html"), "utf8"), html);

  const files = [1, 2, 3, 4].flatMap(id => readSnapshot(project, id).files);
  const objects = join(project, ".checkpoint", "objects");
  const names = readdirSync(objects);
  const logical = files.reduce((sum, file) => sum + file.bytes, 0);
  const stored = names.reduce((sum, name) => sum + statSync(join(objects, name)).size, 0);
  console.log("\nVerified: the original HTML and navy CSS were recovered; the working files still have the edits.");
  console.log("File entries across 4 snapshots: " + files.length + " | distinct objects: " + names.length);
  console.log("Content bytes across snapshots: " + logical + " | unique content bytes: " + stored + " (excludes metadata)");
} finally {
  rmSync(lab, { recursive: true, force: true });
}
