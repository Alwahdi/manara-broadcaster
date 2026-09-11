// Only provider discovery and Next's request-scoped cache are substituted;
// the sync workflow and every persistence operation use production code.
export async function loadProviderConnection(id) {
  return { id, status: "active" };
}

export async function discoverProviderCatalog() {
  const fixture = globalThis.wivaSyncFixture;
  fixture.discoveries += 1;
  if (fixture.wait) await fixture.wait;
  if (fixture.error) throw new Error(fixture.error);
  return fixture.catalog;
}

export async function discoverSeriesEpisodes() {
  return globalThis.wivaSyncFixture.episodes;
}

export function revalidateTag() {}
