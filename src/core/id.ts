import { getIdByteLength } from './tiers.js'

/**
 * Deterministic word 	 ID generator
 * Same output on browser and node (when using compatible input)
 */
export async function generateWordId(word: string): Promise<Uint8Array> {
  const normalized = word.trim().toLowerCase()
  if (!normalized) throw new Error('Cannot generate ID for empty string')

  const encoder = await getTextEncoder()
  const data = encoder.encode(normalized)

  // Browser + Node compatible SHA-256
  let hash: ArrayBuffer
  const anyCrypto: any = (globalThis as any).crypto
  if (anyCrypto && anyCrypto.subtle) {
    hash = await anyCrypto.subtle.digest('SHA-256', data)
  } else {
    const { createHash } = await import('node:crypto')
    hash = createHash('sha256').update(Buffer.from(data)).digest().buffer
  }

  const hashBytes = new Uint8Array(hash)
  const size = getIdByteLength(normalized.length)
  return hashBytes.slice(0, size)
}

async function getTextEncoder(): Promise<TextEncoder> {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder()
  const { TextEncoder: NodeTextEncoder } = await import('node:util')
  // @ts-ignore Node typings
  return new NodeTextEncoder()
}
