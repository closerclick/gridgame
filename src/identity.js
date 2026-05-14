// Integración con closer-click-identity.
//
// Decisión §11 del plan: reputación = web-of-trust subjetivo. NO añadimos
// level/XP. Reutilizamos getRatingsForSubject(pk) → { mine, endorsements } y
// agregamos localmente.
//
// repOf(pk) ∈ [0,1] = media ponderada del rating propio + endorsements, normalizada
// (rating 0..5 → /5). Si no hay datos → 0.

import { Identity } from '@gatoseya/closer-click-identity'

let identity = null
let myPubkey = null
const repCache = new Map() // pk → { v, exp }
const CACHE_MS = 30_000

export async function initIdentity () {
  if (identity) return identity
  try {
    identity = await Identity.connect()
    myPubkey = identity.me?.publickey || null
  } catch (e) {
    console.warn('[identity] vault unreachable, running in standalone mode:', e.message)
    identity = null
  }
  return identity
}

export function getMyPubkey () { return myPubkey }

export function isIdentityReady () { return identity !== null }

/** Firma un payload JSON-serializable. Devuelve { signature, publickey } o null. */
export async function sign (data) {
  if (!identity) return null
  try { return await identity.signData(data) } catch (e) { console.warn('[identity] sign failed', e); return null }
}

/** Reputación agregada local sobre un peer (subjetiva). */
export async function repOf (pk) {
  if (!pk) return 0
  if (pk === myPubkey) return 1 // confío en mí mismo
  const now = Date.now()
  const cached = repCache.get(pk)
  if (cached && cached.exp > now) return cached.v
  if (!identity) {
    repCache.set(pk, { v: 0, exp: now + CACHE_MS })
    return 0
  }
  let v = 0
  try {
    const r = await identity.getRatingsForSubject(pk)
    v = aggregate(r)
  } catch (e) {
    console.warn('[identity] repOf failed', e)
  }
  repCache.set(pk, { v, exp: now + CACHE_MS })
  return v
}

/** Versión sincrónica para hot paths (render): devuelve la cache, 0 si no hay. */
export function repOfSync (pk) {
  if (!pk) return 0
  if (pk === myPubkey) return 1
  return repCache.get(pk)?.v ?? 0
}

/** Pre-carga rep de una lista de peers en la cache. */
export async function warmRep (pks) {
  await Promise.all([...new Set(pks)].map(repOf))
}

function aggregate (r) {
  // r = { mine: envOrNull, endorsements: [...] }
  const samples = []
  if (r?.mine && typeof r.mine.rating === 'number') samples.push({ rating: r.mine.rating, weight: 2 })
  if (Array.isArray(r?.endorsements)) {
    for (const e of r.endorsements) {
      if (typeof e.rating === 'number') samples.push({ rating: e.rating, weight: 1 })
    }
  }
  if (samples.length === 0) return 0
  let sw = 0, ss = 0
  for (const s of samples) { sw += s.weight; ss += s.weight * s.rating }
  const avg = ss / sw // 0..5
  return Math.max(0, Math.min(1, avg / 5))
}

export function clearRepCache () { repCache.clear() }
