import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const IDLE_COLOR = new THREE.Color('#39ff14')
const ACTIVE_COLOR = new THREE.Color('#00ffff')
const RING_COLOR = new THREE.Color('#39ff14')
const RING_GLOW = new THREE.Color('#ccffb3')
const _blendColor = new THREE.Color()
const _ringColor = new THREE.Color()
const _scaleVec = new THREE.Vector3()

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
        const invR = 0.7692 // 1 / 1.3

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
        size={0.018}
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

    const targetScale = !isConnected ? 0.44 : isSpeaking ? 0.72 : 0.62
    _scaleVec.set(targetScale, targetScale, targetScale)
    groupRef.current.scale.lerp(_scaleVec, delta * 3)
    groupRef.current.rotation.y += delta * 0.03
  })

  return (
    <group ref={groupRef}>
      {/* Single particle shell (was 3) */}
      <ParticleShell isConnected={isConnected} isSpeaking={isSpeaking} />

      {/* Two rings (was 3) — enough for depth */}
      <OrbitalRing
        radius={1.5}
        tube={0.005}
        tilt={Math.PI * 0.1}
        rotSpeed={0.16}
        isConnected={isConnected}
        isSpeaking={isSpeaking}
        phase={0}
      />
      <OrbitalRing
        radius={1.72}
        tube={0.003}
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
        camera={{ position: [0, 0, 5], fov: 42 }}
        gl={{
          antialias: false, // ← OFF: biggest GPU memory saving
          powerPreference: 'default', // ← Not 'high-performance' (lets GPU throttle)
          alpha: true,
          depth: false, // ← OFF: not needed (additive blending only)
          stencil: false, // ← OFF: not used
          precision: 'lowp' // ← Low precision: halves GPU memory
        }}
        dpr={Math.min(window.devicePixelRatio, 1.5)} // ← Cap at 1.5x (was uncapped)
        frameloop="always"
      >
        <AIOrb isConnected={isConnected} isSpeaking={isSpeaking} />
      </Canvas>
    </div>
  )
}
