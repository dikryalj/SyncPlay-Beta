/**
 * urlParser.ts
 * Universal track URL parser for SyncPlay.
 *
 * Supported sources:
 *  - YouTube  → oEmbed metadata fetch, iframe embed URL for playback
 *  - Spotify  → 30-second preview via public track endpoint
 *  - Direct   → any URL ending in a supported audio extension or serving audio/* content-type
 */

export type TrackSource = "youtube" | "spotify" | "direct";

export interface ParsedTrack {
  /** Unique id derived from URL */
  id: string;
  title: string;
  artist: string;
  /** Duration in seconds. 0 means unknown (e.g. YouTube — duration not in oEmbed). */
  duration: number;
  /** Playback URL. For YouTube this is the nocookie embed URL. */
  url: string;
  /** Raw original URL entered by the user */
  originalUrl: string;
  source: TrackSource;
  /** Thumbnail / album-art image URL */
  thumbnailUrl?: string;
  /** Cover alias for AudioPlayer compatibility */
  coverUrl?: string;
}

export type ParseError =
  | "INVALID_URL"
  | "UNSUPPORTED_SOURCE"
  | "FETCH_FAILED"
  | "EMPTY_URL"
  | "PLAYLIST_NO_API_KEY"
  | "PLAYLIST_FETCH_FAILED";

export interface ParseResult {
  ok: true;
  track: ParsedTrack;
}

export interface PlaylistResult {
  ok: true;
  playlist: true;
  tracks: ParsedTrack[];
  listId: string;
}

export interface ParseFailure {
  ok: false;
  error: ParseError;
  message: string;
}

export type ParseOutcome = ParseResult | ParseFailure;
export type ParseAnyOutcome = ParseOutcome | PlaylistResult;

// ── Helpers ─────────────────────────────────────────────────────────────────

const AUDIO_EXTENSIONS = /\.(mp3|ogg|wav|flac|m4a|aac|opus|webm)(\?.*)?$/i;

function generateId(url: string): string {
  // Simple deterministic short id from URL
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = (h * 33) ^ url.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

// ── YouTube ──────────────────────────────────────────────────────────────────

const YT_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=|youtu\.be\/)([\w-]{11})/,
  /youtube\.com\/embed\/([\w-]{11})/,
  /youtube\.com\/shorts\/([\w-]{11})/,
];

function extractYouTubeId(url: string): string | null {
  for (const pat of YT_PATTERNS) {
    const m = url.match(pat);
    if (m) return m[1];
  }
  return null;
}

function extractPlaylistId(url: string): string | null {
  const u = safeUrl(url);
  if (!u) return null;
  const list = u.searchParams.get("list");
  // Ignore auto-generated mix playlists (RD...)
  if (!list || list.startsWith("RD")) return null;
  return list;
}

/**
 * Fetch all video IDs in a YouTube playlist via the Data API v3.
 * Requires YOUTUBE_API_KEY environment variable.
 * Handles pagination automatically (up to 200 videos).
 */
async function parseYouTubePlaylist(
  listId: string,
  requestedBy: string
): Promise<PlaylistResult | ParseFailure> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "PLAYLIST_NO_API_KEY",
      message:
        "YouTube playlist ingestion requires a YOUTUBE_API_KEY environment variable. " +
        "Get one at console.cloud.google.com and enable the YouTube Data API v3.",
    };
  }

  const tracks: ParsedTrack[] = [];
  let pageToken: string | undefined;
  let page = 0;
  const MAX_PAGES = 4; // cap at 200 videos (4 × 50)

  try {
    do {
      const qs = new URLSearchParams({
        part:       "snippet",
        playlistId: listId,
        maxResults: "50",
        key:        apiKey,
        ...(pageToken ? { pageToken } : {}),
      });
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?${qs}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}`);

      const data = await res.json() as {
        nextPageToken?: string;
        items: Array<{
          snippet: {
            title:      string;
            channelTitle: string;
            resourceId: { videoId: string };
            thumbnails?: { medium?: { url: string } };
          };
        }>;
      };

      for (const item of data.items ?? []) {
        const videoId = item.snippet.resourceId.videoId;
        if (!videoId) continue;
        const embedUrl  = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
        const thumb     = item.snippet.thumbnails?.medium?.url;
        tracks.push({
          id:           videoId,
          title:        item.snippet.title ?? `YouTube — ${videoId}`,
          artist:       item.snippet.channelTitle
            ? `${item.snippet.channelTitle} · added by ${requestedBy}`
            : `Added by ${requestedBy}`,
          duration:     0,
          url:          embedUrl,
          originalUrl:  `https://www.youtube.com/watch?v=${videoId}`,
          source:       "youtube" as TrackSource,
          thumbnailUrl: thumb,
          coverUrl:     thumb,
        });
      }

      pageToken = data.nextPageToken;
      page++;
    } while (pageToken && page < MAX_PAGES);
  } catch (e) {
    return {
      ok: false,
      error: "PLAYLIST_FETCH_FAILED",
      message: `Failed to fetch playlist: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return { ok: true, playlist: true, tracks, listId };
}

async function parseYouTube(url: string, videoId: string): Promise<ParseOutcome> {
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
  const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

  try {
    const res = await fetch(oEmbedUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
    const data = await res.json() as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };

    const track: ParsedTrack = {
      id: videoId,
      title: data.title ?? "YouTube Video",
      artist: data.author_name ?? "YouTube",
      duration: 0, // oEmbed doesn't expose duration
      url: embedUrl,
      originalUrl: url,
      source: "youtube",
      thumbnailUrl: data.thumbnail_url,
      coverUrl: data.thumbnail_url,
    };
    return { ok: true, track };
  } catch (e) {
    // Fallback: return embed URL with minimal metadata even if oEmbed fails
    const track: ParsedTrack = {
      id: videoId,
      title: `YouTube — ${videoId}`,
      artist: "YouTube",
      duration: 0,
      url: embedUrl,
      originalUrl: url,
      source: "youtube",
    };
    return { ok: true, track };
  }
}

// ── Spotify ───────────────────────────────────────────────────────────────────

const SPOTIFY_TRACK_PATTERN = /open\.spotify\.com\/track\/([\w]+)/;

async function parseSpotify(url: string, trackId: string): Promise<ParseOutcome> {
  // Spotify's oEmbed endpoint returns metadata + preview is in the embed player.
  // For audio we'll use the preview_url from the public tracks endpoint (no auth needed for basic metadata).
  // NOTE: preview_url may be null for some tracks (region-locked / unavailable).
  const oEmbedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;

  try {
    const res = await fetch(oEmbedUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Spotify oEmbed HTTP ${res.status}`);
    const data = await res.json() as {
      title?: string;
      thumbnail_url?: string;
      provider_name?: string;
    };

    // Spotify preview: embed URL allows the 30s preview to play
    const embedUrl = `https://open.spotify.com/embed/track/${trackId}?utm_source=generator`;

    const track: ParsedTrack = {
      id: `spotify-${trackId}`,
      title: data.title ?? "Spotify Track",
      artist: "Spotify",
      duration: 30, // preview clips are 30s
      url: embedUrl,
      originalUrl: url,
      source: "spotify",
      thumbnailUrl: data.thumbnail_url,
      coverUrl: data.thumbnail_url,
    };
    return { ok: true, track };
  } catch {
    const track: ParsedTrack = {
      id: `spotify-${trackId}`,
      title: `Spotify Track`,
      artist: "Spotify",
      duration: 30,
      url: `https://open.spotify.com/embed/track/${trackId}`,
      originalUrl: url,
      source: "spotify",
    };
    return { ok: true, track };
  }
}

// ── Direct Audio ─────────────────────────────────────────────────────────────

async function parseDirect(url: string): Promise<ParseOutcome> {
  // Try a HEAD request to confirm it's audio. Fallback: trust the extension.
  const isExtensionAudio = AUDIO_EXTENSIONS.test(url);

  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(6000),
    });
    const ct = res.headers.get("content-type") ?? "";
    const isAudioCt = ct.startsWith("audio/") || ct.startsWith("video/");

    if (!isExtensionAudio && !isAudioCt) {
      return {
        ok: false,
        error: "UNSUPPORTED_SOURCE",
        message: "URL does not point to an audio file. Supported: YouTube, Spotify, or direct audio links (.mp3, .ogg, .wav, etc.)",
      };
    }

    // Parse a nice title from the URL path
    const parsedUrl = new URL(url);
    const filename = parsedUrl.pathname.split("/").pop() ?? "";
    const title = decodeURIComponent(filename.replace(AUDIO_EXTENSIONS, "").replace(/[-_]/g, " ") || "Audio Track");

    const track: ParsedTrack = {
      id: generateId(url),
      title,
      artist: parsedUrl.hostname,
      duration: 0, // duration requires loading the audio
      url,
      originalUrl: url,
      source: "direct",
    };
    return { ok: true, track };
  } catch {
    if (isExtensionAudio) {
      // Even if HEAD failed (CORS, etc.), trust the extension
      const parsedUrl = safeUrl(url)!;
      const filename = parsedUrl.pathname.split("/").pop() ?? "";
      const title = decodeURIComponent(filename.replace(AUDIO_EXTENSIONS, "").replace(/[-_]/g, " ") || "Audio Track");
      const track: ParsedTrack = {
        id: generateId(url),
        title,
        artist: parsedUrl.hostname,
        duration: 0,
        url,
        originalUrl: url,
        source: "direct",
      };
      return { ok: true, track };
    }
    return {
      ok: false,
      error: "FETCH_FAILED",
      message: "Could not reach the URL. Check that the link is publicly accessible.",
    };
  }
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Parse a single track URL (YouTube video, Spotify, or direct audio).
 */
export async function parseTrackUrl(raw: string): Promise<ParseOutcome> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "EMPTY_URL", message: "Please enter a URL." };
  }
  const parsed = safeUrl(trimmed);
  if (!parsed) {
    return { ok: false, error: "INVALID_URL", message: "That doesn't look like a valid URL. Make sure it starts with https://" };
  }

  const ytId = extractYouTubeId(trimmed);
  if (ytId) return parseYouTube(trimmed, ytId);

  const spotifyMatch = trimmed.match(SPOTIFY_TRACK_PATTERN);
  if (spotifyMatch) return parseSpotify(trimmed, spotifyMatch[1]);

  return parseDirect(trimmed);
}

/**
 * Parse any URL — detects YouTube playlists first, falls back to single track.
 * Returns PlaylistResult for playlists, ParseOutcome for single tracks.
 */
export async function parseAnyUrl(
  raw: string,
  requestedBy = "Someone"
): Promise<ParseAnyOutcome> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "EMPTY_URL", message: "Please enter a URL." };
  }

  // Check for YouTube playlist
  const listId = extractPlaylistId(trimmed);
  if (listId) {
    return parseYouTubePlaylist(listId, requestedBy);
  }

  return parseTrackUrl(trimmed);
}
