import { Channel } from '../types';

/** Strip quality suffix (FHD/HD/SD etc) from channel title for deduplication. */
function baseTitle(title: string): string {
  return title.replace(/\s+(FHD|HD|SD|4K|UHD|HDR|HEVC|2160P|1080P|720P)\s*$/i, '').trim();
}

/**
 * Return a deduplicated channel list — SD/HD/FHD variants merged into one entry.
 * Preserves original order (first-seen variant per dedup key).
 */
export function dedupLiveChannels(channels: Channel[]): Channel[] {
  const seen = new Set<string>();
  const result: Channel[] = [];

  // Build best-variant map per (baseTitle, group) key
  const bestMap = new Map<string, Channel>();
  const order: string[] = [];

  for (const ch of channels) {
    if (ch.group === 'Hungarian Radio') continue;
    const key = `${baseTitle(ch.title)}|${ch.group}`;
    if (!bestMap.has(key)) {
      order.push(key);
      bestMap.set(key, ch);
    } else {
      const existing = bestMap.get(key)!;
      if (ch.streamId > existing.streamId) {
        bestMap.set(key, ch);
      }
    }
  }

  for (const key of order) {
    result.push(bestMap.get(key)!);
  }

  return result;
}
