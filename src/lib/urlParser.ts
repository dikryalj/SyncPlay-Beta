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
  | "EMPTY_URL";

export interface ParseResult {
  ok: true;
  track: ParsedTrack;
}

export interface ParseFailure {
  ok: false;
  error: ParseError;
  message: string;
}

export type ParseOutcome = ParseResult | ParseFailure;

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

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse a raw URL string into a typed ParsedTrack.
 * Supports YouTube, Spotify, and direct audio links.
 * Safe to call in both browser and Node environments.
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

  // YouTube
  const ytId = extractYouTubeId(trimmed);
  if (ytId) return parseYouTube(trimmed, ytId);

  // Spotify
  const spotifyMatch = trimmed.match(SPOTIFY_TRACK_PATTERN);
  if (spotifyMatch) return parseSpotify(trimmed, spotifyMatch[1]);

  // Direct audio
  return parseDirect(trimmed);
}
