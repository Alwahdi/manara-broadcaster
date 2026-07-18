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
  isRestricted: boolean;
  isPlayable: boolean;
  metadataReview: "approved" | "needs_review";
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
  trackedSeriesCount: number;
  lastAutoSyncAt: string | null;
  createdAt: string;
};

export type ProviderSyncRule = {
  id: string;
  providerId: string;
  seriesRef: string;
  seriesTitle: string;
  enabled: boolean;
  publishNew: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  nextRunAt: string;
  lastError: string;
  importedCount: number;
  knownEpisodeRefs: string[];
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
  restricted?: boolean;
  playable?: boolean;
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
  expiresAt: string | null;
};

export type ViewerSummary = ViewerIdentity & {
  lastLoginAt: string | null;
  createdAt: string;
};

export type ViewerSessionSummary = {
  id: string;
  device: string;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
};

export type ViewerActivity = {
  favorite: boolean;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
};

export type PaymentRequestSummary = {
  id: string;
  viewerId: string;
  viewerName: string;
  viewerEmail: string;
  method: "bank_transfer";
  amount: number | null;
  currency: string;
  transferReference: string;
  note: string;
  requestedDays: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
};

export type MatchScheduleEntry = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  channelName: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
