/**
 * Stub for fetch on RNW 0.84.
 * The native Networking TurboModule crashes the process when sendRequest is called.
 * This stub replaces global.fetch with a version that throws a catchable JS error.
 */
export function installFetchStub() {
  global.fetch = async (_url: string, _options?: RequestInit): Promise<Response> => {
    throw new Error(
      'Hálózati hiba: kérés nem teljesíthető (RNW 0.84 networking korlátozás).',
    );
  };
}
