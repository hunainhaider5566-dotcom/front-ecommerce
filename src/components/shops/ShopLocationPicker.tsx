import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { MapPin, Minus, Plus } from 'lucide-react'
import { useI18n } from '../../i18n/LocaleContext'

const TILE_SIZE = 256
const DEFAULT_LOCATION = { latitude: 31.5204, longitude: 74.3587 }
const TILE_BASE_URL = 'https://tile.openstreetmap.org'

type Point = { latitude: number; longitude: number }
type DragState = { mode: 'pan' | 'pin'; pointerX: number; pointerY: number; worldX: number; worldY: number; moved: boolean }

function toWorld(point: Point, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, point.latitude))
  const sin = Math.sin(latitude * Math.PI / 180)
  return {
    x: ((point.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

function fromWorld(x: number, y: number, zoom: number): Point {
  const scale = TILE_SIZE * 2 ** zoom
  const longitude = x / scale * 360 - 180
  const n = Math.PI - 2 * Math.PI * y / scale
  return { latitude: 180 / Math.PI * Math.atan(Math.sinh(n)), longitude }
}

function wrapTileX(value: number, total: number) {
  return ((value % total) + total) % total
}

export function ShopLocationPicker({ point, onChange }: { point: Point | null; onChange: (point: Point) => void }) {
  const { t } = useI18n()
  const mapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)
  const internalSelection = useRef(false)
  const [size, setSize] = useState({ width: 720, height: 250 })
  const [zoom, setZoom] = useState(14)
  const [center, setCenter] = useState<Point>(point ?? DEFAULT_LOCATION)

  useEffect(() => {
    const element = mapRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (point && !internalSelection.current && !drag.current) setCenter(point)
    internalSelection.current = false
  }, [point])

  const centerWorld = useMemo(() => toWorld(center, zoom), [center, zoom])
  const originX = centerWorld.x - size.width / 2
  const originY = centerWorld.y - size.height / 2
  const totalTiles = 2 ** zoom
  const firstTileX = Math.floor(originX / TILE_SIZE) - 1
  const firstTileY = Math.floor(originY / TILE_SIZE) - 1
  const columns = Math.ceil(size.width / TILE_SIZE) + 2
  const rows = Math.ceil(size.height / TILE_SIZE) + 2
  const tiles = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = firstTileX + column
      const y = firstTileY + row
      if (y < 0 || y >= totalTiles) continue
      tiles.push({ key: `${zoom}/${wrapTileX(x, totalTiles)}/${y}`, x: wrapTileX(x, totalTiles), y, left: x * TILE_SIZE - originX, top: y * TILE_SIZE - originY })
    }
  }

  const marker = point ? toWorld(point, zoom) : null
  const markerStyle = marker ? { left: `${marker.x - originX}px`, top: `${marker.y - originY}px` } : undefined

  function pointAt(clientX: number, clientY: number) {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect) return center
    return fromWorld(centerWorld.x + clientX - rect.left - size.width / 2, centerWorld.y + clientY - rect.top - size.height / 2, zoom)
  }

  function beginInteraction(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const isPin = (event.target as HTMLElement).closest('.shop-location-picker__marker') !== null
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { mode: isPin ? 'pin' : 'pan', pointerX: event.clientX, pointerY: event.clientY, worldX: centerWorld.x, worldY: centerWorld.y, moved: false }
    event.preventDefault()
  }

  function moveInteraction(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.pointerX
    const dy = event.clientY - current.pointerY
    if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true
    if (current.mode === 'pan') setCenter(fromWorld(current.worldX - dx, current.worldY - dy, zoom))
    if (current.mode === 'pin' && current.moved) {
      internalSelection.current = true
      onChange(pointAt(event.clientX, event.clientY))
    }
  }

  function endInteraction(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current) return
    if (current.mode === 'pan' && !current.moved) {
      internalSelection.current = true
      onChange(pointAt(event.clientX, event.clientY))
    }
    drag.current = null
    window.setTimeout(() => { internalSelection.current = false }, 0)
  }

  function nudgePoint(latitudeDelta: number, longitudeDelta: number) {
    if (!point) return
    internalSelection.current = true
    onChange({ latitude: Math.max(-90, Math.min(90, point.latitude + latitudeDelta)), longitude: Math.max(-180, Math.min(180, point.longitude + longitudeDelta)) })
  }

  return <div className="shop-location-picker-wrap">
    <p className="shop-location-picker__hint">{t(point ? 'Drag the pin to fine-tune your shop location, or click the map to move it.' : 'Click the map to place your shop pin, or use the device location button above.')}</p>
    <div className="shop-location-picker" ref={mapRef} role="application" tabIndex={0} aria-label={t('Interactive shop location map')} onKeyDown={(event) => { const offsets: Record<string, [number, number]> = { ArrowUp: [0.0002, 0], ArrowDown: [-0.0002, 0], ArrowLeft: [0, -0.0002], ArrowRight: [0, 0.0002] }; const offset = offsets[event.key]; if (!offset) return; event.preventDefault(); const base = point ?? fromWorld(centerWorld.x, centerWorld.y, zoom); internalSelection.current = true; onChange({ latitude: Math.max(-90, Math.min(90, base.latitude + offset[0])), longitude: Math.max(-180, Math.min(180, base.longitude + offset[1])) }) }} onPointerDown={beginInteraction} onPointerMove={moveInteraction} onPointerUp={endInteraction} onPointerCancel={() => { drag.current = null }}>
      {tiles.map((tile) => <img key={tile.key} className="shop-location-picker__tile" src={`${TILE_BASE_URL}/${zoom}/${tile.x}/${tile.y}.png`} alt="" draggable="false" style={{ left: tile.left, top: tile.top }} />)}
      {markerStyle && <button type="button" className="shop-location-picker__marker" style={markerStyle} aria-label={t('Drag shop location pin')} onKeyDown={(event) => { if (event.key === 'ArrowUp') { event.preventDefault(); nudgePoint(0.0002, 0) } else if (event.key === 'ArrowDown') { event.preventDefault(); nudgePoint(-0.0002, 0) } else if (event.key === 'ArrowLeft') { event.preventDefault(); nudgePoint(0, -0.0002) } else if (event.key === 'ArrowRight') { event.preventDefault(); nudgePoint(0, 0.0002) } }}><MapPin size={36} fill="currentColor" /></button>}
      <div className="shop-location-picker__controls"><button type="button" aria-label={t('Zoom in')} disabled={zoom >= 18} onPointerDown={(event) => event.stopPropagation()} onClick={() => setZoom((current) => Math.min(18, current + 1))}><Plus size={16} /></button><button type="button" aria-label={t('Zoom out')} disabled={zoom <= 3} onPointerDown={(event) => event.stopPropagation()} onClick={() => setZoom((current) => Math.max(3, current - 1))}><Minus size={16} /></button></div>
      <a className="shop-location-picker__attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()}>© OpenStreetMap contributors</a>
    </div>
  </div>
}
