/* One at a Time — tweet rater
 * Turns the X/Twitter feed into a one-tweet-at-a-time review deck.
 *   1 = boo  -> hide the tweet
 *   2 = okay -> skip
 *   3 = yay  -> like the tweet
 * ...then advance to the next tweet.
 */
(() => {
  "use strict";

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const state = {
    active: false,
    queue: [],          // original <article> elements not yet reviewed
    current: null,      // the original element currently on screen
    counts: { boo: 0, okay: 0, yay: 0 },
    refilling: false,
  };

  /* ---------- tweet collection ---------- */

  function isAd(article) {
    // Promoted tweets carry a "Ad" social-context label. Skip them.
    const spans = article.querySelectorAll('div[dir="ltr"] > span, span');
    for (const s of spans) {
      const t = (s.textContent || "").trim();
      if (t === "Ad" || t === "Promoted") return true;
    }
    return false;
  }

  function refillQueue() {
    document.querySelectorAll(TWEET_SELECTOR).forEach((a) => {
      if (a.dataset.oatScanned) return;
      a.dataset.oatScanned = "1";
      if (isAd(a)) return;
      state.queue.push(a);
    });
  }

  // Ask X to load more tweets by nudging the scroll, then refill.
  function loadMore() {
    return new Promise((resolve) => {
      if (state.refilling) return resolve();
      state.refilling = true;
      const before = state.queue.length;
      window.scrollBy(0, window.innerHeight * 1.5);
      setTimeout(() => {
        refillQueue();
        state.refilling = false;
        resolve(state.queue.length > before);
      }, 900);
    });
  }

  async function nextLiveTweet() {
    refillQueue();
    // Drop stale (detached) or hidden nodes off the front.
    while (state.queue.length) {
      const el = state.queue.shift();
      if (el.isConnected && el.offsetParent !== null) return el;
    }
    // Nothing ready — try to load more, up to a few times.
    for (let i = 0; i < 4; i++) {
      const got = await loadMore();
      while (state.queue.length) {
        const el = state.queue.shift();
        if (el.isConnected && el.offsetParent !== null) return el;
      }
      if (!got && i >= 1) break;
    }
    return null;
  }

  /* ---------- rendering ---------- */

  function buildClone(article) {
    const clone = article.cloneNode(true);
    // Strip the action bar (reply/retweet/like/etc) and any menus.
    clone.querySelectorAll('[role="group"]').forEach((n) => n.remove());
    clone
      .querySelectorAll('[data-testid="caret"], [aria-haspopup="menu"]')
      .forEach((n) => n.remove());
    // Neutralise interactivity + strip our scan marker.
    clone.removeAttribute("data-oat-scanned");
    clone.querySelectorAll("[data-oat-scanned]").forEach((n) =>
      n.removeAttribute("data-oat-scanned")
    );
    // Make anchors real, absolute links that open in a new tab (keeps the
    // review session alive). Author, @handles, hashtags, links, permalink.
    clone.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("javascript:") || href === "#") return;
      let abs;
      try {
        abs = new URL(href, location.origin).href;
      } catch (_) {
        return;
      }
      a.setAttribute("href", abs);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });
    return clone;
  }

  // Permalink of the main tweet = the anchor wrapping its timestamp.
  function mainTweetUrl(clone) {
    const t = clone.querySelector("time");
    const a = t && t.closest("a[href]");
    if (!a) return null;
    try {
      return new URL(a.getAttribute("href"), location.origin).href;
    } catch (_) {
      return null;
    }
  }

  async function showNext() {
    const el = document.getElementById("oat-card");
    if (!el) return;
    el.classList.add("oat-loading");
    el.innerHTML = '<div class="oat-msg">Loading next tweet…</div>';

    const article = await nextLiveTweet();
    if (!article) {
      el.innerHTML =
        '<div class="oat-msg">No more tweets right now.<br><small>Scroll happens automatically — try again in a moment, or press Esc to exit.</small></div>';
      state.current = null;
      el.classList.remove("oat-loading");
      return;
    }

    // Keep the real node mounted (and its Like button alive) by scrolling to it.
    try {
      article.scrollIntoView({ block: "center" });
    } catch (_) {}

    state.current = article;
    renderCurrent();
  }

  // (Re)render whatever tweet is currently selected.
  function renderCurrent() {
    const el = document.getElementById("oat-card");
    if (!el || !state.current) return;
    const article = state.current;
    const clone = buildClone(article);
    el.classList.remove("oat-loading");
    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "oat-tweet";
    wrap.appendChild(clone);
    el.appendChild(wrap);
    wireClicks(wrap, clone, article);
    setupFollowPill(clone, article);
    setupInlineVideo(clone);
  }

  /* ---------- inline video / GIF playback ---------- */

  // Replace a video/GIF poster in the clone with a real, playable <video>,
  // using the mp4 URL fetched from X's syndication endpoint (via background).
  function setupInlineVideo(clone) {
    const url = mainTweetUrl(clone);
    const m = url && url.match(/status\/(\d+)/);
    if (!m) return;
    const id = m[1];

    // Only the main tweet's media (not a quoted tweet's).
    const photos = [...clone.querySelectorAll('[data-testid="tweetPhoto"]')].filter(
      (p) => !p.closest('div[role="link"]')
    );
    const isGifLabel = [...clone.querySelectorAll("*")].some(
      (e) => e.children.length === 0 && (e.textContent || "").trim() === "GIF"
    );
    const looksLikeVideo =
      !!clone.querySelector('[data-testid="videoComponent"], [data-testid="videoPlayer"]') ||
      isGifLabel ||
      photos.some((p) =>
        p.querySelector('img[src*="video_thumb"], img[src*="tweet_video"], img[src*="amplify_video"]')
      );
    if (!photos.length || !looksLikeVideo) return;

    const target = photos[0];
    target.classList.add("oat-media-loading");

    try {
      chrome.runtime.sendMessage({ type: "oat-fetch-media", id }, (resp) => {
        if (chrome.runtime.lastError) return;
        target.classList.remove("oat-media-loading");
        if (!target.isConnected || !resp || !resp.media || !resp.media.length) return;
        const media = resp.media[0];
        const holder = document.createElement("div");
        holder.className = "oat-live-media oat-video";
        const v = document.createElement("video");
        v.className = "oat-video-el";
        v.src = media.url;
        v.controls = true;
        v.playsInline = true;
        if (media.type === "animated_gif") {
          v.loop = true;
          v.muted = true;
          v.autoplay = true;
        } else {
          v.preload = "metadata";
          if (media.poster) v.poster = media.poster;
        }
        holder.appendChild(v);
        target.replaceWith(holder);
      });
    } catch (_) {
      target.classList.remove("oat-media-loading");
    }
  }

  // Fire a realistic click so X's React handlers respond (a plain .click()
  // is ignored for some controls, e.g. the "Show more" button).
  function dispatchRealClick(el) {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 5, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", o));
    el.dispatchEvent(new MouseEvent("mousedown", o));
    el.dispatchEvent(new PointerEvent("pointerup", o));
    el.dispatchEvent(new MouseEvent("mouseup", o));
    el.dispatchEvent(new MouseEvent("click", o));
  }

  /* ---------- follow state via X's own hovercard (headless) ---------- */

  function waitFor(fn, timeout = 2500, interval = 100) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        let v = null;
        try { v = fn(); } catch (_) {}
        if (v) { clearInterval(iv); resolve(v); }
        else if (Date.now() - t0 > timeout) { clearInterval(iv); resolve(null); }
      }, interval);
    });
  }

  function dispatchHover(el) {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.x + 10, clientY: r.y + 8, view: window };
    el.dispatchEvent(new PointerEvent("pointerover", o));
    el.dispatchEvent(new MouseEvent("mouseover", o));
    el.dispatchEvent(new PointerEvent("pointerenter", o));
    el.dispatchEvent(new MouseEvent("mouseenter", o));
    el.dispatchEvent(new MouseEvent("mousemove", o));
  }

  function dispatchUnhover(el) {
    const o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent("pointerout", o));
    el.dispatchEvent(new MouseEvent("mouseout", o));
    el.dispatchEvent(new MouseEvent("mouseleave", o));
  }

  // Trigger X's hovercard for a name link and return its follow/unfollow button.
  // The card renders in a portal *behind* our opaque overlay, so it stays unseen.
  async function hoverCardFollowBtn(origNameLink) {
    dispatchHover(origNameLink);
    return waitFor(() => {
      const hc = document.querySelector('[data-testid="HoverCard"]');
      return hc && hc.querySelector('[data-testid$="-follow"], [data-testid$="-unfollow"]');
    }, 2500, 120);
  }

  const isFollowing = (btn) =>
    (btn.getAttribute("data-testid") || "").endsWith("-unfollow");

  // Read follow state from the hovercard: whether you follow them, and whether
  // they follow you back ("Follows you" => userFollowIndicator).
  async function readFollowState(origNameLink) {
    const btn = await hoverCardFollowBtn(origNameLink);
    if (!btn) return null;
    const hc = btn.closest('[data-testid="HoverCard"]');
    const followsYou = !!(hc && hc.querySelector('[data-testid="userFollowIndicator"]'));
    return { following: isFollowing(btn), followsYou };
  }

  // Add a Follow / Following pill next to the tweet author's name.
  function setupFollowPill(clone, article) {
    const userName = clone.querySelector('[data-testid="User-Name"]');
    const origName = article.querySelector('[data-testid="User-Name"] a[role="link"]');
    if (!userName || !origName) return;

    const pill = document.createElement("button");
    pill.className = "oat-follow oat-follow-loading";
    pill.textContent = "···";
    userName.appendChild(pill);

    let following = false;
    let followsYou = false;
    const label = () =>
      following ? (followsYou ? "⇄ Mutual" : "✓ Following") : "+ Follow";
    const paint = () => {
      pill.classList.remove("oat-follow-loading");
      pill.classList.toggle("oat-following", following && !followsYou);
      pill.classList.toggle("oat-mutual", following && followsYou);
      pill.textContent = label();
    };
    // On hover, a "Following"/"Mutual" pill previews the Unfollow action (like X).
    pill.addEventListener("mouseenter", () => {
      if (following && !pill.classList.contains("oat-follow-loading"))
        pill.textContent = "✕ Unfollow";
    });
    pill.addEventListener("mouseleave", () => {
      if (following && !pill.classList.contains("oat-follow-loading"))
        pill.textContent = label();
    });

    // Read the initial follow state.
    (async () => {
      const st = await readFollowState(origName);
      if (!st) { pill.style.display = "none"; return; }
      following = st.following;
      followsYou = st.followsYou;
      paint();
      dispatchUnhover(origName);
    })();

    // Click to follow / unfollow.
    pill.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pill.classList.contains("oat-follow-busy") || pill.classList.contains("oat-follow-loading"))
        return;
      pill.classList.add("oat-follow-busy");
      const btn = await hoverCardFollowBtn(origName);
      if (btn) {
        dispatchRealClick(btn);
        // Unfollow pops a confirmation sheet — confirm it headlessly.
        const confirm = await waitFor(
          () => document.querySelector('[data-testid="confirmationSheetConfirm"]'),
          900, 80
        );
        if (confirm) dispatchRealClick(confirm);
        // Re-read the resulting state.
        await new Promise((r) => setTimeout(r, 600));
        const st2 = await readFollowState(origName);
        if (st2) { following = st2.following; followsYou = st2.followsYou; paint(); }
        dispatchUnhover(origName);
      }
      pill.classList.remove("oat-follow-busy");
    });
  }

  // Route clicks in the clone to the right destination.
  //  - anchors: open in a new tab (handled natively by target=_blank)
  //  - quoted tweets / cards (div[role="link"], no href): re-dispatch the
  //    click to the matching node in the real tweet so X navigates there
  //  - anywhere else on the card: open the main tweet's permalink
  function wireClicks(wrap, clone, article) {
    const cloneBlocks = [...clone.querySelectorAll('div[role="link"]')];
    const origBlocks = [...article.querySelectorAll('div[role="link"]')];
    const mainUrl = mainTweetUrl(clone);

    wrap.addEventListener("click", (e) => {
      // Inline video player: let it handle its own clicks (play/pause/seek).
      if (e.target.closest(".oat-live-media")) return;

      // "Show more" on a long tweet: expand it inline instead of leaving.
      const showMore = e.target.closest('[data-testid="tweet-text-show-more-link"]');
      if (showMore && wrap.contains(showMore)) {
        e.preventDefault();
        const cloneSM = [...clone.querySelectorAll('[data-testid="tweet-text-show-more-link"]')];
        const origSM = [...article.querySelectorAll('[data-testid="tweet-text-show-more-link"]')];
        const orig = origSM[cloneSM.indexOf(showMore)];
        if (orig && orig.isConnected) {
          dispatchRealClick(orig);
          let tries = 0;
          const iv = setInterval(() => {
            tries++;
            if (!orig.isConnected || tries > 25) {
              clearInterval(iv);
              renderCurrent(); // re-clone the now-expanded tweet
            }
          }, 120);
        }
        return;
      }

      const anchor = e.target.closest("a[href]");
      if (anchor && wrap.contains(anchor)) return; // let the new-tab link open

      const block = e.target.closest('div[role="link"]');
      if (block && wrap.contains(block)) {
        e.preventDefault();
        const idx = cloneBlocks.indexOf(block);
        const orig = origBlocks[idx];
        if (orig && orig.isConnected) {
          stop(); // reveal the page, then let X navigate
          orig.click();
          return;
        }
      }

      if (mainUrl) window.open(mainUrl, "_blank", "noopener");
    });
  }

  /* ---------- actions ---------- */

  function likeCurrent() {
    const a = state.current;
    if (!a || !a.isConnected) return;
    const btn =
      a.querySelector('[data-testid="like"]') ||
      a.querySelector('button[aria-label*="Like" i]');
    if (btn) btn.click(); // no-op-safe; if already liked the button is "unlike"
  }

  function hideCurrent() {
    const a = state.current;
    if (!a) return;
    const container = a.closest('[data-testid="cellInnerDiv"]') || a;
    container.style.display = "none";
  }

  async function rate(kind) {
    if (!state.active || !state.current) return;
    if (kind === "yay") {
      state.counts.yay++;
      likeCurrent();
    } else if (kind === "boo") {
      state.counts.boo++;
      hideCurrent();
    } else {
      state.counts.okay++;
    }
    updateCounts();
    await showNext();
  }

  /* ---------- UI shell ---------- */

  function updateCounts() {
    const c = document.getElementById("oat-counts");
    if (c) {
      c.innerHTML =
        `<span class="oat-c oat-boo">👎 ${state.counts.boo}</span>` +
        `<span class="oat-c oat-okay">😐 ${state.counts.okay}</span>` +
        `<span class="oat-c oat-yay">❤️ ${state.counts.yay}</span>`;
    }
  }

  function buildOverlay() {
    if (document.getElementById("oat-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "oat-overlay";
    overlay.innerHTML = `
      <div id="oat-panel">
        <div id="oat-header">
          <span id="oat-title">One at a Time</span>
          <div id="oat-counts"></div>
          <button id="oat-close" title="Exit (Esc)">✕</button>
        </div>
        <div id="oat-card"></div>
        <div id="oat-controls">
          <button class="oat-btn oat-boo" data-kind="boo"><b>1</b> Boo · hide</button>
          <button class="oat-btn oat-okay" data-kind="okay"><b>2</b> Okay · skip</button>
          <button class="oat-btn oat-yay" data-kind="yay"><b>3</b> Yay · like</button>
        </div>
        <div id="oat-hint">Keys: <b>1</b> boo &nbsp; <b>2</b> okay &nbsp; <b>3</b> yay &nbsp; <b>Esc</b> exit</div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector("#oat-close").addEventListener("click", stop);
    overlay.querySelectorAll(".oat-btn").forEach((b) =>
      b.addEventListener("click", () => rate(b.dataset.kind))
    );
    updateCounts();
    applyBackground();
  }

  /* ---------- custom background ---------- */

  function setBackground(cfg) {
    const o = document.getElementById("oat-overlay");
    if (!o) return;
    // Clear any inline overrides first so CSS theme default can apply.
    o.style.background = "";
    o.style.backgroundColor = "";
    o.style.backgroundImage = "";
    o.style.backgroundSize = "";
    o.style.backgroundPosition = "";
    o.style.backgroundRepeat = "";
    if (cfg.bgType === "color" && cfg.bgColor) {
      o.style.backgroundColor = cfg.bgColor;
    } else if (cfg.bgType === "image" && cfg.bgImage) {
      o.style.backgroundColor = "#000";
      o.style.backgroundImage = `url("${cfg.bgImage.replace(/"/g, '\\"')}")`;
      o.style.backgroundSize = "cover";
      o.style.backgroundPosition = "center";
      o.style.backgroundRepeat = "no-repeat";
    }
  }

  function applyBackground() {
    try {
      chrome.storage.local.get(
        { bgType: "default", bgColor: "#0f1419", bgImage: "" },
        setBackground
      );
    } catch (_) {}
  }

  function buildToggle() {
    if (document.getElementById("oat-toggle")) return;
    const t = document.createElement("button");
    t.id = "oat-toggle";
    t.textContent = "🎯 One at a Time";
    t.title = "Review your feed one tweet at a time";
    t.addEventListener("click", start);
    document.body.appendChild(t);
  }

  /* ---------- lifecycle ---------- */

  function onKey(e) {
    if (!state.active) return;
    // Ignore when typing in inputs.
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
    if (e.key === "1") { e.preventDefault(); rate("boo"); }
    else if (e.key === "2") { e.preventDefault(); rate("okay"); }
    else if (e.key === "3") { e.preventDefault(); rate("yay"); }
    else if (e.key === "Escape") { e.preventDefault(); stop(); }
  }

  async function start() {
    if (state.active) return;
    state.active = true;
    // Reset scan markers so we start from what's currently loaded.
    document
      .querySelectorAll("[data-oat-scanned]")
      .forEach((n) => n.removeAttribute("data-oat-scanned"));
    state.queue = [];
    buildOverlay();
    document.getElementById("oat-overlay").classList.add("oat-visible");
    document.documentElement.classList.add("oat-noscroll");
    await showNext();
  }

  function stop() {
    state.active = false;
    state.current = null;
    const o = document.getElementById("oat-overlay");
    if (o) o.classList.remove("oat-visible");
    document.documentElement.classList.remove("oat-noscroll");
  }

  document.addEventListener("keydown", onKey, true);

  // Live-update the background when settings change in the popup.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.bgType || changes.bgColor || changes.bgImage) applyBackground();
    });
  } catch (_) {}

  // Auto-start once, when the timeline first has tweets loaded.
  function maybeAutoStart() {
    let hasStorage = false;
    try {
      hasStorage = !!(chrome && chrome.storage && chrome.storage.local);
    } catch (_) {}
    const run = (autostart) => {
      if (!autostart) return;
      let tries = 0;
      const wait = setInterval(() => {
        tries++;
        if (state.active) { clearInterval(wait); return; }
        if (document.querySelector(TWEET_SELECTOR)) {
          clearInterval(wait);
          start();
        } else if (tries > 40) {
          clearInterval(wait); // ~20s: give up, user can use the button
        }
      }, 500);
    };
    if (hasStorage) {
      chrome.storage.local.get({ autostart: true }, (cfg) => run(cfg.autostart));
    } else {
      run(true);
    }
  }

  // Only run on the home timeline — not on single tweets, profiles, etc.
  function isHomePage() {
    const p = location.pathname;
    return p === "/home" || p === "/";
  }

  function updateForLocation() {
    const home = isHomePage();
    const toggle = document.getElementById("oat-toggle");
    if (toggle) toggle.style.display = home ? "" : "none";
    if (!home && state.active) stop();
  }

  // Wait for the app shell, then add the toggle button + arm auto-start.
  const boot = setInterval(() => {
    if (document.body) {
      buildToggle();
      updateForLocation();
      if (isHomePage()) maybeAutoStart();
      clearInterval(boot);
    }
  }, 500);

  // X is a single-page app: react to client-side route changes.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      updateForLocation();
    }
  }, 600);
})();
