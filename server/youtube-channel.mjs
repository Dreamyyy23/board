const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_PATTERN =
  /^[\p{L}\p{N}][\p{L}\p{N}._-]{1,28}[\p{L}\p{N}]$/u;
const USERNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,99}$/u;

export class YouTubeChannelError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = "YouTubeChannelError";
    this.code = code;
    this.status = status;
  }
}

export const YOUTUBE_BRAND_PROFILES = Object.freeze({
  inkblot: Object.freeze({
    id: "inkblot",
    label: "Inkblot",
    motif: "mirrored ink, ivory paper, oxblood seals",
    background: "#070706",
    surface: "#151311",
    accent: "#f1eadc",
    signal: "#9e252a",
  }),
  fateweaver: Object.freeze({
    id: "fateweaver",
    label: "Fateweaver",
    motif: "golden threads, cyan apertures, black lacquer",
    background: "#040706",
    surface: "#101512",
    accent: "#e7bf64",
    signal: "#52d9db",
  }),
  chromed: Object.freeze({
    id: "chromed",
    label: "Chromed",
    motif: "liquid chrome, sakura light, spectral cyan",
    background: "#080711",
    surface: "#15121e",
    accent: "#f08acb",
    signal: "#82e4ef",
  }),
  signal: Object.freeze({
    id: "signal",
    label: "Unclaimed Signal",
    motif: "dark glass, foxfire gold, broadcast static",
    background: "#070806",
    surface: "#12140f",
    accent: "#d9b85d",
    signal: "#8ad9ba",
  }),
});

export const BRAND_PROFILES = YOUTUBE_BRAND_PROFILES;

export const KNOWN_YOUTUBE_CHANNELS = Object.freeze({
  margaretworldfoxy: Object.freeze({
    handle: "MargaretWorldFoxy",
    channelId: "UCmlIqzQ7HbwimlrfTWo8-9A",
    title: "Margaret World",
    brand: "inkblot",
  }),
  eleanorjames09: Object.freeze({
    handle: "EleanorJames09",
    channelId: "UCXLGXox9ScYvpgLs7QheWjA",
    title: "Eleanor James",
    brand: "fateweaver",
  }),
  "melodysakura-x": Object.freeze({
    handle: "MelodySakura-x",
    channelId: "UCejSfUuV_CWEy1IMgzmdL0A",
    title: "Expeditioner Melody",
    brand: "chromed",
  }),
  foxyalchemystudio: Object.freeze({
    handle: "FoxyAlchemyStudio",
    channelId: null,
    title: "Foxy Alchemy Studio",
    brand: "signal",
  }),
});

function fail(message, code = "INVALID_YOUTUBE_URL", status = 400) {
  throw new YouTubeChannelError(message, code, status);
}

function decodePathPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    fail("The YouTube channel URL contains invalid path encoding.");
  }
}

function canonicalUrl(kind, value) {
  if (kind === "handle") {
    return `https://www.youtube.com/@${encodeURIComponent(value)}`;
  }
  if (kind === "channel") {
    return `https://www.youtube.com/channel/${value}`;
  }
  return `https://www.youtube.com/user/${encodeURIComponent(value)}`;
}

export function parseYouTubeChannelUrl(input) {
  if (typeof input !== "string" || input.trim().length === 0) {
    fail("Enter a YouTube channel URL.");
  }

  const raw = input.trim();
  if (raw.length > 512) {
    fail("The YouTube channel URL is too long.");
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("Enter a complete https:// YouTube channel URL.");
  }

  if (
    url.protocol !== "https:" ||
    !YOUTUBE_HOSTS.has(url.hostname.toLowerCase()) ||
    url.port ||
    url.username ||
    url.password
  ) {
    fail("Only secure youtube.com channel URLs are accepted.");
  }
  if (url.search || url.hash) {
    fail("Remove query parameters and fragments from the YouTube channel URL.");
  }

  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  if (pathname.includes("//")) {
    fail("The YouTube channel URL has an invalid path.");
  }

  const parts = pathname
    .split("/")
    .slice(1)
    .map((part) => decodePathPart(part));

  let kind;
  let value;
  if (parts.length === 1 && parts[0].startsWith("@")) {
    kind = "handle";
    value = parts[0].slice(1);
    if (
      !HANDLE_PATTERN.test(value) ||
      Array.from(value).length < 3 ||
      Array.from(value).length > 30
    ) {
      fail("The YouTube handle in that URL is invalid.");
    }
  } else if (parts.length === 2 && parts[0] === "channel") {
    kind = "channel";
    value = parts[1];
    if (!CHANNEL_ID_PATTERN.test(value)) {
      fail("The YouTube channel ID in that URL is invalid.");
    }
  } else if (parts.length === 2 && parts[0] === "user") {
    kind = "user";
    value = parts[1];
    if (!USERNAME_PATTERN.test(value)) {
      fail("The legacy YouTube username in that URL is invalid.");
    }
  } else {
    fail(
      "Use a YouTube /@handle, /channel/UC… or legacy /user/name channel URL.",
    );
  }

  return Object.freeze({
    kind,
    value,
    canonicalUrl: canonicalUrl(kind, value),
  });
}

function knownChannelFor(parsed) {
  if (parsed.kind === "handle") {
    return KNOWN_YOUTUBE_CHANNELS[parsed.value.toLowerCase()] ?? null;
  }
  if (parsed.kind === "channel") {
    return (
      Object.values(KNOWN_YOUTUBE_CHANNELS).find(
        (channel) => channel.channelId === parsed.value,
      ) ?? null
    );
  }
  return null;
}

function profileFor(parsed, known, apiChannel = null) {
  if (known) return known.brand;

  const customUrl = apiChannel?.snippet?.customUrl;
  if (typeof customUrl === "string") {
    const key = customUrl.replace(/^@/, "").toLowerCase();
    if (KNOWN_YOUTUBE_CHANNELS[key]) {
      return KNOWN_YOUTUBE_CHANNELS[key].brand;
    }
  }
  if (parsed.kind === "handle") {
    return KNOWN_YOUTUBE_CHANNELS[parsed.value.toLowerCase()]?.brand ?? "signal";
  }
  return "signal";
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    fail(
      "This server cannot reach YouTube because no fetch implementation is available.",
      "YOUTUBE_FETCH_UNAVAILABLE",
      503,
    );
  }
  return fetchImpl;
}

async function fetchJson(url, fetchImpl, operation) {
  let response;
  try {
    response = await requireFetch(fetchImpl)(url, {
      headers: { Accept: "application/json" },
    });
  } catch {
    fail(
      `YouTube did not answer while ${operation}.`,
      "YOUTUBE_API_UNAVAILABLE",
      502,
    );
  }
  if (!response.ok) {
    fail(
      `YouTube rejected the request while ${operation} (HTTP ${response.status}).`,
      "YOUTUBE_API_ERROR",
      502,
    );
  }
  try {
    return await response.json();
  } catch {
    fail(
      `YouTube returned an unreadable response while ${operation}.`,
      "YOUTUBE_API_ERROR",
      502,
    );
  }
}

function apiUrl(resource, apiKey, parameters) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("key", apiKey);
  return url;
}

function bestThumbnail(thumbnails) {
  if (!thumbnails || typeof thumbnails !== "object") return null;
  for (const key of ["maxres", "standard", "high", "medium", "default"]) {
    if (typeof thumbnails[key]?.url === "string") {
      return thumbnails[key].url;
    }
  }
  return null;
}

function cleanTitle(value, fallback) {
  if (typeof value !== "string") return fallback;
  const title = value.replace(/\s+/g, " ").trim();
  return title ? title.slice(0, 240) : fallback;
}

function apiVideo(item) {
  const id = item?.id;
  const status = item?.status;
  if (
    !VIDEO_ID_PATTERN.test(id ?? "") ||
    status?.privacyStatus !== "public" ||
    status?.embeddable !== true ||
    (status?.uploadStatus && status.uploadStatus !== "processed")
  ) {
    return null;
  }
  return Object.freeze({
    id,
    title: cleanTitle(item.snippet?.title, "Untitled transmission"),
    publishedAt: item.snippet?.publishedAt ?? null,
    thumbnailUrl:
      bestThumbnail(item.snippet?.thumbnails) ??
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${id}`,
  });
}

async function resolveWithApi(parsed, known, apiKey, fetchImpl, maxVideos) {
  const channelParameters = {
    part: "snippet,contentDetails,status",
    maxResults: 1,
  };
  if (parsed.kind === "handle") {
    channelParameters.forHandle = `@${parsed.value}`;
  } else if (parsed.kind === "channel") {
    channelParameters.id = parsed.value;
  } else {
    channelParameters.forUsername = parsed.value;
  }

  const channelData = await fetchJson(
    apiUrl("channels", apiKey, channelParameters),
    fetchImpl,
    "resolving the channel",
  );
  const channel = channelData?.items?.[0];
  if (!channel?.id) {
    fail(
      "No public YouTube channel exists at that URL.",
      "YOUTUBE_CHANNEL_NOT_FOUND",
      404,
    );
  }
  if (
    channel.status?.privacyStatus &&
    channel.status.privacyStatus !== "public"
  ) {
    fail(
      "That YouTube channel is not public.",
      "YOUTUBE_CHANNEL_PRIVATE",
      404,
    );
  }

  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) {
    fail(
      "That YouTube channel does not expose an uploads playlist.",
      "YOUTUBE_CHANNEL_EMPTY",
      422,
    );
  }

  const videos = [];
  const seen = new Set();
  let pageToken;
  let pages = 0;

  while (videos.length < maxVideos && pages < 20) {
    const playlistData = await fetchJson(
      apiUrl("playlistItems", apiKey, {
        part: "snippet,contentDetails,status",
        playlistId: uploads,
        maxResults: 50,
        pageToken,
      }),
      fetchImpl,
      "reading the channel uploads",
    );
    pages += 1;

    const ids = [];
    for (const item of playlistData?.items ?? []) {
      const id =
        item?.contentDetails?.videoId ?? item?.snippet?.resourceId?.videoId;
      if (VIDEO_ID_PATTERN.test(id ?? "") && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }

    for (let offset = 0; offset < ids.length; offset += 50) {
      const batch = ids.slice(offset, offset + 50);
      const videoData = await fetchJson(
        apiUrl("videos", apiKey, {
          part: "snippet,status",
          id: batch.join(","),
          maxResults: 50,
        }),
        fetchImpl,
        "checking which uploads can be embedded",
      );
      const byId = new Map(
        (videoData?.items ?? []).map((item) => [item.id, item]),
      );
      for (const id of batch) {
        const video = apiVideo(byId.get(id));
        if (video) videos.push(video);
        if (videos.length >= maxVideos) break;
      }
      if (videos.length >= maxVideos) break;
    }

    pageToken = playlistData?.nextPageToken;
    if (!pageToken) break;
  }

  if (videos.length === 0) {
    fail(
      "That channel has no public, embeddable uploads.",
      "YOUTUBE_CHANNEL_EMPTY",
      422,
    );
  }

  const customUrl = channel.snippet?.customUrl;
  const channelUrl =
    typeof customUrl === "string" && customUrl.startsWith("@")
      ? `https://www.youtube.com/${customUrl}`
      : `https://www.youtube.com/channel/${channel.id}`;

  return Object.freeze({
    channelId: channel.id,
    channelUrl,
    channelTitle: cleanTitle(
      channel.snippet?.title,
      known?.title ?? "YouTube channel",
    ),
    brand: profileFor(parsed, known, channel),
    resolution: "youtube-api",
    videos: Object.freeze(videos),
  });
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCodePoint(Number(code)),
    );
}

function tagValue(xml, tag) {
  const match = xml.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"),
  );
  return match ? decodeXml(match[1]).trim() : null;
}

function rssVideos(xml) {
  const entries = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ?? [];
  const videos = [];
  const seen = new Set();

  for (const entry of entries) {
    const id = tagValue(entry, "yt:videoId");
    if (!VIDEO_ID_PATTERN.test(id ?? "") || seen.has(id)) continue;
    seen.add(id);
    const thumbnail = entry.match(
      /<media:thumbnail\b[^>]*\burl=(?:"([^"]+)"|'([^']+)')/i,
    );
    videos.push(
      Object.freeze({
        id,
        title: cleanTitle(
          tagValue(entry, "title"),
          "Untitled transmission",
        ),
        publishedAt: tagValue(entry, "published"),
        thumbnailUrl: thumbnail
          ? decodeXml(thumbnail[1] ?? thumbnail[2])
          : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${id}`,
      }),
    );
  }
  return videos;
}

async function resolveWithRss(
  parsed,
  known,
  channelId,
  fetchImpl,
  maxVideos,
) {
  const url = new URL("https://www.youtube.com/feeds/videos.xml");
  url.searchParams.set("channel_id", channelId);

  let response;
  try {
    response = await requireFetch(fetchImpl)(url, {
      headers: {
        Accept: "application/atom+xml, application/xml, text/xml",
      },
    });
  } catch {
    fail(
      "The YouTube channel feed is temporarily unreachable.",
      "YOUTUBE_FEED_UNAVAILABLE",
      502,
    );
  }
  if (!response.ok) {
    if (response.status === 404) {
      fail(
        "No public YouTube channel exists at that URL.",
        "YOUTUBE_CHANNEL_NOT_FOUND",
        404,
      );
    }
    fail(
      `The YouTube channel feed returned HTTP ${response.status}.`,
      "YOUTUBE_FEED_ERROR",
      502,
    );
  }

  let xml;
  try {
    xml = await response.text();
  } catch {
    fail(
      "The YouTube channel feed could not be read.",
      "YOUTUBE_FEED_ERROR",
      502,
    );
  }

  const videos = rssVideos(xml).slice(0, maxVideos);
  if (videos.length === 0) {
    fail(
      "That channel has no public uploads in its feed.",
      "YOUTUBE_CHANNEL_EMPTY",
      422,
    );
  }

  const feedTitle = tagValue(xml.split(/<entry\b/i)[0], "title");
  return Object.freeze({
    channelId,
    channelUrl:
      parsed.kind === "handle"
        ? parsed.canonicalUrl
        : `https://www.youtube.com/channel/${channelId}`,
    channelTitle: cleanTitle(
      feedTitle,
      known?.title ?? "YouTube channel",
    ),
    brand: profileFor(parsed, known),
    resolution: "youtube-rss",
    videos: Object.freeze(videos),
  });
}

async function discoverChannelIdFromPublicPage(parsed, fetchImpl) {
  if (typeof fetchImpl !== "function") return null;

  let response;
  try {
    response = await fetchImpl(parsed.canonicalUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.8",
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let html;
  try {
    html = await response.text();
  } catch {
    return null;
  }

  const patterns = [
    /"channelId":"(UC[A-Za-z0-9_-]{22})"/,
    /"externalId":"(UC[A-Za-z0-9_-]{22})"/,
    /"browseId":"(UC[A-Za-z0-9_-]{22})"/,
    /itemprop=["']channelId["'][^>]+content=["'](UC[A-Za-z0-9_-]{22})["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && CHANNEL_ID_PATTERN.test(match[1])) return match[1];
  }
  return null;
}

function catalogRecord(bundledCatalog, parsed, known) {
  if (!bundledCatalog) return null;
  if (Array.isArray(bundledCatalog)) {
    return { videos: bundledCatalog };
  }
  if (Array.isArray(bundledCatalog.videos)) {
    return bundledCatalog;
  }

  const keys = [
    parsed.canonicalUrl,
    parsed.value,
    parsed.value.toLowerCase(),
    known?.handle,
    known?.handle?.toLowerCase(),
    known?.channelId,
  ].filter(Boolean);
  for (const key of keys) {
    const candidate = bundledCatalog[key];
    if (Array.isArray(candidate)) return { videos: candidate };
    if (Array.isArray(candidate?.videos)) return candidate;
  }
  return null;
}

function bundledVideos(record) {
  const videos = [];
  const seen = new Set();
  for (const [index, entry] of (record?.videos ?? []).entries()) {
    const id = typeof entry === "string" ? entry : entry?.id ?? entry?.videoId;
    if (!VIDEO_ID_PATTERN.test(id ?? "") || seen.has(id)) continue;
    seen.add(id);
    videos.push(
      Object.freeze({
        id,
        title: cleanTitle(
          typeof entry === "object" ? entry.title : null,
          `Transmission ${String(index + 1).padStart(2, "0")}`,
        ),
        publishedAt:
          typeof entry === "object" ? entry.publishedAt ?? null : null,
        thumbnailUrl:
          (typeof entry === "object" && entry.thumbnailUrl) ||
          `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${id}`,
      }),
    );
  }
  return videos;
}

function resolveWithBundle(parsed, known, record, maxVideos) {
  const videos = bundledVideos(record).slice(0, maxVideos);
  if (videos.length === 0) {
    fail(
      "The bundled channel catalog has no valid video IDs.",
      "YOUTUBE_CHANNEL_EMPTY",
      422,
    );
  }
  const channelId =
    record.channelId ?? known?.channelId ?? (parsed.kind === "channel"
      ? parsed.value
      : null);
  return Object.freeze({
    channelId,
    channelUrl: parsed.canonicalUrl,
    channelTitle: cleanTitle(
      record.title,
      known?.title ?? "YouTube channel",
    ),
    brand:
      record.brand && YOUTUBE_BRAND_PROFILES[record.brand]
        ? record.brand
        : profileFor(parsed, known),
    resolution: "bundled-catalog",
    videos: Object.freeze(videos),
  });
}

/**
 * Resolve a channel URL into a server-owned, serializable video catalog.
 *
 * `apiKey` is accepted only as an argument so this module never reads or
 * serializes a server secret. Without a key, known handles and direct channel
 * IDs use YouTube's public Atom feed. `bundledCatalog` is an explicit offline
 * fallback, primarily for a curated Foxy Alchemy catalog.
 */
export async function resolveYouTubeChannel(
  input,
  {
    apiKey,
    fetchImpl = globalThis.fetch,
    bundledCatalog = null,
    maxVideos = 200,
  } = {},
) {
  const parsed = parseYouTubeChannelUrl(input);
  const known = knownChannelFor(parsed);
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(maxVideos)) || 200));
  const bundle = catalogRecord(bundledCatalog, parsed, known);

  if (typeof apiKey === "string" && apiKey.trim()) {
    return resolveWithApi(parsed, known, apiKey.trim(), fetchImpl, limit);
  }

  let channelId =
    parsed.kind === "channel" ? parsed.value : known?.channelId ?? null;
  if (!channelId && bundle) {
    return resolveWithBundle(parsed, known, bundle, limit);
  }
  if (!channelId) {
    channelId = await discoverChannelIdFromPublicPage(parsed, fetchImpl);
  }
  if (channelId) {
    try {
      return await resolveWithRss(
        parsed,
        known,
        channelId,
        fetchImpl,
        limit,
      );
    } catch (error) {
      if (bundle) {
        return resolveWithBundle(parsed, known, bundle, limit);
      }
      throw error;
    }
  }

  fail(
    parsed.kind === "user"
      ? "This server could not resolve that legacy /user/ URL. Configure a YouTube Data API key or use the channel's /@handle URL."
      : "This server could not resolve that handle. Configure a YouTube Data API key or use a /channel/UC… URL.",
    "YOUTUBE_API_KEY_REQUIRED",
    422,
  );
}
