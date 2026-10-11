# Session Notes (stage 4: training, Calder and cards)

Your printed session sheet as an app for the Galaxy Tab S9+. It runs in Chrome, installs to your home screen, and works offline once installed.

## What's in this version

- **Sessions that start filled in.** The session number counts up, today's date is set, and the in-game date starts from wherever the campaign clock is. The party table carries over from the roster.
- **Party roster** with Max HP, AC, Passive Perception, deaths (with when and how), and each PC's Favor of Fate coin.
- **Concordant Reckoning calendar** with your 13 months, 7 weekdays, both moons (Selune and Ruidus), the solstices, equinoxes and the Long Hunt. Tap the date at the top to move time forward: +10 minutes, +1 hour, a long rest, next dawn, +1 day, +1 week, or an exact date.
- **Notes** you write with the S Pen. S Pen to Text turns your handwriting into text, so the History tab can search it.
- **Ink pages** for sketches: the pen draws, your finger scrolls, and holding the S Pen's side button erases.
- **Shopping notes** for anything else from the session's shopping.
- **Google Drive sync** between your PC and tablet, the same way the Bestiary does it, plus backup files.

## Random outbreaks (homebrew)

Every in-game week, the app rolls for outbreaks around the world: more often in crowded cities, rarely in the wilds, never for mythic diseases. Season and climate decide which diseases (bad-water sicknesses in warm, wet places and summer; influenza and coughs in the cold). Each has a severity (a few cases, spreading, epidemic) and dies out after a few weeks. Your tablet and PC roll the same outbreaks.

- **World tab** lists them (marked "Rolled"), and location lists show a red badge where one is active.
- **Moving the party** somewhere with an outbreak asks you to confirm first.
- **While the party stays there**, each day adds to an exposure prompt on the Session tab: roll a d100 per PC against the number shown and tick who was exposed. Their Infection checks then follow the normal Darker Dungeons rules.
- **Settings** turns random outbreaks off or sets how often they happen. Each location's population (city, town, wilderness) can be changed when you edit it.

Darker Dungeons has no rules for outbreaks starting on their own, so all of this, including the exposure odds (10%, 25% or 50% a day), is homebrew.

## Absent players

Each PC in the session's party table has a **Here / Absent** button. While a player is absent, their character sits out the clock: their hunger, thirst, fatigue and temperature don't change, and they're left out of meals, rests and exposures. Training still counts down, since it runs on calendar weeks. The session (and the History list) keeps a record of who was absent, and past sessions you add can be marked too. Each PC's total of missed sessions shows under their name in the party table and on the Party tab.

## Adding past sessions

History tab → **Add a past session**. Enter the session number, the real date, the in-game start and end, where the party was, and the notes (write them or paste them in). **Save and add another** keeps going backward one number at a time. Past sessions only add to your history: they never move the campaign's date or change the party. Open one afterward to add ink pages.

## New in stage 4

- **Downtime training** using your Ability & Proficiency Improvement rules: 10 − modifier weeks, adjusted for the trainer (none +50%, Apprentice +25%, Expert −25%), with the cost per day from your price table (Apprentice −10%, Expert +10%; a party member trains for free). Training already underway before the app can be added with the in-game day it started, or just the days left. Tap **Edit** on a training after an ASI or a trainer change: the share already done is kept, and only the rest is recalculated. It counts calendar days, shows a progress bar and finish date, can be paused, and finishes itself on the right day. Finished training is listed on each PC's Party card. Your table has no price for saving throws, so set that one yourself.
- **Calder Ashveil.** "Find an item" and "Sell an item" walk you through your rolls: d100 to find a seller or buyer, the weeks die by rarity, the d6 for the seller or buyer, and the percent within their range (or tap Pick in range). Calder is a go-between, like a realtor: his fee is always 20% of the real price. The players can pay it on delivery, or pay a deposit of 20% of the estimated value up front, which he settles honestly on delivery (they owe a little more, or he refunds the difference). When the date comes, the request lights up with "Calder has news."
- **Cards to make.** A checklist of magic items that need a printed card. Anything bought through Calder is added automatically.
- **Jump links** at the top of the Session tab, with a ! when a disease check or Calder's news is waiting.

## New in stage 3

- **Diseases (Darker Dungeons).** All 12 diseases from the book are in the library on the World tab, and you can create your own. Log an exposure on the Session tab and the app counts down the incubation on your calendar, then asks for each Infection and Escalation check when it's due. You roll and tap Succeeded or Failed. Decline, relapse, bed rest (advantage), wounds (disadvantage), magical healing, disease immunity, contagion and diagnosis DCs are all handled. The party table has a Diseases column, like your printed sheet.
- **Outbreaks.** Start one in a location on the World tab, and the Session tab warns you whenever the party is there.
- **Survival conditions (Darker Dungeons).** Hunger, thirst, fatigue and temperature for every PC. Moving the clock past dawn, noon and dusk applies the book's changes for you. Stage 5–6 adds exhaustion until it's better and they rest.
- **Supplies switch.** Plentiful: they eat and drink as normal, so only fatigue (and any disease that doubles a rate) moves. Scarce: each PC has food and water rations, and at breakfast and supper the app asks who's eating.
- **Temperature from the weather.** Each PC's temperature comes from today's weather and the time of day. Set cold weather gear and other protection with the gear button (you can give the whole party the same at once), and tick "Indoors or sheltered" when they're inside.
- **Diseases that say "gain thirst at twice the normal rate"** really do double it in the survival tracker.

To turn survival conditions off for a campaign, untick them in Settings.

## New in stage 2

- **World tab** with today's weather where the party is, the last 10 days of weather, and all the locations from the Omnithel Climate Guide.
- **Weather that makes sense.** Each day is rolled on the DMG weather table, using that location's climate. There's a 50% chance yesterday's weather holds, so storms and cold snaps last a few days, and heavy rain or snow ends after 1–3 days. Every device rolls the same weather for the same day, so sync never changes it under you.
- **The Everlasting Rime** is switched on for Ten-Towns, the Icewind Dale wilderness, Reghed Glacier and the Sea of Moving Ice: winter all year, in perpetual twilight. Untick it on each location when the Rime breaks.
- **Daylight** changes with the season, with sunrise and sunset shown for wherever the party is.
- **DMG weather effects** (extreme cold and heat, strong wind, heavy rain or snow) show up on the day they apply, with a short reminder of the rule.
- **Reroll today** or **Set today's weather** whenever the story needs it.
- **Calendar** shows the weather on each day that's already happened.
- **Updates install themselves.** When a new version arrives, the app restarts into it. If you're writing at the time, it waits and asks first.

## Updating from stage 1

Upload all the files to your `session-notes` repository and replace the old ones. Then close the app completely and open it again while online. It may take one more restart. After this version, updates will restart the app on their own.

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
