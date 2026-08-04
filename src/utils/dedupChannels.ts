import { Channel } from '../types';
import { qualityLabel } from '../constants';

/** Strip quality suffix (FHD/HD/SD etc) from channel title for deduplication. */
function baseTitle(title: string): string {
  return title.replace(/\s+(FHD|HD|SD|4K|UHD|HDR|HEVC|2160P|1080P|720P)\s*$/i, '').trim();
}

/**
 * Return a deduplicated channel list — SD/HD/FHD variants merged into one entry
 * with qualityVariants. Preserves original order (first-seen variant per dedup key).
 */
export function dedupLiveChannels(channels: Channel[]): Channel[] {
  const groups = new Map<string, Channel[]>();
  const order: string[] = [];

  for (const ch of channels) {
    if (ch.group === 'Hungarian Radio') continue;
    const key = `${baseTitle(ch.title)}|${ch.group}`;
    const arr = groups.get(key);
    if (arr) {
      arr.push(ch);
    } else {
      order.push(key);
      groups.set(key, [ch]);
    }
  }

  const result: Channel[] = [];
  for (const key of order) {
    const group = groups.get(key)!;
    const sorted = [...group].sort((a, b) => b.streamId - a.streamId);
    const best = sorted[0];
    if (group.length > 1) {
      const variants = group.map(c => ({
        label: qualityLabel(c.title),
        streamId: c.streamId,
        streamUrl: c.streamUrl,
        key: c.key,
      })).sort((a, b) => {
        const order = ['FHD', 'HD', 'SD'];
        return order.indexOf(a.label) - order.indexOf(b.label);
      });
      result.push({ ...best, qualityVariants: variants });
    } else {
      result.push(best);
    }
  }

  return result;
}
