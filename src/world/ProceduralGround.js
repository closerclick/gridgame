// Determinista: tile_base(x, y) idéntico en todos los peers dada la misma seed.
// Hash entero 32-bit estilo xorshift para evitar deps.

const TILE_TYPES = ['grass', 'dirt', 'stone', 'water', 'sand']

function hash32 (x, y, seed) {
  let h = (seed | 0) ^ 0x9E3779B9
  h = Math.imul(h ^ (x | 0), 0x85EBCA6B)
  h = Math.imul(h ^ (y | 0), 0xC2B2AE35)
  h ^= h >>> 13
  h = Math.imul(h, 0x5BD1E995)
  h ^= h >>> 15
  return h >>> 0
}

// Smooth noise: media de hash en celda + vecinos para evitar caos puro.
function smooth (x, y, seed) {
  let s = 0
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      s += hash32(x + dx, y + dy, seed)
    }
  }
  return (s / 9) / 0xFFFFFFFF
}

export class ProceduralGround {
  constructor (seed = 0xC10C3E) {
    this.seed = seed | 0
  }

  tileAt (x, y) {
    const n = smooth(x, y, this.seed)
    let type
    if (n < 0.30) type = 'water'
    else if (n < 0.40) type = 'sand'
    else if (n < 0.70) type = 'grass'
    else if (n < 0.85) type = 'dirt'
    else type = 'stone'
    return { type, n }
  }

  static colorFor (type) {
    switch (type) {
      case 'water': return '#2a6fdb'
      case 'sand': return '#d9c878'
      case 'grass': return '#3aa252'
      case 'dirt': return '#7a5a3a'
      case 'stone': return '#888888'
      default: return '#ff00ff'
    }
  }

  static get TYPES () { return TILE_TYPES.slice() }
}
