export interface VideoInfo {
  url: string;
  title: string;
  duration: number;
}

const YOUTUBE_PATTERNS = [
  /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=([\w-]+)/,
  /^(https?:\/\/)?(www\.)?youtu\.be\/([\w-]+)/,
  /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/([\w-]+)/,
];

const SOUNDCLOUD_PATTERN = /^(https?:\/\/)?(www\.)?soundcloud\.com\/([\w-]+)\/([\w-]+)/;

export function isValidYouTubeUrl(url: string): boolean {
  return YOUTUBE_PATTERNS.some((p) => p.test(url));
}

export function isValidSoundCloudUrl(url: string): boolean {
  return SOUNDCLOUD_PATTERN.test(url);
}

export function isValidVideoUrl(url: string): boolean {
  return isValidYouTubeUrl(url) || isValidSoundCloudUrl(url);
}

export function extractYouTubeId(url: string): string | null {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[3];
  }
  return null;
}

/**
 * Fetch video info using oEmbed (works without API keys).
 * Falls back to basic info on failure.
 */
export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  if (isValidYouTubeUrl(url)) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const response = await fetch(oembedUrl);
      if (response.ok) {
        const data = (await response.json()) as { title?: string };
        return {
          url,
          title: data.title || 'YouTube Video',
          duration: 0, // oEmbed doesn't give duration; client will report it
        };
      }
    } catch {
      // fall through
    }
    return { url, title: 'YouTube Video', duration: 0 };
  }

  if (isValidSoundCloudUrl(url)) {
    try {
      const oembedUrl = `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const response = await fetch(oembedUrl);
      if (response.ok) {
        const data = (await response.json()) as { title?: string };
        return {
          url,
          title: data.title || 'SoundCloud Track',
          duration: 0,
        };
      }
    } catch {
      // fall through
    }
    return { url, title: 'SoundCloud Track', duration: 0 };
  }

  throw new Error('Invalid video URL');
}
