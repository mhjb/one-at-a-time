# One at a Time — tweet rater

A Chrome/Edge extension that turns your X (Twitter) feed into a one-tweet-at-a-time review deck. It shows a single tweet, you rate it, and it acts on your feed and moves on:

- **1 — Boo** → hides the tweet
- **2 — Okay** → skips it
- **3 — Yay** → likes the tweet

Then it shows the next tweet. Works with the buttons or the `1` / `2` / `3` keys. `Esc` exits.

It runs only on the **home timeline** (`x.com/home`) — not on single-tweet pages, profiles, or search. If you open a tweet, the reviewer closes; it comes back when you return to the home timeline.

By default it **starts automatically** when you open x.com. Toggle this from the extension's popup (click its toolbar icon). With auto-start off, use the **🎯 One at a Time** button in the bottom-right corner.

From the same popup you can set the **background**: default (matches the X theme), a solid colour of your choice, or an image (paste a URL or upload a file). Changes apply live.

Based on [this tweet](https://x.com/RichDecibels/status/2076763798669574304) by @RichDecibels.

## Install

1. Unzip `one-at-a-time.zip` to a permanent folder (the extension runs from it).
2. Open `chrome://extensions` and turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select the `one-at-a-time` folder.
4. Open [x.com/home](https://x.com/home) — it starts automatically.

Updating a previously installed copy? Click **Remove**, then repeat the steps above.

## How it works

- Reads tweets already loaded in your real timeline and presents them one at a time in an overlay.
- When you rate a tweet, it acts on the *actual* tweet in your feed: **Yay** clicks the real Like button; **Boo** hides the tweet from the page.
- Tweets are clickable: links, @handles and hashtags open in a new tab (so your review session stays open); clicking the tweet itself opens its permalink in a new tab; clicking a quoted/sub-tweet navigates through to it on X.
- Long tweets: clicking **Show more** expands the full text inline, right in the overlay.
- A follow pill sits next to each author's name showing **+ Follow**, **✓ Following**, or **⇄ Mutual** (you follow each other) at a glance. Click to follow, or unfollow with one click without leaving the reviewer.
- **Videos and GIFs play inline**, right in the overlay, instead of opening a new tab. The playable file is loaded from X's public syndication endpoint (`cdn.syndication.twimg.com`); if it can't be resolved, the tweet's poster image is shown.
- When it runs low on tweets, it auto-scrolls the timeline to load more.
- A running tally of 👎 / 😐 / ❤️ shows in the header.

## Notes & limits

- **Nothing leaves your browser.** No data is stored or sent anywhere; the tally is in-memory for the session.
- Likes are real actions on your account — only **3 / Yay** likes. **1 / Boo** just hides locally (it doesn't block or report anyone).
- X changes its site markup often. If a button stops working, the CSS selectors in `content.js` (`[data-testid="like"]`, `article[data-testid="tweet"]`, `[data-testid="cellInnerDiv"]`) may need updating.
- Promoted/ad tweets are skipped automatically.

## Files

- `manifest.json` — extension manifest (MV3)
- `content.js` — overlay, tweet collection, rating logic
- `background.js` — fetches inline video/GIF URLs from X syndication
- `styles.css` — overlay styling (light + dark)
- `popup.html` / `popup.js` — settings popup (auto-start toggle)
- `icons/` — toolbar icons
