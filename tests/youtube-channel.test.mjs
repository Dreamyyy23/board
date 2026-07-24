import assert from "node:assert/strict";
import test from "node:test";
import {
  KNOWN_YOUTUBE_CHANNELS,
  YOUTUBE_BRAND_PROFILES,
  YouTubeChannelError,
  parseYouTubeChannelUrl,
  resolveYouTubeChannel,
} from "../server/youtube-channel.mjs";

const CHANNEL_ID = "UCabcdefghijklmnopqrstuv";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function textResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    },
  };
}

test("strictly parses supported YouTube channel URL shapes", () => {
  assert.deepEqual(
    parseYouTubeChannelUrl(
      "https://m.youtube.com/@MargaretWorldFoxy/",
    ),
    {
      kind: "handle",
      value: "MargaretWorldFoxy",
      canonicalUrl: "https://www.youtube.com/@MargaretWorldFoxy",
    },
  );
  assert.deepEqual(
    parseYouTubeChannelUrl(`https://youtube.com/channel/${CHANNEL_ID}`),
    {
      kind: "channel",
      value: CHANNEL_ID,
      canonicalUrl: `https://www.youtube.com/channel/${CHANNEL_ID}`,
    },
  );
  assert.deepEqual(
    parseYouTubeChannelUrl("https://www.youtube.com/user/Foxy_Legacy"),
    {
      kind: "user",
      value: "Foxy_Legacy",
      canonicalUrl: "https://www.youtube.com/user/Foxy_Legacy",
    },
  );
});

test("rejects spoofed hosts, insecure links, videos, tabs and URL decoration", () => {
  for (const input of [
    "https://youtube.com.evil.example/@MargaretWorldFoxy",
    "http://youtube.com/@MargaretWorldFoxy",
    "https://youtu.be/AAAABBBB001",
    "https://youtube.com/watch?v=AAAABBBB001",
    "https://youtube.com/@MargaretWorldFoxy/videos",
    "https://youtube.com/@MargaretWorldFoxy?feature=shared",
    "https://youtube.com/@ab",
    "https://youtube.com/channel/UCtoo-short",
  ]) {
    assert.throws(
      () => parseYouTubeChannelUrl(input),
      (error) =>
        error instanceof YouTubeChannelError &&
        error.code === "INVALID_YOUTUBE_URL",
      input,
    );
  }
});

test("exports complete visual identities for all channel modes", () => {
  assert.equal(
    KNOWN_YOUTUBE_CHANNELS.margaretworldfoxy.brand,
    "inkblot",
  );
  assert.equal(
    KNOWN_YOUTUBE_CHANNELS.eleanorjames09.brand,
    "fateweaver",
  );
  assert.equal(
    KNOWN_YOUTUBE_CHANNELS["melodysakura-x"].brand,
    "chromed",
  );
  for (const id of ["inkblot", "fateweaver", "chromed", "signal"]) {
    assert.equal(YOUTUBE_BRAND_PROFILES[id].id, id);
    assert.match(YOUTUBE_BRAND_PROFILES[id].accent, /^#[0-9a-f]{6}$/i);
  }
});

test("uses the official API, paginates uploads, and keeps only public embeddable videos", async () => {
  const calls = [];
  const apiItems = {
    AAAABBBB001: {
      id: "AAAABBBB001",
      snippet: {
        title: "First public signal",
        publishedAt: "2026-07-01T00:00:00Z",
        thumbnails: { high: { url: "https://img.example/one.jpg" } },
      },
      status: {
        privacyStatus: "public",
        embeddable: true,
        uploadStatus: "processed",
      },
    },
    AAAABBBB002: {
      id: "AAAABBBB002",
      snippet: { title: "Private signal" },
      status: {
        privacyStatus: "private",
        embeddable: true,
        uploadStatus: "processed",
      },
    },
    AAAABBBB003: {
      id: "AAAABBBB003",
      snippet: { title: "Second public signal" },
      status: {
        privacyStatus: "public",
        embeddable: true,
        uploadStatus: "processed",
      },
    },
    AAAABBBB004: {
      id: "AAAABBBB004",
      snippet: { title: "Embedding disabled" },
      status: {
        privacyStatus: "public",
        embeddable: false,
        uploadStatus: "processed",
      },
    },
  };

  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    assert.equal(url.searchParams.get("key"), "server-secret");

    if (url.pathname.endsWith("/channels")) {
      assert.equal(url.searchParams.get("forHandle"), "@MargaretWorldFoxy");
      return jsonResponse({
        items: [
          {
            id: KNOWN_YOUTUBE_CHANNELS.margaretworldfoxy.channelId,
            snippet: {
              title: "Margaret World",
              customUrl: "@MargaretWorldFoxy",
            },
            contentDetails: {
              relatedPlaylists: { uploads: "UU-margaret-uploads" },
            },
            status: { privacyStatus: "public" },
          },
        ],
      });
    }

    if (url.pathname.endsWith("/playlistItems")) {
      assert.equal(url.searchParams.get("playlistId"), "UU-margaret-uploads");
      if (!url.searchParams.get("pageToken")) {
        return jsonResponse({
          nextPageToken: "NEXT",
          items: [
            { contentDetails: { videoId: "AAAABBBB001" } },
            { contentDetails: { videoId: "AAAABBBB002" } },
          ],
        });
      }
      assert.equal(url.searchParams.get("pageToken"), "NEXT");
      return jsonResponse({
        items: [
          { contentDetails: { videoId: "AAAABBBB003" } },
          { contentDetails: { videoId: "AAAABBBB004" } },
        ],
      });
    }

    if (url.pathname.endsWith("/videos")) {
      const ids = url.searchParams.get("id").split(",");
      return jsonResponse({ items: ids.map((id) => apiItems[id]) });
    }

    throw new Error(`Unexpected request path: ${url.pathname}`);
  };

  const source = await resolveYouTubeChannel(
    "https://www.youtube.com/@MargaretWorldFoxy",
    {
      apiKey: "server-secret",
      fetchImpl,
      maxVideos: 10,
    },
  );

  assert.equal(source.channelTitle, "Margaret World");
  assert.equal(source.brand, "inkblot");
  assert.equal(source.resolution, "youtube-api");
  assert.deepEqual(
    source.videos.map((video) => video.id),
    ["AAAABBBB001", "AAAABBBB003"],
  );
  assert.equal(source.videos[0].thumbnailUrl, "https://img.example/one.jpg");
  assert.equal(calls.filter((url) => url.pathname.endsWith("/playlistItems")).length, 2);
  assert.equal(calls.filter((url) => url.pathname.endsWith("/videos")).length, 2);
  assert.equal(JSON.stringify(source).includes("server-secret"), false);
});

test("resolves a known handle through its official channel RSS feed without an API key", async () => {
  const seen = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    seen.push(url);
    return textResponse(`<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
            xmlns:media="http://search.yahoo.com/mrss/">
        <title>Margaret &amp; Foxy</title>
        <entry>
          <yt:videoId>AAAABBBB001</yt:videoId>
          <title>Ink &amp; Bone</title>
          <published>2026-07-01T00:00:00Z</published>
          <media:group>
            <media:thumbnail url="https://img.example/ink.jpg"/>
          </media:group>
        </entry>
      </feed>`);
  };

  const source = await resolveYouTubeChannel(
    "https://youtube.com/@MargaretWorldFoxy",
    { fetchImpl },
  );

  assert.equal(
    seen[0].searchParams.get("channel_id"),
    "UCmlIqzQ7HbwimlrfTWo8-9A",
  );
  assert.equal(source.channelTitle, "Margaret & Foxy");
  assert.equal(source.brand, "inkblot");
  assert.equal(source.resolution, "youtube-rss");
  assert.deepEqual(source.videos[0], {
    id: "AAAABBBB001",
    title: "Ink & Bone",
    publishedAt: "2026-07-01T00:00:00Z",
    thumbnailUrl: "https://img.example/ink.jpg",
    url: "https://www.youtube.com/watch?v=AAAABBBB001",
  });
});

test("uses RSS directly for a /channel/ ID when no API key is supplied", async () => {
  let requestedChannelId = null;
  const source = await resolveYouTubeChannel(
    `https://www.youtube.com/channel/${CHANNEL_ID}`,
    {
      fetchImpl: async (input) => {
        requestedChannelId = new URL(String(input)).searchParams.get(
          "channel_id",
        );
        return textResponse(`<feed xmlns:yt="urn:yt">
          <title>Direct Signal</title>
          <entry>
            <yt:videoId>AAAABBBB003</yt:videoId>
            <title>Direct upload</title>
          </entry>
        </feed>`);
      },
    },
  );

  assert.equal(requestedChannelId, CHANNEL_ID);
  assert.equal(source.channelId, CHANNEL_ID);
  assert.equal(source.channelTitle, "Direct Signal");
  assert.equal(source.brand, "signal");
});

test("discovers an arbitrary handle channel ID before reading its RSS feed", async () => {
  const calls = [];
  const source = await resolveYouTubeChannel(
    "https://www.youtube.com/@FreshFoxyChannel",
    {
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        calls.push(url);
        if (url.pathname === "/@FreshFoxyChannel") {
          return textResponse(
            `<html><script>{"externalId":"${CHANNEL_ID}"}</script></html>`,
          );
        }
        assert.equal(url.pathname, "/feeds/videos.xml");
        assert.equal(url.searchParams.get("channel_id"), CHANNEL_ID);
        return textResponse(`<feed xmlns:yt="urn:yt">
          <title>Fresh Foxy Channel</title>
          <entry>
            <yt:videoId>AAAABBBB004</yt:videoId>
            <title>A newly found signal</title>
          </entry>
        </feed>`);
      },
    },
  );

  assert.equal(calls.length, 2);
  assert.equal(source.channelId, CHANNEL_ID);
  assert.equal(source.channelTitle, "Fresh Foxy Channel");
  assert.equal(source.videos[0].id, "AAAABBBB004");
});

test("supports an explicit bundled catalog for the curated Foxy Alchemy source", async () => {
  const source = await resolveYouTubeChannel(
    "https://www.youtube.com/@FoxyAlchemyStudio",
    {
      fetchImpl: null,
      bundledCatalog: {
        title: "Foxy Alchemy Studio",
        videos: [
          { id: "AAAABBBB001", title: "The first archive" },
          "AAAABBBB003",
          "not-a-video-id",
        ],
      },
    },
  );

  assert.equal(source.resolution, "bundled-catalog");
  assert.equal(source.brand, "signal");
  assert.deepEqual(
    source.videos.map((video) => video.id),
    ["AAAABBBB001", "AAAABBBB003"],
  );
});

test("returns clear no-key and empty-channel errors", async () => {
  await assert.rejects(
    resolveYouTubeChannel("https://youtube.com/@SomeUnknownChannel", {
      fetchImpl: null,
    }),
    (error) =>
      error instanceof YouTubeChannelError &&
      error.code === "YOUTUBE_API_KEY_REQUIRED" &&
      /API key/i.test(error.message),
  );

  await assert.rejects(
    resolveYouTubeChannel("https://youtube.com/user/OldFoxyChannel", {
      fetchImpl: null,
    }),
    (error) =>
      error instanceof YouTubeChannelError &&
      error.code === "YOUTUBE_API_KEY_REQUIRED" &&
      /legacy/i.test(error.message),
  );

  await assert.rejects(
    resolveYouTubeChannel(`https://youtube.com/channel/${CHANNEL_ID}`, {
      fetchImpl: async () => textResponse("<feed><title>Empty</title></feed>"),
    }),
    (error) =>
      error instanceof YouTubeChannelError &&
      error.code === "YOUTUBE_CHANNEL_EMPTY" &&
      /no public uploads/i.test(error.message),
  );
});
