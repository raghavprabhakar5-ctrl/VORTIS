import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const IDLE_COLOR  = new THREE.Color('#818cf8')
const ACTIVE_COLOR = new THREE.Color('#c084fc')
const _blendColor = new THREE.Color()
const _scaleVec = new THREE.Vector3()

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
    const targetOp = isConnected ? 0.90 + vol * 0.1 : 0.5
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
        size={0.05}                     
        transparent
        opacity={0.8}
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

    // 💡 ADJUSTED SCALES: Lowered slightly so it stays perfectly circular inside the container bounds
    const targetScale = !isConnected ? 1.0 : isSpeaking ? 1.35 : 1.15
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
        camera={{ position: [0, 0, 4.2], fov: 40 }} // 💡 FIXED CAMERA FRAME: Perfectly frames the large sphere without truncation
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