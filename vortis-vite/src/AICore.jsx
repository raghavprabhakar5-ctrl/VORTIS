import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const IDLE_COLOR   = new THREE.Color('#818cf8')
const ACTIVE_COLOR  = new THREE.Color('#c084fc')
const _blendColor   = new THREE.Color()
const _scaleVec     = new THREE.Vector3()

// ── Sharp dot sprite: solid bright core with a tight, controlled
//    falloff — reads as a crisp point with a hint of glow instead
//    of a soft, uniformly blurred puff ──
const _dotTexture = (() => {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
 const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
grad.addColorStop(0,    'rgba(255,255,255,0.9)')
grad.addColorStop(0.25, 'rgba(255,255,255,0.55)') // soft, blurred core
grad.addColorStop(0.5,  'rgba(255,255,255,0.28)') // gradual falloff
grad.addColorStop(0.75, 'rgba(255,255,255,0.1)')  // wide soft halo
grad.addColorStop(1,    'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
})()

function ParticleShell({ isConnected, isSpeaking }) {
  const ref = useRef(null)
  const volRef = useRef(0)
  const COUNT = 2500

  const { positions, original, seeds } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    const orig = new Float32Array(COUNT * 3)
    const s = new Float32Array(COUNT * 2)

    for (let i = 0; i < COUNT; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / COUNT)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      const r = 1.3

      const px = r * Math.sin(phi) * Math.cos(theta)
      const py = r * Math.sin(phi) * Math.sin(theta)
      const pz = r * Math.cos(phi)

      pos[i * 3] = px
      pos[i * 3 + 1] = py
      pos[i * 3 + 2] = pz
      orig[i * 3] = px
      orig[i * 3 + 1] = py
      orig[i * 3 + 2] = pz

      s[i * 2] = Math.random() * Math.PI * 2
      s[i * 2 + 1] = 0.5 + Math.random() * 0.8
    }
    return { positions: pos, original: orig, seeds: s }
  }, [])

  useFrame((_, delta) => {
    if (!ref.current) return
    const pts = ref.current
    const geo = pts.geometry
    const mat = pts.material

    pts.rotation.y += delta * 0.07
    pts.rotation.z += delta * 0.03

    const t = performance.now() * 0.001

    let targetVol = 0
    if (isSpeaking) {
      const pulse = Math.abs(Math.sin(t * 9) * 0.6 + Math.sin(t * 4.3) * 0.4)
      targetVol = pulse * 0.6 + Math.random() * 0.1
    } else if (isConnected) {
      targetVol = Math.abs(Math.sin(t * 1.6)) * 0.035
    }
    const lerpSpeed = isSpeaking ? 0.14 : 0.09
    volRef.current += (targetVol - volRef.current) * lerpSpeed
    const vol = volRef.current

    _blendColor.lerpColors(IDLE_COLOR, ACTIVE_COLOR, Math.min(vol * 2, 1))
    mat.color.copy(_blendColor)
    const targetOp = isConnected ? 0.95 + vol * 0.05 : 0.6
    mat.opacity += (targetOp - mat.opacity) * 0.07

    if (vol > 0.002) {
      const posArr = geo.attributes.position.array
      for (let i = 0; i < COUNT; i++) {
        const ix = i * 3
        const phase = seeds[i * 2]
        const weight = seeds[i * 2 + 1]

        const wave = Math.sin(t * 7 + phase) * vol * weight * 0.11

        const ox = original[ix]
        const oy = original[ix + 1]
        const oz = original[ix + 2]
        const invR = 0.7692

        posArr[ix] = ox + ox * invR * wave
        posArr[ix + 1] = oy + oy * invR * wave
        posArr[ix + 2] = oz + oz * invR * wave
      }
      geo.attributes.position.needsUpdate = true
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          usage={THREE.DynamicDrawUsage}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        map={_dotTexture}
        transparent
        opacity={0.85}
        sizeAttenuation={true}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        vertexColors={false}
        color={IDLE_COLOR}
      />
    </points>
  )
}

function AIOrb({ isConnected, isSpeaking }) {
  const groupRef = useRef(null)

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const targetScale = !isConnected ? 1.0 : isSpeaking ? 1.2 : 1.1
    _scaleVec.set(targetScale, targetScale, targetScale)
    groupRef.current.scale.lerp(_scaleVec, delta * 3)
    groupRef.current.rotation.y += delta * 0.03
  })

  return (
    <group ref={groupRef}>
      <ParticleShell isConnected={isConnected} isSpeaking={isSpeaking} />
    </group>
  )
}

export default function AICore({
  isConnected = false,
  isSpeaking = false
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
      }}
    >
      <Canvas
        style={{
          width: '100%',
          height: '100%',
          // subtle outer glow so the sphere reads as luminous
          // rather than adding blur to the points themselves
          filter: isSpeaking
            ? 'drop-shadow(0 0 22px rgba(192,132,252,0.55)) drop-shadow(0 0 8px rgba(192,132,252,0.4))'
            : 'drop-shadow(0 0 14px rgba(129,140,248,0.35))'
        }}
        camera={{ position: [0, 0, 4.2], fov: 45 }}
        gl={{
          antialias: true,
          alpha: true,
          depth: true,
          stencil: false,
          powerPreference: 'high-performance'
        }}
        dpr={[1, 2]}
        frameloop="always"
      >
        <AIOrb isConnected={isConnected} isSpeaking={isSpeaking} />
      </Canvas>
    </div>
  )
}