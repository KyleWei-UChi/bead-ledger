# Running Bead Ledger

Two ways to run it, from one codebase.

| | Local app | Hosted copy (Claude Artifact) |
|---|---|---|
| Where it runs | your own machine | claude.ai, any device |
| Where data lives | `data/beads.json` in this folder | the Artifact's own database |
| Needs | Node 18+ | a signed-in Claude account |
| Works offline | yes | no |
| Survives losing your Claude plan | yes | no |
| Phone access | no | yes |

The local app is the reference copy; the hosted one is optional and entirely
skippable. If you only want to run this on your own machine, read section 1 and
stop there.

**The two do not share data.** See [Do they talk to each other?](#do-they-talk-to-each-other)
below — this is the most important thing on this page.

---

## 1. Local app

### Set it up once

```bash
cd bead-ledger
npm install
npm run app
```

The last command builds **Bead Ledger.app** into `~/Applications`. Find it in
Finder under Applications, or with Spotlight (⌘-Space, "Bead Ledger"), and drag
it to the Dock if you want it there.

**`npm run app` is macOS-only** — it builds a native AppleScript applet. On
Linux and Windows, skip to [Or from the terminal](#or-from-the-terminal); every
other part of the app is platform-independent.

### Every day: click the icon

Double-click **Bead Ledger**. No terminal, ever. It:

1. starts the data server, if it is not already running;
2. rebuilds the interface, if the code has changed since the last build;
3. opens **http://127.0.0.1:8787** in your browser.

Click it again later and it goes straight to step 3 — the server is already up,
so the page appears immediately.

**If the project folder is in Desktop, Documents or Downloads, the first click
asks for permission.** macOS gates those three, so you get one dialog —
*"Bead Ledger would like to access files in your Desktop folder"*. Click
**Allow**. Until you answer, the launcher waits and nothing appears to happen,
which looks exactly like a broken app. You are asked once, ever. Keeping the
project somewhere else (`~/Projects`, say) avoids the prompt entirely.

It is a launcher, not a second copy of the app. It runs the code in this folder
and writes to the same `data/beads.json`; there is nothing to keep in sync.

**It has no window of its own.** The app *is* the browser tab. The launcher
quits the moment it has opened that tab, so nothing lingers in the Dock — but
the data server keeps running quietly in the background (a few MB) until you
log out or restart the Mac. That is what lets the second click be instant. To
stop it sooner:

```bash
npm run stop
```

**If you move or rename this folder, the icon stops working** — it points at an
absolute path. Re-run `npm run app` from the new location to repoint it.

Anything that goes wrong surfaces as a macOS dialog, with the detail in
`data/server.log`.

### If the icon does not work

- **macOS says it is from an unidentified developer** — right-click the app →
  **Open** → **Open**. You built it on this Mac yourself; this is needed once,
  if at all.
- **"The project folder has moved or been renamed"** — re-run `npm run app`
  from wherever the folder lives now.
- **"Node.js was not found"** — Node moved or was upgraded. Re-run
  `npm run app`; the path to it is baked in when the launcher is built.
- **"The data server did not start"** — the last lines of `data/server.log` say
  why, or run `npm start` in a terminal to watch it fail directly.
- **The icon bounces and then nothing happens** — a permission dialog is
  probably waiting behind another window. Look for it; it is the Desktop-access
  prompt above.
- **"You need to install Rosetta"** — you are running an older launcher built
  around a shell script, which Apple silicon mistakes for an Intel app. Say
  *Not Now* and re-run `npm run app`; the current one is a native universal
  applet.

The launcher is disposable: `npm run app` rebuilds it from scratch, icon
included.

### Or from the terminal

The same thing without the icon:

```bash
npm run build   # only after code changes
npm start
```

Then **http://localhost:8787**.

### Working on the code

```bash
npm run dev
```

Then **http://localhost:5178** — Vite on `5178` with hot reload, plus the data
server on `8787`. Both must be running; the page shows a banner if the data
server is down. Stop them with `Ctrl-C`.

The icon does not use this mode: it serves the built files from `8787` alone,
which is one process instead of two and does not need Vite.

### Where your data goes

```
data/beads.json          everything: stock, blueprints, orders, settings
data/backups/            the last 20 versions, written before each save
data/images/             blueprint photos, resized to 1600px
data/server.log          what the launcher and server printed, if you need it
```

`data/` is gitignored, so you can publish this repo without publishing your bead
stock. The file is plain readable JSON — if you ever stop using this app, your
data is still a documented JSON document you can open in any editor.

Saves happen automatically about half a second after you stop typing. The header
shows `saving…` then `✓ saved`.

### Sample data

A fresh clone starts empty, which makes the charts and the reorder advice look
broken — they have nothing to work from. To fill it with a fabricated year of
history:

```bash
npm run seed
```

The app then shows an orange banner saying the numbers are made up. Click
**Start fresh** in that banner to wipe it before entering your own stock, or:

```bash
rm data/beads.json
```

---

## 2. Hosted copy (Claude Artifact)

Optional. It exists so you can check stock on your phone before placing an
order. Skip this section entirely if you only run the app locally.

The same code can be built as a single self-contained page that stores data in
a [Claude Artifact](https://claude.ai) database instead of the local file:

```bash
npm run build:artifact
```

That writes `dist-artifact/page.html` — one file, around 256 KB, with all CSS
and JS inlined. Ask Claude to publish that file as an Artifact; you get a
private URL only your account can open, on any device, with nothing to install.

It is the **same app**, built against a different storage backend. Settings →
Your data shows `Backend: Artifact database`, so you always know which copy you
are looking at.

Publishing again to the **same URL** replaces the page in place and keeps the
data. The hosted copy does not update itself when you change the code — rebuild
and republish.

### What is different there

- **Export** goes through the Artifact's download prompt rather than a plain
  browser download, because artifact pages cannot start downloads directly. If
  it is ever refused, the app shows you the JSON in a text box to copy instead.
- **Light/dark** follows Claude's own theme switch, so the app's theme selector
  is hidden — two switches would fight each other.
- **Blueprint images** are stored in the Artifact's asset store.

### If it will not load

- *"Sign in to view this page"* — the Artifact is private; sign in to the
  account that published it.
- *"This page cannot reach its database"* — you are signed in but the page was
  not granted its database. Reload. If it persists, use the local app; that copy
  of your data is unaffected.

---

## Do they talk to each other?

**No. They are two separate stores and nothing syncs between them.**

Beads you log in the local app will not appear in the hosted copy, and vice
versa. Neither can see the other: the hosted page runs in a sandbox on
claude.ai and cannot reach `localhost`, and your machine has no access to the
Artifact database.

This is deliberate rather than unfinished. Silent two-way sync between a file on
your laptop and a cloud store is how inventory data quietly gets corrupted —
two devices, two edits, one of them lost without telling you. A manual transfer
you can see is safer for a ledger you are going to trust when spending money.

### So pick one to be the real one

Decide which copy you *enter data into*, and treat the other as a snapshot.

- **Local as primary** — recommended if you log beads at your desk with the
  finished piece in front of you. You own the file outright, and it keeps
  working if you ever change or cancel your Claude plan. Push a copy to the
  hosted version when you want to check stock on your phone before ordering.
- **Hosted as primary** — better if you want to log from your phone or iPad.
  Then export to the repo regularly, because that export is your only copy you
  control.

Entering data in both and hoping is the one approach that will bite you.

### Moving data between them

Both directions use the same file, in **Settings → Your data**:

1. On the copy that has the good data, click **Export JSON**. You get
   `bead-ledger-YYYY-MM-DD.json`.
2. On the other copy, click **Import JSON** and choose that file.

**Import replaces everything** in the copy you import into — it is not a merge.
Export from the target first if you are not sure which one is ahead. Both copies
show `Last change` in Settings → Your data; the later timestamp is usually the
one you want to keep.

To load an export into the local app without opening the browser, drop it
straight in:

```bash
cp ~/Downloads/bead-ledger-2026-11-21.json data/beads.json
```

Restart is not needed — reload the page.

### Backing up

The local app writes a timestamped copy into `data/backups/` before every save
and keeps the last 20. The hosted copy has no equivalent, so if you make it your
primary, export on a schedule you will actually keep to — after each order, say.

---

## Ports

| Port | What |
|---|---|
| 5178 | Vite dev server (the interface during `npm run dev`) |
| 8787 | data server (also serves the built app under `npm start`) |

Change them with `BEAD_API_PORT=9000 npm run dev`, and the matching `port` in
`vite.config.ts` for the Vite side.
