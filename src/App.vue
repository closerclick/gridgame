<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { WorldView } from './render/WorldView.js'
import { ProceduralGround } from './world/ProceduralGround.js'
import { LocalStore } from './world/LocalStore.js'
import { PeerLink } from './net/PeerLink.js'
import { CombatHost } from './combat.js'
import { initIdentity, getMyPubkey, repOf, repOfSync, warmRep } from './identity.js'
import { makeObject } from './objects/standard.js'

const canvasRef = ref(null)
const status = ref('booting…')
let view = null
let store = null
let link = null
let combat = null
let myPk = null

const keys = new Set()
let moveRaf = null

function onKeyDown (e) {
  keys.add(e.key)
  // Acciones rápidas
  if (e.key === 'q') tryPlaceRock()
  if (e.key === 'e') trySummonSlime()
  if (e.key === 'f') tryAttackNearest()
}
function onKeyUp (e) { keys.delete(e.key) }
function onResize () { view?.resize() }

function tickMove () {
  if (!view) return
  const speed = 0.15
  if (keys.has('ArrowUp') || keys.has('w')) view.camera.y -= speed
  if (keys.has('ArrowDown') || keys.has('s')) view.camera.y += speed
  if (keys.has('ArrowLeft') || keys.has('a')) view.camera.x -= speed
  if (keys.has('ArrowRight') || keys.has('d')) view.camera.x += speed
  link?.setViewport({
    x0: Math.floor(view.camera.x) - 12,
    y0: Math.floor(view.camera.y) - 9,
    x1: Math.floor(view.camera.x) + 12,
    y1: Math.floor(view.camera.y) + 9
  })
  moveRaf = requestAnimationFrame(tickMove)
}

function myTilePos () {
  return { x: Math.round(view.camera.x), y: Math.round(view.camera.y) }
}

function tryPlaceRock () {
  if (!myPk) return
  const obj = makeObject('rock', { creator: myPk, ts: Date.now(), pos: myTilePos() })
  store.upsert(obj, { creatorOnline: true })
  link?.broadcastObjectState(obj)
}

function trySummonSlime () {
  if (!combat) return
  const myRep = repOfSync(myPk)
  combat.summon('slime', { x: myTilePos().x + 2, y: myTilePos().y }, myRep)
}

function tryAttackNearest () {
  if (!store) return
  const p = myTilePos()
  // Busca un enemigo adyacente.
  let target = null
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const objs = store.atTile(p.x + dx, p.y + dy)
      for (const o of objs) if (o.type === 'enemy') { target = o; break }
      if (target) break
    }
    if (target) break
  }
  if (!target) return
  const amount = Math.max(1, Math.floor(5 * repOfSync(myPk) + 1))
  if (target.creator === myPk) {
    combat.applyHit(target.id, amount)
  } else {
    link?.broadcastHit(target.id, target.creator, amount)
  }
}

onMounted(async () => {
  status.value = 'identity…'
  await initIdentity()
  myPk = getMyPubkey() || `local-${Math.random().toString(36).slice(2, 8)}`

  store = new LocalStore({ myPeerId: myPk })

  view = new WorldView(canvasRef.value, {
    tileSize: 28,
    ground: new ProceduralGround(0xC10C3E),
    store,
    repOf: repOfSync
  })
  view.resize()
  view.start()
  moveRaf = requestAnimationFrame(tickMove)

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('resize', onResize)

  status.value = 'connecting proxy…'
  try {
    link = new PeerLink({ store, repOfSync, url: import.meta.env.VITE_WS_URL || undefined })
    await link.start(myPk)
    combat = new CombatHost({ store, peerLink: link, myPubkey: myPk })
    status.value = `online · pk=${(myPk || '').slice(0, 10)}`
  } catch (e) {
    console.warn('proxy connect failed', e)
    status.value = `offline (no proxy) · pk=${(myPk || '').slice(0, 10)}`
  }

  // Pre-warm rep cache para peers que descubramos.
  setInterval(() => {
    if (!link) return
    warmRep([...link.peers.keys()])
  }, 10000)
})

onBeforeUnmount(() => {
  view?.stop()
  link?.stop()
  combat?.destroy()
  if (moveRaf) cancelAnimationFrame(moveRaf)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <canvas ref="canvasRef" class="world"></canvas>
  <div class="hint">
    WASD muévete · <b>Q</b> colocar roca · <b>E</b> summon slime · <b>F</b> atacar adyacente
    <div class="status">{{ status }}</div>
  </div>
</template>

<style scoped>
.world { position: fixed; inset: 0; width: 100vw; height: 100vh; }
.hint {
  position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.6); padding: 8px 14px; border-radius: 8px;
  font-size: 12px; pointer-events: none; text-align: center;
}
.status { margin-top: 4px; opacity: 0.7; font-size: 11px; }
</style>
