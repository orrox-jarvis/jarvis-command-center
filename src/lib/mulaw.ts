// Standard G.711 μ-law codec — matches Python audioop.lin2ulaw / sox behaviour exactly.
// Input/output scale: int16 range [-32768, 32767] ↔ uint8 mulaw byte.

const BIAS = 0x84   // 132
const CLIP = 32635  // max magnitude before clipping

/**
 * Encode a 16-bit PCM integer sample to a G.711 μ-law byte.
 */
export function encodeMulaw(sample: number): number {
  // Get sign, then work with magnitude
  let sign = 0
  if (sample < 0) {
    sign = 0x80
    sample = -sample
  }
  if (sample > CLIP) sample = CLIP
  sample += BIAS

  // Find segment exponent
  let exponent = 7
  let expMask = 0x4000
  for (; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}

  const mantissa = (sample >> (exponent + 3)) & 0x0f
  return (~(sign | (exponent << 4) | mantissa)) & 0xff
}

/**
 * Decode a G.711 μ-law byte to a 16-bit PCM integer sample.
 */
export function decodeMulaw(byte: number): number {
  byte = (~byte) & 0xff
  const sign      = byte & 0x80
  const exponent  = (byte >> 4) & 0x07
  const mantissa  = byte & 0x0f
  let magnitude   = ((mantissa << 3) + BIAS) << exponent
  return sign !== 0 ? -magnitude : magnitude
}

/**
 * Encode Float32Array [-1, 1] → Uint8Array of G.711 μ-law bytes.
 */
export function encodeMulawBuffer(pcm: Float32Array): Uint8Array {
  const out = new Uint8Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    out[i] = encodeMulaw(s < 0 ? Math.round(s * 32768) : Math.round(s * 32767))
  }
  return out
}

/**
 * Decode Uint8Array of G.711 μ-law bytes → Float32Array [-1, 1].
 */
export function decodeMulawBuffer(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    out[i] = decodeMulaw(bytes[i]) / 32768
  }
  return out
}
