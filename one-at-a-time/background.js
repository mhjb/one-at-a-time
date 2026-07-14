/* Background service worker.
 * Fetches a tweet's media (mp4 variants) from X's public syndication endpoint.
 * Done here (not in the content script) so host_permissions bypass CORS.
 */

// Token algorithm used by X's own embed/react-tweet library.
function makeToken(id) {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, "");
}

async function fetchMedia(id) {
  const token = makeToken(id);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}&lang=en`;
  const res = await fetch(url);
  if (!res.ok) return { error: "status " + res.status };
  const j = await res.json();

  const media = (j.mediaDetails || [])
    .filter((m) => m.video_info && Array.isArray(m.video_info.variants))
    .map((m) => {
      const mp4s = m.video_info.variants
        .filter((v) => v.content_type === "video/mp4")
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      return { type: m.type, poster: m.media_url_https, url: mp4s[0] && mp4s[0].url };
    })
    .filter((m) => m.url);

  return { media };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "oat-fetch-media" && msg.id) {
    fetchMedia(String(msg.id))
      .then(sendResponse)
      .catch((e) => sendResponse({ error: String(e) }));
    return true; // keep the channel open for the async response
  }
});
