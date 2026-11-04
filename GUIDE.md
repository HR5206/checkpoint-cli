# Checkpoint in five hours

Start in the folder containing `package.json`. Each hour below is one small piece of the finished project. If you're rebuilding it yourself, stop at the end of each hour and run the experiment before opening the next file.

In the finished layout, `listFiles` lives in `src/files.mts`; it is the recursive walk from Hour 1. Existing Hour 2 stores with regular supported filenames use the same directory layout and manifest fields.

## Hour 1 · Read a folder

**Question:** How can the program identify a change before it starts storing anything?

Open `src/files.mts` and trace `listFiles`. The loop reads the entries in one directory. If an entry is a folder, the function calls itself on that folder: this is recursion. The `prefix` argument remembers the part of the path already visited. A file in `demo/styles` therefore becomes `styles/site.css` in the inventory. The `...` before the recursive result adds each returned filename separately.

Open `src/checkpoint.mts`. `process.argv.slice(2)` gives the arguments following the script name. In the `scan` branch the program reads each file as bytes, calls `fingerprint`, and prints the first 12 characters beside the relative path. The list is sorted to make two runs easy to compare.

~~~sh
node src/checkpoint.mts scan demo
~~~

**Experiment:** Change one colour in the stylesheet. Scan again. Only its fingerprint changes. Rename the stylesheet and scan again: the path changes but the fingerprint stays the same. Restore the sample filename and colour before the next lesson if you want to follow the exact examples in the README.

**Done when:** You can explain the difference between a path and a fingerprint.

## Hour 2 · Save the old bytes

**Question:** Can a fingerprint alone bring yesterday's CSS back? No; it identifies the content, but you still need the content.

Read `saveSnapshot` in `src/snapshot.mts`. For each path it:

1. Reads the file once and calculates the full SHA-256 hash of the bytes.
2. Uses that hash as a filename under `objects`.
3. Writes an object only if it doesn't exist. Before reusing an object, it checks the existing bytes.
4. Adds the path, hash and byte count to the snapshot's `files` list regardless of whether a new object was written.

The snapshot note and the UTC timestamp are metadata. The manifest is a JSON index of all the paths in that particular save. `JSON.stringify(..., null, 2)` formats it so you can open it in VS Code. `publishFile` writes to a temporary filename in the same directory and renames it after the write completes. A save stopped before it publishes a manifest is not shown in history.

**Experiment:** Follow the three-save example in the README. Open the first two manifests and find the hash for `styles/site.css`. Open each corresponding object; you can read the old colour in one and the new colour in the other.

**Done when:** Two different CSS versions are recoverable and both snapshots point to the same unchanged HTML object.

## Hour 3 · Read history and compare snapshots

**Question:** What changed between two saved versions, even if the working folder has changed a third time?

Start with `history` in `src/snapshot.mts`. It selects numbered directories with a manifest, converts the names into integers, then sorts them in descending numeric order. That keeps snapshot 10 ahead of snapshot 9. `readSnapshot` checks that the manifest ID agrees with the requested directory, that each file has a relative path, and that hash and size fields make sense.

Now open `src/compare.mts`. A `Map` lets the program look up a hash by path. One map represents the older snapshot; one represents the newer snapshot. Their combined set of paths contains every path either version knew about.

| In older snapshot? | In newer snapshot? | Result |
|---|---|---|
| No | Yes | Added |
| Yes | No | Deleted |
| Yes | Yes, different hash | Changed |
| Yes | Yes, same hash | Leave it out of the report |

~~~sh
node src/checkpoint.mts history demo
node src/checkpoint.mts compare demo 1 2
node src/checkpoint.mts compare demo 2 3
~~~

If you used the README example, `1 → 2` shows the changed CSS and `2 → 3` shows no file changes despite the different note. Reverse the IDs to see how addition and deletion depend on direction.

**Done when:** You can explain why `compare` reads manifests rather than today's files.

## Hour 4 · Restore without overwriting your work

**Question:** Can we show that the old content is intact and leave the live project alone?

Open `src/restore.mts`. Trace the stages in order:

1. Read and validate the manifest. Relative paths belong under the output root; entries such as `../other-file` must be refused.
2. Resolve the parent of the requested destination. Reject a destination inside the tracked project or one that's already occupied.
3. In a private temporary directory, recreate each file's subfolders. `readObject` checks both its byte count and its full hash before its contents are used.
4. Claim a fresh destination using `mkdirSync` without the recursive option. This fails if the directory already exists. Move the verified files into it, then clean up the staging directory.

~~~sh
node src/checkpoint.mts restore demo 1 --to recovered-demo
~~~

If `recovered-demo` exists from an earlier run, choose a new name. Compare its stylesheet with `demo/styles/site.css`. Try the exact command a second time: it should refuse to overwrite the recovered folder.

**Done when:** The recovered file is byte-for-byte the old version and the current file keeps your newer edit.

## Hour 5 · Prove it and present it

~~~sh
node --test test/checkpoint.test.mts
node scripts/demo.mts
~~~

The tests use Node's built-in test runner. Each fixture gives the CLI a temporary project, runs it as a real process, and checks its output, exit status and files. The damaged-object test deliberately changes a stored object and checks that recovery fails without publishing a destination. Symlink creation may be skipped on systems that don't allow it.

The demo uses a separate throwaway project, so it won't disturb your practice folder. It performs all five commands and makes assertions about the recovered bytes and the still-edited working files. These checks are what make its final success message meaningful.

**For a one-minute portfolio walkthrough:**

1. Show one change to a CSS file and save the new snapshot.
2. Compare before and after. Point out which file changed.
3. Restore the earlier snapshot and open both CSS versions.
4. Show a test that mattered to you. Explain why a hash is printed short but checked in full.

**One extension to make it yours:** Add a `stats` command that reports the sum of the bytes described by completed manifests and the bytes occupied by distinct referenced objects. Keep metadata overhead separate. Start by predicting the answer for the bundled demo, then test your calculation on your own example.
