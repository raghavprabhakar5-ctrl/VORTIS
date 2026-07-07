import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

// Theme colors — match :root variables in App.jsx
const IDLE_COLOR   = new THREE.Color('#6366f1') // indigo (resting)
const ACTIVE_COLOR = new THREE.Color('#8b5cf6') // violet (speaking)
const _blendColor  = new THREE.Color()
const _scaleVec    = new THREE.Vector3()

// ── FINAL TUNED SIZE ──────────────────────────────────────────────
// Shell radius 1.55, camera at z=4.5, fov=42°
//   → visible height at z=0 = 2 × 4.5 × tan(21°) ≈ 3.455 world units
//   → shell diameter = 3.1
//
// Fill at each state:
//   disconnected (scale 0.92):  1.55 × 2 × 0.92 / 3.455 = 83%
//   idle / listening (scale 1.0): 1.55 × 2 / 3.455 = 90%
//   speaking (scale 1.0):         90%
//   speaking PEAK PULSE (radius ×1.12): 1.55 × 1.12 × 2 / 3.455 = 101%
//      → only 1% clip at the absolute loudest micro-instant of speech.
//        Invisible in practice.
//
// ⚠️  THE SPHERE WILL ONLY LOOK BIG IF THE WRAPPER DIV IN App.jsx IS BIG.
//     AICore fills 100% of its parent — make the parent big.
//     Recommended wrapper: 480 × 480 (see App.jsx change below).
const SHELL_RADIUS = 1.55
const SHELL_INV_R  = 1 / SHELL_RADIUS
const CAM_Z        = 4.5
const DOT_SIZE     = 0.05

function ParticleShell({ isConnected, isSpeaking }) {
  const ref = useRef(null)
  const volRef = useRef(0)
  const COUNT = 900

  const { positions, original, seeds } = useMemo(() => {
    const pos  = new Float32Array(COUNT * 3)
    const orig = new Float32Array(COUNT * 3)
    const s    = new Float32Array(COUNT * 2)

    for (let i = 0; i < COUNT; i++) {
      const phi   = Math.acos(1 - (2 * (i + 0.5)) / COUNT)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      const r     = SHELL_RADIUS

      const px = r * Math.sin(phi) * Math.cos(theta)
      const py = r * Math.sin(phi) * Math.sin(theta)
      const pz = r * Math.cos(phi)

      pos[i * 3]     = px
      pos[i * 3 + 1] = py
      pos[i * 3 + 2] = pz
      orig[i * 3]     = px
      orig[i * 3 + 1] = py
      orig[i * 3 + 2] = pz

      s[i * 2]     = Math.random() * Math.PI * 2
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
        const ix     = i * 3
        const phase  = seeds[i * 2]
        const weight = seeds[i * 2 + 1]

        const wave = Math.sin(t * 7 + phase) * vol * weight * 0.2

        const ox = original[ix]
        const oy = original[ix + 1]
        const oz = original[ix + 2]

        posArr[ix]     = ox + ox * SHELL_INV_R * wave
        posArr[ix + 1] = oy + oy * SHELL_INV_R * wave
        posArr[ix + 2] = oz + oz * SHELL_INV_R * wave
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
        size={DOT_SIZE}
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

function AIOrb({ isConnected, isSpeaking }) {
  const groupRef = useRef(null)

  useFrame((_, delta) => {
    if (!groupRef.current) return

    // Scales kept close to 1.0 — sphere stays big in every state.
    // Old version had 0.62 for disconnected which made it tiny.
    const targetScale = !isConnected ? 0.92 : 1.0
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
    <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
      <Canvas
        style={{ width: '100%', height: '100%' }}
        camera={{ position: [0, 0, CAM_Z], fov: 42 }}
        gl={{
          antialias: false,
          powerPreference: 'default',
          alpha: true,
          depth: false,
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
