export interface WordBinDictionary {
  version: number;
  description: string;
  words: Record<string, string[]>; // hex key 		 possible original words (collision list)
}

export interface EncodeResult {
  originalText: string;
  payload: string;
  encoded: Uint8Array;
  dictVersion: number;
  encodedBase64: string;
  originalBytes: number;
  encodedBytes: number;
  bytesSaved: number;
  ratioPercent: number;
  wrapped?: {
    encodedBase64: string;
    encodedBytes: number;
    bytesSaved: number;
    ratioPercent: number;
  };
}
