import type { Channel, LibraryBrowseEntry } from "@/lib/api";

export function getViewerChannels(data?: Record<string, unknown>) {
  if (!data) return [];
  const merged = Array.isArray(data.channels) && data.channels.length
    ? data.channels
    : [...((data.broadcast as unknown[]) || []), ...((data.iptv as unknown[]) || [])];
  return (merged as Channel[]).filter((channel) => channel && channel.enabled !== false && channel.enabled !== 0);
}

export function getChannelQualityLabel(channel?: Channel) {
  if (!channel) return "HD";
  const qualities = Array.isArray(channel.qualities) ? channel.qualities : [];
  if (qualities.length) {
    return qualities
      .slice(0, 2)
      .map((quality) => quality.label || quality.name || String(quality.id))
      .filter(Boolean)
      .join(" / ");
  }
  return channel.resolution || "HD";
}

export function filterChannels(channels: Channel[], filter: string, term: string) {
  const q = term.trim().toLowerCase();
  return channels.filter((channel) => {
    const haystack = `${channel.name || ""} ${channel.group || ""} ${channel.category || ""} ${channel.description || ""}`.toLowerCase();
    const matchesTerm = !q || haystack.includes(q);
    const matchesFilter =
      filter === "all" ||
      (filter === "sports" && /sport|رياض|bein|match|كرة/i.test(haystack)) ||
      (filter === "news" && /news|أخبار|اخبار/i.test(haystack)) ||
      (filter === "movies" && /movie|film|cinema|أفلام|افلام/i.test(haystack)) ||
      (filter === "kids" && /kids|طفل|أطفال|اطفال/i.test(haystack));
    return matchesTerm && matchesFilter;
  });
}

export function folderResults(entries?: LibraryBrowseEntry[], term = "") {
  const q = term.trim().toLowerCase();
  return ((entries || []) as LibraryBrowseEntry[]).filter((entry) => {
    if (!q) return true;
    return `${entry.name || ""} ${entry.media?.title || ""} ${entry.media?.name || ""}`.toLowerCase().includes(q);
  });
}
