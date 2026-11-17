# Kwitch

Browser extension (Chrome and Firefox) that merges your live followed channels from both sites:

- On **twitch.tv** the "Followed channels" sidebar also lists your live Kick follows (green dot + viewer count).
- On **kick.com** the "Following" sidebar also lists your live Twitch follows (red dot + viewer count).
- Entries are normal links to the channel on its own site.
- The list is sorted by viewer count and refreshes every minute.
- A streamer who is live on both sites is shown once. The popup lets you pick the **main viewing site** whose entry wins
  (default: the site you are on).

There is no separate login: the extension uses the Twitch and Kick sessions of the browser it runs in.

## Install

**Chrome / Edge / Brave**: open `chrome://extensions`, enable *Developer mode*, click *Load unpacked*, select this folder.

**Firefox** (121+): open `about:debugging#/runtime/this-firefox`, click *Load Temporary Add-on…*, select `manifest.json`.
Temporary add-ons are removed when Firefox closes; a permanent install needs a signed build from addons.mozilla.org.

Chrome shows a harmless warning about `background.scripts` in the manifest; that key is there for Firefox.

## Matching multistreamers

Channels are treated as the same streamer when the names match (ignoring case, `_` and `-`) or the stream titles are
identical. For different names, add a line `twitchname=kickname` in the popup (e.g. `zackrawrr=asmongold`).

## Files

- `shared.js` – fetches live follows (Twitch GQL, Kick site API) and the duplicate matching
- `background.js` – fetches the other site's list for a page (cross-site), 45 s cache
- `content.js` / `content.css` – sidebar injection, sorting, hiding duplicates
- `popup.html` / `popup.js` – connection status and settings

## Known limits

- Both sites' internal APIs and sidebar markup are undocumented and can change. If Twitch entries stop appearing on Kick,
  the persisted query hash in `shared.js` (`TWITCH_FOLLOWING_LIVE_HASH`) is the first thing to check.
- Twitch only renders the channels it has loaded in its sidebar ("Show more" loads the rest); those are re-ordered by
  viewers, not replaced.
