# Checkpoint

Checkpoint saves local versions of a project folder. It can tell you which files changed and recover an earlier version into a new folder. The working project stays where it is.

The example is a small portfolio. Save its original colours, try a different stylesheet, rename the homepage, then recover the original HTML and CSS.

## Start here

1. Extract the ZIP. In VS Code, choose **File → Open Folder** and open the inner `checkpoint` folder containing `package.json`.
2. Open **Terminal → New Terminal**. Run `node --version`. Use a recent Node 24 LTS or Node 26 LTS release. This release was tested on Node 24.22.1. If needed, install an LTS version from [nodejs.org](https://nodejs.org/en/download).
3. Run the demo:

~~~sh
node scripts/demo.mts
~~~

The demo uses a fresh temporary project, runs all five commands, verifies the recovered files, prints its measurements and removes the temporary directory. You can run it repeatedly without changing `demo/`.

To run the tests:

~~~sh
node --test test/checkpoint.test.mts
~~~

There are no npm dependencies to install. The `.mts` files use the TypeScript syntax Node can execute directly. Running them does not perform a separate static type check.

## Commands

Run these from the inner `checkpoint` folder. Give paths with spaces their own pair of quotes.

| Command | Purpose |
|---|---|
| `node src/checkpoint.mts scan demo` | Read the folder and print each path with a short fingerprint. |
| `node src/checkpoint.mts save demo "Original palette"` | Save the files under `demo/.checkpoint/`. The note is optional. |
| `node src/checkpoint.mts history demo` | List completed snapshots, newest ID first. |
| `node src/checkpoint.mts compare demo 1 2` | Report paths added, changed, or deleted going from snapshot 1 to snapshot 2. |
| `node src/checkpoint.mts restore demo 1 --to recovered-demo` | Recover snapshot 1 into a new folder outside `demo`. Its parent must exist. |
| `node src/checkpoint.mts --help` | Print the command syntax. |

For `history`, `compare` and `restore`, the folder can be omitted; the current working directory is used. A relative `--to` path is also resolved from the current working directory. The npm scripts `npm run demo`, `npm test` and `npm run checkpoint -- <arguments>` are optional shortcuts.

## Try it by hand

Start with the untouched `demo` folder included in the ZIP. Snapshot numbers below assume it has no existing store.

~~~sh
node src/checkpoint.mts scan demo
node src/checkpoint.mts save demo "Before the colour change"
~~~

In VS Code, open `demo/styles/site.css`. Change `--ink: #20354b` to `--ink: #a44743` and save the file. Then run:

~~~sh
node src/checkpoint.mts save demo "Try faded red"
node src/checkpoint.mts save demo "Same contents, new note"
node src/checkpoint.mts history demo
node src/checkpoint.mts compare demo 1 2
node src/checkpoint.mts restore demo 1 --to recovered-demo
~~~

On a fresh demo, the three saves add **2, 1, and 0** objects. Open `recovered-demo/styles/site.css`: it contains the original colour. Open `demo/styles/site.css`: it still has your edit. For another restore, choose a different new destination.

## What is saved?

| Inside the tracked folder | Meaning |
|---|---|
| `.checkpoint/objects/<full SHA-256>` | Exact bytes for one distinct file version. Equal content can share an object even across different filenames. |
| `.checkpoint/snapshots/<id>/manifest.json` | The snapshot number, UTC creation time, note, and the relative path, full hash and byte count of every saved file. |

The first 12 hash characters are for terminal display only. Storage and integrity checks use the full hash. A save writes its manifest after its objects; history ignores numbered directories that have no completed manifest. The storage format is the same as in the Hour 2 lesson.

A changed path is compared using its full file hash. A rename appears as one deletion and one addition. Checkpoint doesn't try to guess which files were renamed.

## Code map

| File | Start reading here for… |
|---|---|
| `src/checkpoint.mts` | Command-line arguments, output, and routing. |
| `src/files.mts` | The Hour 1 directory walk, path checks, and ignored folders. |
| `src/snapshot.mts` | Hashing, saving objects, manifests, history, and object verification. |
| `src/compare.mts` | Comparing two path-to-hash maps. |
| `src/restore.mts` | Staging a verified restore and claiming a fresh destination. |
| `test/checkpoint.test.mts` | End-to-end tests that run the CLI against temporary projects. |
| `GUIDE.md` | The beginner walkthrough for all five hours. |

## Scope of this version

- Designed for a small local project and one writer at a time. A save reads each regular file into memory. The folder as a whole is not frozen while it is being read.
- Skips `.git`, `.checkpoint`, `node_modules`, `.next` and symbolic links encountered within the project. Other regular files, including dotfiles, are included. Checkpoint does not read Git ignore rules.
- Records file contents and paths, not empty subdirectories, timestamps, executable bits, or filesystem permissions. Some filenames that are unsafe or ambiguous across operating systems are refused.
- Local history shares a disk with the project. It is not an off-device backup. An interrupted run can leave temporary files, unused objects, or an incomplete directory. Only completed manifests count as snapshots.
- The restore destination must not already exist, even if it is empty. Objects are verified before the destination is claimed. This is not a power-loss-safe transaction; a hard interruption during the final move can leave an incomplete fresh output folder.
- Content hashes catch missing or damaged objects; they do not authenticate a store supplied by someone else.
