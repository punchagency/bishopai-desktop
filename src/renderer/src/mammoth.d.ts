// mammoth ships no type declarations. We use only the raw-text extraction over
// an in-memory ArrayBuffer (the browser path — no filesystem), so declare just
// that surface.
declare module 'mammoth' {
  interface ExtractResult {
    value: string;
    messages: unknown[];
  }
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<ExtractResult>;
  const _default: { extractRawText: typeof extractRawText };
  export default _default;
}
