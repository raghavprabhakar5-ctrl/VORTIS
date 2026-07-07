import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

// Theme colors — match :root variables in App.jsx
//   --indigo:#6366f1  --violet:#8b5cf6  --cyan:#06b6d4
const IDLE_COLOR  = new THREE.Color('#6366f1') // indigo (resting)
const ACTIVE_COLOR = new THREE.Color('#8b5cf6') // violet (speaking)
const RING_COLOR  = new THREE.Color('#6366f1') // indigo
const RING_GLOW   = new THREE.Color('#c7d2fe') // pale indigo glow
const _blendColor = new THREE.Color()
const _ringColor = new THREE.Color()
const _scaleVec = new THREE.Vector3()

// ── SIZING CONSTANTS ──────────────────────────────────────────────
// Camera pulled in from z=5 → z=4.2, fov 42 → 45.
// At z=4.2 / fov=45 the visible height at z=0 is:
//   2 × 4.2 × tan(22.5°) ≈ 3.477 world units
// Shell radius is unchanged (1.85) so the invR calc below stays valid.
// Rings are now INSIDE the shell so they can never clip the canvas.
const SHELL_RADIUS = 1.85
const SHELL_INV_R   = 1 / SHELL_RADIUS // 0.5405

function ParticleShell({ isConnected, isSpeaking }) {
  const ref = useRef(null)
  const volRef = useRef(0)
  const COUNT = 900

  const { positions, original, seeds } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    const orig = new Float32Array(COUNT * 3)
    const s = new Float32Array(COUNT * 2)

    for (let i = 0; i < COUNT; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / COUNT)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      const r = SHELL_RADIUS

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
    const targetOp = isConnected ? 0.65 + vol * 0.3 : 0.2
    mat.opacity += (targetOp - mat.opacity) * 0.07

    if (vol > 0.002) {
      const posArr = geo.attributes.position.array
      for (let i = 0; i < COUNT; i++) {
        const ix = i * 3
        const phase = seeds[i * 2]
        const weight = seeds[i * 2 + 1]

        const wave = Math.sin(t * 7 + phase) * vol * weight * 0.2

        const ox = original[ix]
        const oy = original[ix + 1]
        const oz = original[ix + 2]

        posArr[ix]     = ox + ox * SHELL_INV_R * wave
        posArr[ix + 1] = oy + oy * SHELL_INV_R * wave
        posArr[ix + 2] = oz + oz * SHELL_INV_R * wave
      }
      geo.attributes.position.array = posArr
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
        size={0.04}            /* was 0.025 — bigger, more readable dots */
        transparent
        opacity={0.3}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        vertexColors={false}
        color={IDLE_COLOR}
      />
    </points>
  )
}

function OrbitalRing({
  radius,
  tube,
  tilt,
  rotSpeed,
  isConnected,
  isSpeaking,
  phase = 0
}) {
  const ref = useRef(null)
  const matRef = useRef(null)
  const volRef = useRef(0)

  useFrame((_, delta) => {
    if (!ref.current || !matRef.current) return

    ref.current.rotation.y += delta * rotSpeed

    const t = performance.now() * 0.001 + phase
    let targetVol = 0
    if (isSpeaking) {
      targetVol = Math.abs(Math.sin(t * 8)) * 0.55 + 0.15
    } else if (isConnected) {
      targetVol = Math.abs(Math.sin(t * 1.4)) * 0.1
    }
    volRef.current += (targetVol - volRef.current) * 0.1
    const vol = volRef.current

    _ringColor.lerpColors(RING_COLOR, RING_GLOW, vol)
    matRef.current.color.copy(_ringColor)

    const targetOp = isConnected ? 0.12 + vol * 0.6 : 0.03
    matRef.current.opacity += (targetOp - matRef.current.opacity) * 0.09
  })

  return (
    <mesh ref={ref} rotation={[tilt, 0, 0]}>
      <torusGeometry args={[radius, tube, 2, 48]} />
      <meshBasicMaterial
        ref={matRef}
        color={RING_COLOR}
        transparent
        opacity={0.06}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}

function AIOrb({ isConnected, isSpeaking }) {
  const groupRef = useRef(null)

  useFrame((_, delta) => {
    if (!groupRef.current) return

    // ── NEW SCALES ──────────────────────────────────────────────
    // Old: 0.62 / 0.86 / 1.0  → disconnected sphere only filled ~60% of the box.
    // New: 0.82 / 0.92 / 1.0  → disconnected fills ~87%, idle ~92%, speaking ~97%.
    const targetScale = !isConnected ? 0.82 : isSpeaking ? 1.0 : 0.92
    _scaleVec.set(targetScale, targetScale, targetScale)
    groupRef.current.scale.lerp(_scaleVec, delta * 3)
    groupRef.current.rotation.y += delta * 0.03
  })

  return (
    <group ref={groupRef}>
      {/* Particle shell — outermost visual element */}
      <ParticleShell isConnected={isConnected} isSpeaking={isSpeaking} />

      {/* Rings — INSIDE the shell so they can never clip the canvas edges.
          (Old radii were 2.1 and 2.42 — both bigger than the shell, which is
          why the outer ring was getting cut off.) */}
      <OrbitalRing
        radius={1.55}
        tube={0.008}
        tilt={Math.PI * 0.1}
        rotSpeed={0.16}
        isConnected={isConnected}
        isSpeaking={isSpeaking}
        phase={0}
      />
      <OrbitalRing
        radius={1.72}
        tube={0.005}
        tilt={Math.PI * 0.42}
        rotSpeed={-0.1}
        isConnected={isConnected}
        isSpeaking={isSpeaking}
        phase={1.5}
      />
    </group>
  )
}

export default function AICore({
  isConnected = false,
  isSpeaking = false
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
      <Canvas
        style={{ width: '100%', height: '100%' }}
        /* Camera pulled in: z=5 → z=4.2, fov=42 → 45.
           This makes everything ~18% bigger at the same canvas size. */
        camera={{ position: [0, 0, 4.2], fov: 45 }}
        gl={{
          antialias: false,        // OFF: biggest GPU memory saving
          powerPreference: 'default',
          alpha: true,
          depth: false,            // not needed (additive blending only)
          stencil: false,
          precision: 'lowp'
        }}
        dpr={Math.min(window.devicePixelRatio, 1.5)}
        frameloop="always"
      >
        <AIOrb isConnected={isConnected} isSpeaking={isSpeaking} />
      </Canvas>
    </div>
  )
}
