export type AssetKind = "live" | "movie" | "series";

export type CatalogAsset = {
  id: string;
  kind: AssetKind;
  title: string;
  description: string;
  category: string;
  artworkUrl: string;
  backdropUrl: string;
  year: number | null;
  rating: number | null;
  quality: string;
  language: string;
  isFeatured: boolean;
  isActive: boolean;
  providerId?: string | null;
  providerAssetRef?: string;
  parentAssetId?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  demoPlaybackUrl?: string;
};

export type ProviderSummary = {
  id: string;
  name: string;
  kind: "licensed_hls" | "licensed_xtream" | "licensed_vod";
  status: "disabled" | "active" | "degraded" | "blocked";
  priority: number;
  rightsReference: string;
  redistributionAttested: boolean;
  createdAt: string;
};

export type ProviderCatalogCategory = {
  id: string;
  name: string;
  count: number;
};

export type ProviderCatalogItem = {
  ref: string;
  kind: AssetKind;
  title: string;
  categoryId: string;
  category: string;
  artworkUrl: string;
  description: string;
  year: number | null;
  rating: number | null;
  quality: string;
  language: string;
};

export type ProviderSeriesEpisode = {
  ref: string;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  containerExtension: string;
  artworkUrl: string;
  description: string;
};

export type ViewerIdentity = {
  id: string;
  name: string;
  email: string;
  status: "pending" | "active" | "blocked" | "expired";
  maxConcurrentStreams: number;
};

export type ViewerSummary = ViewerIdentity & {
  expiresAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};
