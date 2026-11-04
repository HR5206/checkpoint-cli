import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync,
  rmSync, symlinkSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { Snapshot } from "../src/snapshot.mts";

const cli = fileURLToPath(new URL("../src/checkpoint.mts", import.meta.url));

function fixture(t: TestContext) {
  const lab = mkdtempSync(join(tmpdir(), "checkpoint-test-"));
  t.after(() => rmSync(lab, { recursive: true, force: true }));
  const project = join(lab, "my project");
  mkdirSync(join(project, "styles"), { recursive: true });
  writeFileSync(join(project, "index.html"), "<h1>Hello</h1>\n");
  writeFileSync(join(project, "styles", "site.css"), "body { color: navy; }\n");
  const store = join(project, ".checkpoint");

  function exec(args: string[], cwd = lab, ok = true) {
    const p = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
    if (p.error) throw p.error;
    assert.equal(p.status, ok ? 0 : 1, p.stdout + p.stderr);
    return ok ? p.stdout : p.stderr;
  }

  function manifest(id: number): Snapshot {
    return JSON.parse(readFileSync(join(store, "snapshots", String(id), "manifest.json"), "utf8"));
  }
  const save = (note = "test") => exec(["save", project, note]);
  return { lab, project, store, exec, manifest, save };
}

test("scan finds nested files, skips generated directories, and writes nothing", t => {
  const f = fixture(t);
  for (const folder of [".git", "node_modules", ".next"]) {
    mkdirSync(join(f.project, folder));
    writeFileSync(join(f.project, folder, "generated.txt"), "skip");
  }
  const output = f.exec(["scan", f.project]);
  assert.match(output, /[a-f0-9]{12}  styles\/site\.css/);
  assert.match(output, /Files scanned: 2/);
  assert.doesNotMatch(output, /generated/);
  assert.equal(existsSync(f.store), false);
});

test("saving unchanged content reuses objects without rewriting the first manifest", t => {
  const f = fixture(t);
  assert.match(f.save("baseline"), /Saved #1.*new objects: 2/);
  const first = readFileSync(join(f.store, "snapshots", "1", "manifest.json"));
  writeFileSync(join(f.project, "styles", "site.css"), "body { color: maroon; }\n");
  assert.match(f.save("maroon"), /Saved #2.*new objects: 1/);
  assert.match(f.save("same contents"), /Saved #3.*new objects: 0/);
  assert.deepEqual(readFileSync(join(f.store, "snapshots", "1", "manifest.json")), first);
  assert.equal(readdirSync(join(f.store, "objects")).length, 3);
  assert.equal(f.manifest(3).note, "same contents");
  assert.match(f.exec(["scan", f.project]), /Files scanned: 2/);
});

test("equal bytes at different paths, including an empty file, round-trip correctly", t => {
  const f = fixture(t);
  const binary = Buffer.from([0, 255, 10, 128, 0, 42]);
  writeFileSync(join(f.project, "first.bin"), binary);
  writeFileSync(join(f.project, "second.bin"), binary);
  writeFileSync(join(f.project, "empty.txt"), "");
  assert.match(f.save(), /files: 5.*new objects: 4/);
  f.exec(["restore", f.project, "1", "--to", "output"]);
  for (const path of ["first.bin", "second.bin"]) assert.deepEqual(readFileSync(join(f.lab, "output", path)), binary);
  assert.equal(readFileSync(join(f.lab, "output", "empty.txt")).length, 0);
});

test("history sorts IDs numerically and ignores unfinished snapshot directories", t => {
  const f = fixture(t);
  assert.match(f.exec(["history", f.project]), /No completed snapshots/);
  f.save("the first note");
  mkdirSync(join(f.store, "snapshots", "2"));
  writeFileSync(join(f.store, "snapshots", "2", "manifest.tmp"), "partial");
  // Use enough snapshots to prove that #10 comes before #9 in history.
  for (let id = 3; id <= 10; id++) f.save("iteration " + id);
  const history = f.exec(["history"], f.project).trim().split("\n");
  assert.deepEqual(history.map(line => Number(line.match(/^#(\d+)/)?.[1])), [10, 9, 8, 7, 6, 5, 4, 3, 1]);
  assert.match(history.at(-1) ?? "", /the first note/);
  assert.match(f.exec(["compare", f.project, "1", "2"], f.lab, false), /incomplete/);
});

test("compare reports additions, changes and deletions against the selected snapshots", t => {
  const f = fixture(t);
  f.save();
  renameSync(join(f.project, "index.html"), join(f.project, "home.html"));
  writeFileSync(join(f.project, "styles", "site.css"), "body { color: maroon; }\n");
  f.save();
  writeFileSync(join(f.project, "only-in-working-folder.txt"), "not saved");
  const output = f.exec(["compare", "1", "2"], f.project);
  assert.match(output, /added\s+home\.html/);
  assert.match(output, /deleted\s+index\.html/);
  assert.match(output, /changed\s+styles\/site\.css/);
  assert.doesNotMatch(output, /only-in-working-folder/);
  assert.match(f.exec(["compare", f.project, "1", "1"]), /No file changes/);
  assert.match(f.exec(["compare", f.project, "2", "1"]), /added\s+index\.html/);
});

test("restore recreates an old version and leaves the current project unchanged", t => {
  const f = fixture(t);
  const original = readFileSync(join(f.project, "styles", "site.css"));
  f.save();
  rmSync(join(f.project, "index.html"));
  writeFileSync(join(f.project, "styles", "site.css"), "new bytes");
  f.save();
  f.exec(["restore", "1", "--to", "../recovered"], f.project);
  assert.deepEqual(readFileSync(join(f.lab, "recovered", "styles", "site.css")), original);
  assert.equal(readFileSync(join(f.lab, "recovered", "index.html"), "utf8"), "<h1>Hello</h1>\n");
  assert.equal(existsSync(join(f.project, "index.html")), false);
  assert.equal(readFileSync(join(f.project, "styles", "site.css"), "utf8"), "new bytes");
});

test("restore refuses both an existing destination and a destination inside the project", t => {
  const f = fixture(t);
  f.save();
  const out = join(f.lab, "occupied");
  mkdirSync(out);
  assert.match(f.exec(["restore", f.project, "1", "--to", out], f.lab, false), /already exists/);
  writeFileSync(join(out, "keep.txt"), "mine");
  f.exec(["restore", f.project, "1", "--to", out], f.lab, false);
  assert.equal(readFileSync(join(out, "keep.txt"), "utf8"), "mine");
  assert.match(f.exec(["restore", f.project, "1", "--to", join(f.project, "new")], f.lab, false), /outside/);
  assert.equal(existsSync(join(f.project, "new")), false);
});

test("a damaged object prevents both reuse and recovery; no output folder is published", t => {
  const f = fixture(t);
  f.save();
  const file = f.manifest(1).files.find(item => item.path === "styles/site.css")!;
  writeFileSync(join(f.store, "objects", file.hash), Buffer.alloc(file.bytes, 65));
  assert.match(f.exec(["save", f.project], f.lab, false), /Stored bytes do not match/);
  assert.equal(existsSync(join(f.store, "snapshots", "2")), false);
  assert.match(f.exec(["restore", f.project, "1", "--to", "recovered"], f.lab, false), /Integrity check failed/);
  assert.equal(existsSync(join(f.lab, "recovered")), false);
  assert.equal(readdirSync(f.lab).some(name => name.startsWith(".checkpoint-restore-")), false);
});

test("an unsafe manifest path cannot escape into a neighbouring file", t => {
  const f = fixture(t);
  f.save();
  const original = f.manifest(1);
  const file = join(f.store, "snapshots", "1", "manifest.json");
  for (const path of ["../outside.txt", "/absolute.txt", "C:\\outside.txt", ".checkpoint/objects/bad"]) {
    const altered = { ...original, files: [{ ...original.files[0], path }] };
    writeFileSync(file, JSON.stringify(altered));
    assert.match(f.exec(["restore", f.project, "1", "--to", "recovered"], f.lab, false), /Unsafe or unsupported/);
  }
  assert.equal(existsSync(join(f.lab, "outside.txt")), false);
  assert.equal(existsSync(join(f.lab, "recovered")), false);
});

test("invalid IDs, missing snapshots, missing source folders and malformed JSON fail clearly", t => {
  const f = fixture(t);
  f.save();
  assert.match(f.exec(["compare", f.project, "01", "1"], f.lab, false), /positive whole number/);
  assert.match(f.exec(["restore", f.project, "9", "--to", "out"], f.lab, false), /does not exist/);
  f.exec(["save", "missing project"], f.lab, false);
  assert.equal(existsSync(join(f.lab, "missing project")), false);
  writeFileSync(join(f.store, "snapshots", "1", "manifest.json"), "{broken");
  assert.match(f.exec(["history", f.project], f.lab, false), /Cannot read snapshot #1/);
});

test("empty project can be saved and restored into a new empty directory", t => {
  const f = fixture(t);
  const empty = join(f.lab, "empty");
  mkdirSync(empty);
  assert.match(f.exec(["save", empty, "empty project"]), /files: 0.*new objects: 0/);
  f.exec(["restore", empty, "1", "--to", "empty-recovered"]);
  assert.deepEqual(readdirSync(join(f.lab, "empty-recovered")), []);
});

test("symbolic links inside the work tree are skipped", t => {
  const f = fixture(t);
  const other = join(f.lab, "private.txt");
  writeFileSync(other, "outside the project");
  try {
    symlinkSync(other, join(f.project, "shortcut.txt"), "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      t.skip("This OS does not allow creating the test symlink");
      return;
    }
    throw error;
  }
  f.save();
  assert.equal(f.manifest(1).files.some(file => file.path === "shortcut.txt"), false);
});
