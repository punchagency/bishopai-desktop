// Sample/preview data is a DESIGN AFFORDANCE, not a fallback.
//
// Every data view carries a SAMPLE constant so the dashboard renders standalone
// with no backend running — useful while building screens. The failure mode is
// that those constants were also the catch-branch for a failed fetch, so a build
// pointed at the hosted backend answered a network blip by painting invented
// clients (Jane Doe, Maya Chen, sarah.m@example.com) into a real practitioner's
// queue. A small "offline preview" badge is not enough separation between "these
// people are waiting on you" and "these people do not exist."
//
// So samples are allowed against a local backend only. Anywhere else, an
// unreachable backend has to look unreachable — see <ConnectionError>.
export function allowSampleData(backendUrl: string | null | undefined): boolean {
  if (!backendUrl) return false;
  try {
    const { hostname } = new URL(backendUrl);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false; // unparseable URL: treat as remote, i.e. no samples
  }
}
