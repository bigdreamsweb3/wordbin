export interface WordBinDictionary {
  version: number;
  description: string;
  words: Record<string, string[]>; // hex key 		 possible original words (collision list)
}

export interface EncodeResult {
  originalText: string;
  encoded: Uint8Array;
  dictVersion: number;
  payload: string; // primary payload (hex)
  hexPayload: string;
  base58Payload: string;
  base64Payload: string;
  originalBytes: number;
  encodedBytes: number;
  bytesSaved: number;
  ratioPercent: number;
  wrapped?: {
    base64Payload: string;
    encodedBytes: number;
    bytesSaved: number;
    ratioPercent: number;
  };
}
