import type { DropReason, FeedItem, FilteredPost } from "../types.js";

const MAX_POSTS_PER_TAB = 200;
const MAX_TEXT_CHARS = 280;

function postUrl(item: FeedItem): string | undefined {
  switch (item.platform) {
    case "youtube":
      return /^[\w-]{11}$/.test(item.id) ? `https://www.youtube.com/watch?v=${item.id}` : undefined;
    case "x":
      return /^\d+$/.test(item.id) ? `https://x.com/i/status/${item.id}` : undefined;
    case "instagram":
      return item.creatorHandle
        ? `https://www.instagram.com/${encodeURIComponent(item.creatorHandle)}/`
        : undefined;
    case "tiktok":
      return item.creatorHandle && /^\d+$/.test(item.id)
        ? `https://www.tiktok.com/@${encodeURIComponent(item.creatorHandle)}/video/${item.id}`
        : undefined;
  }
}

export interface FilteredLog {
  /** Records drops for a tab and returns only posts not already logged there. */
  record(tabId: number, items: FeedItem[], dropped: ReadonlyMap<string, DropReason>): FilteredPost[];
  get(tabId: number): FilteredPost[];
  forget(tabId: number): void;
}

export function createFilteredLog(): FilteredLog {
  const byTab = new Map<number, FilteredPost[]>();

  return {
    record(tabId, items, dropped) {
      if (tabId < 0 || dropped.size === 0) return [];
      const posts = byTab.get(tabId) ?? [];
      const seen = new Set(posts.map((p) => `${p.platform}:${p.id}`));
      const fresh: FilteredPost[] = [];
      const at = Date.now();

      for (const item of items) {
        const reason = dropped.get(item.id);
        const key = `${item.platform}:${item.id}`;
        if (!reason || seen.has(key)) continue;
        seen.add(key);
        fresh.push({
          platform: item.platform,
          id: item.id,
          creator: item.creatorHandle || item.creatorId,
          text: item.titleOrText.slice(0, MAX_TEXT_CHARS),
          reason,
          url: postUrl(item),
          at,
        });
      }

      if (fresh.length > 0) {
        posts.push(...fresh);
        if (posts.length > MAX_POSTS_PER_TAB) posts.splice(0, posts.length - MAX_POSTS_PER_TAB);
        byTab.set(tabId, posts);
      }
      return fresh;
    },
    get(tabId) {
      return byTab.get(tabId) ?? [];
    },
    forget(tabId) {
      byTab.delete(tabId);
    },
  };
}
