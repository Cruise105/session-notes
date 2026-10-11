# Session Notes (stage 1, with sync)

Your printed session sheet as an app for the Galaxy Tab S9+. It runs in Chrome, installs to your home screen, and works offline once installed.

## What's in this version

- **Sessions that start filled in.** The session number counts up, today's date is set, and the in-game date starts from wherever the campaign clock is. The party table carries over from the roster.
- **Party roster** with Max HP, AC, Passive Perception, deaths (with when and how), and each PC's Favor of Fate coin.
- **Concordant Reckoning calendar** with your 13 months, 7 weekdays, both moons (Selune and Ruidus), the solstices, equinoxes and the Long Hunt. Tap the date at the top to move time forward: +10 minutes, +1 hour, a long rest, next dawn, +1 day, +1 week, or an exact date.
- **Notes** you write with the S Pen. S Pen to Text turns your handwriting into text, so the History tab can search it.
- **Ink pages** for sketches: the pen draws, your finger scrolls, and holding the S Pen's side button erases.
- **Shopping** as a plain notes box for now. The Calder Ashveil tracker comes in stage 4.
- **Google Drive sync** between your PC and tablet, the same way the Bestiary does it, plus backup files.

## One-time setup with GitHub Pages (about 10 minutes)

Use the same GitHub account as the Bestiary. Putting both apps on the same site is what lets them share the party later.

1. On github.com, click **+** (top right), then **New repository**. Name it `session-notes`, set it to **Public**, tick **Add a README file**, and click **Create repository**.
2. On your PC, unzip `session-notes.zip`.
3. In the new repository, click **Add file**, then **Upload files**. Drag in everything from inside the unzipped folder, including the `fonts` and `icons` folders. Click **Commit changes**.
4. Open the repository's own **Settings** tab (the one in the row with Code, Issues, Pull requests), then click **Pages** in the left sidebar. Under **Branch**, pick `main` and `/ (root)`, then click **Save**.
5. After a minute or two, your address will be your Bestiary address with `session-notes` in place of `bestiary`, like `https://yourname.github.io/session-notes/`.

## Install on the Tab S9+

1. Open that address in **Chrome** on the tablet.
2. Tap the **⋮** menu, then **Add to home screen**, then **Install**.
3. Open it once from the home screen icon while you're still online. After that it works with Wi-Fi off.

## Before your first session

- **Check S Pen to Text.** On most Galaxy tablets, open Settings, then **Advanced features**, then **S Pen**, and make sure **S Pen to text** is turned on. Then tap the Notes box and write a word with the pen. It should turn into typed text.
- **Fill in the party's stats.** The five current PCs are already in, but Max HP, AC and Passive Perception are blank. You can fill them in on the Party tab, or right in the session table.
- **Check the moons against Fantasy Calendar.** Open the Calendar tab and compare Selune and Ruidus with what Fantasy Calendar shows for the same day. Tell me if they're off and I'll line them up before you cancel your subscription.

## Google Drive sync

Sync uses the same Google sign-in key as the Bestiary, so there's nothing new to set up on Google's side.

1. **On the PC first:** open Settings (the gear icon), go to **Google Drive sync**, and click **Connect Google Drive**. Pick your account. If Google warns that it "hasn't verified this app," that's the same testing-mode warning you saw with the Bestiary: click **Continue** and allow access.
2. A green **Synced** cloud button appears in the top bar.
3. **Then on the tablet:** open the app while online and do the same Connect step. The tablet swaps its starter party for the one from your PC, so you won't get two copies.

After that it runs itself: it syncs when the app opens, when you switch away from it, and a few seconds after changes. Tap the cloud button to sync right away. When Google's sign-in runs out, the button says **Sign in**, and one tap fixes it.

Connect both devices before you start writing sessions on the second one. If both devices already have sessions of their own, sync keeps both copies of the campaign instead of guessing which one is right.

The Bestiary and Session Notes each keep their own sync file in Drive, so they never overwrite each other.

## Backup file

Settings also has **Save backup file** and **Load backup file**. Sync doesn't replace them: a backup file is your safety net if something ever goes wrong. Loading one merges it in, so anything newer wins and nothing is deleted.

## Updating later

When I send new files, upload them to the same repository the same way, replacing the old ones. The app picks up the update the next time it opens while online. Your notes are not touched by updates.
