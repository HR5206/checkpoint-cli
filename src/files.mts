import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

const ignored = new Set([".git", ".checkpoint", "node_modules", ".next"]);

export function projectRoot(folder: string): string {
  const root = realpathSync(folder);
  if (!statSync(root).isDirectory()) throw new Error("Not a folder: " + folder);
  return root;
}

export function listFiles(folder: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const name = prefix + entry.name;
    if (entry.isDirectory()) {
      files.push(...listFiles(join(folder, entry.name), name + "/"));
    } else if (entry.isFile()) {
      files.push(name);
    }
  }
  return files;
}

export function inside(parent: string, child: string): boolean {
  const part = relative(parent, child);
  return part !== ".." && !part.startsWith(".." + sep) && !isAbsolute(part);
}

export function checkFilePath(name: string) {
  // Manifests use forward slashes on every OS. Reject names Windows could
  // interpret as a drive, an alternate stream or a device instead of a file.
  const badPart = name.split("/").some(part =>
    !part || part === "." || part === ".." || ignored.has(part.toLowerCase()) ||
    /[\\:*?"<>|\x00-\x1f]/.test(part) || /[ .]$/.test(part) ||
    /^(con|prn|aux|nul|conin\$|conout\$|com[1-9]|lpt[1-9])(\.|$)/i.test(part)
  );
  if (badPart) throw new Error("Unsafe or unsupported snapshot path: " + JSON.stringify(name));
}

export function requireDirectory(path: string) {
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (!entry?.isDirectory()) throw new Error("Expected a real directory: " + path);
}

export function requireFile(path: string) {
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (!entry?.isFile()) throw new Error("Expected a regular file: " + path);
}
