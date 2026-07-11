import type { Channel, LibraryBrowseEntry } from "@/lib/api";

export function publicViewerLabel(value: unknown, fallback = "") {
  const label = String(value || "").trim();
  if (!label) return fallback;
  if (/^auto$/i.test(label)) return "تلقائية";
  if (/^mux\s+hls\s+test$/i.test(label)) return "قناة تجريبية";
  const ratioDemo = label.match(/^apple\s+bipbop\s*(16:9|4:3)?\s*demo$/i);
  if (ratioDemo) return `قناة تجريبية${ratioDemo[1] ? ` ${ratioDemo[1]}` : ""}`;
  return label;
}

export function getViewerChannels(data?: Record<string, unknown>) {
  if (!data) return [];
  const merged = Array.isArray(data.channels) && data.channels.length
    ? data.channels
    : [...((data.broadcast as unknown[]) || []), ...((data.iptv as unknown[]) || [])];
  return (merged as Channel[])
    .filter((channel) => channel && channel.enabled !== false && channel.enabled !== 0)
    .map((channel) => ({
      ...channel,
      name: publicViewerLabel(channel.name, "قناة مباشرة"),
      description: /\b(?:iptv|hls|demo|proxy|upstream)\b/i.test(String(channel.description || ""))
        ? "بث مباشر متاح الآن"
        : channel.description,
      quality: publicViewerLabel(channel.quality, "تلقائية"),
      qualities: Array.isArray(channel.qualities)
        ? channel.qualities.map((quality) => ({
            ...quality,
            label: publicViewerLabel(quality.label, "تلقائية"),
            name: publicViewerLabel(quality.name, "جودة تلقائية"),
          }))
        : channel.qualities,
    }));
}

export function getChannelQualityLabel(channel?: Channel) {
  if (!channel) return "HD";
  const qualities = Array.isArray(channel.qualities) ? channel.qualities : [];
  if (qualities.length) {
    return qualities
      .slice(0, 2)
      .map((quality) => publicViewerLabel(quality.label || quality.name || String(quality.id), "تلقائية"))
      .filter(Boolean)
      .join(" / ");
  }
  return publicViewerLabel(channel.resolution, "تلقائية");
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
