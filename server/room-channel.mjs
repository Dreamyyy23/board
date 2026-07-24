import {
  DEFAULT_YOUTUBE_CHANNEL,
  FOXY_ALCHEMY_TITLES,
  FOXY_ALCHEMY_VIDEOS,
} from "./game-core.mjs";
import {
  parseYouTubeChannelUrl,
  resolveYouTubeChannel,
} from "./youtube-channel.mjs";

const FOXY_ALCHEMY_BUNDLE = Object.freeze({
  title: DEFAULT_YOUTUBE_CHANNEL.title,
  channelId: DEFAULT_YOUTUBE_CHANNEL.id,
  brand: "signal",
  videos: FOXY_ALCHEMY_VIDEOS.map((id, index) => ({
    id,
    title:
      FOXY_ALCHEMY_TITLES[id] ||
      `Foxy Alchemy transmission ${String(index + 1).padStart(2, "0")}`,
  })),
});

const BUNDLED_CATALOGS = Object.freeze({
  [DEFAULT_YOUTUBE_CHANNEL.url]: FOXY_ALCHEMY_BUNDLE,
  FoxyAlchemyStudio: FOXY_ALCHEMY_BUNDLE,
  foxyalchemystudio: FOXY_ALCHEMY_BUNDLE,
});

export async function resolveRoomChannel(
  input = DEFAULT_YOUTUBE_CHANNEL.url,
  {
    apiKey,
    fetchImpl = globalThis.fetch,
    now = Date.now(),
    maxVideos = 200,
  } = {},
) {
  const source = await resolveYouTubeChannel(
    input || DEFAULT_YOUTUBE_CHANNEL.url,
    {
      apiKey,
      fetchImpl,
      bundledCatalog: BUNDLED_CATALOGS,
      maxVideos,
    },
  );
  const parsed = parseYouTubeChannelUrl(input || DEFAULT_YOUTUBE_CHANNEL.url);

  return {
    id: source.channelId,
    title: source.channelTitle,
    handle: parsed.kind === "handle" ? `@${parsed.value}` : null,
    url: source.channelUrl,
    brand: source.brand,
    source: source.resolution,
    fetchedAt: now,
    videos: source.videos.map((video) => ({
      id: video.id,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      publishedAt: video.publishedAt,
    })),
  };
}
