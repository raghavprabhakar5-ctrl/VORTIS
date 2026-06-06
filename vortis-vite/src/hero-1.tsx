import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
)
const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
)
const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
)

const shaderSource = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)

float rnd(vec2 p) {
  p=fract(p*vec2(12.9898,78.233));
  p+=dot(p,p+34.56);
  return fract(p.x*p.y);
}
float noise(in vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float a=rnd(i), b=rnd(i+vec2(1,0)), c=rnd(i+vec2(0,1)), d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p) {
  float t=.0, a=1.; mat2 m=mat2(1.,-.5,.2,1.2);
  for (int i=0; i<5; i++) { t+=a*noise(p); p*=2.*m; a*=.5; }
  return t;
}
float clouds(vec2 p) {
  float d=1., t=.0;
  for (float i=.0; i<3.; i++) {
    float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);
    t=mix(t,d,a); d=a; p*=2./(i+1.);
  }
  return t;
}
void main(void) {
  vec2 uv=(FC-.5*R)/MN, st=uv*vec2(2,1);
  vec3 col=vec3(0);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for (float i=1.; i<12.; i++) {
    uv+=.1*cos(i*vec2(.1+.01*i,.8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    // Purple/violet/indigo palette instead of orange
    col+=.00125/d*(cos(sin(i)*vec3(2.5,1.5,4.0))+1.);
    float b=noise(i+p+bg*1.731);
    col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
    col=mix(col,vec3(bg*.05,bg*.03,bg*.25),d);
  }
  O=vec4(col,1);
}`;

function useShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
 const rafRef = useRef<number | undefined>(undefined)
  const glRef = useRef<WebGL2RenderingContext | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2')
    if (!gl) return
    glRef.current = gl

    const resize = () => {
      const dpr = Math.max(1, 0.5 * window.devicePixelRatio)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }

    const vs = compile(gl.VERTEX_SHADER, `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`)

    const fs = compile(gl.FRAGMENT_SHADER, shaderSource)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    programRef.current = prog

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1,-1,-1,1,1,1,-1]), gl.STATIC_DRAW)
    const pos = gl.getAttribLocation(prog, 'position')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)

    resize()
    window.addEventListener('resize', resize)

    const loop = (now: number) => {
      gl.useProgram(prog)
      gl.uniform2f(gl.getUniformLocation(prog, 'resolution'), canvas.width, canvas.height)
      gl.uniform1f(gl.getUniformLocation(prog, 'time'), now * 1e-3)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      gl.deleteProgram(prog)
    }
  }, [])

  return canvasRef
}

export function HeroLanding({ logo, navigation, title, description, announcementBanner, onLogin, authLoading, authError }: any) {
  const canvasRef = useShaderBackground()
  const [showAuthModal, setShowAuthModal] = useState(false)

  const nav = navigation || [
    { name: 'Pricing', href: '#' },
    { name: 'About', href: '#' },
    { name: 'Contact', href: '#' },
  ]

  const AUTH_BUTTONS = [
    { provider: 'google',   label: 'Continue with Google',   icon: <GoogleIcon /> },
    { provider: 'github',   label: 'Continue with GitHub',   icon: <GithubIcon /> },
    { provider: 'facebook', label: 'Continue with Facebook', icon: <FacebookIcon /> },
  ]

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#080810' }}>
      {/* Animated shader background */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />

      {/* Nav */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {logo?.src && <img alt={logo?.alt || 'Logo'} src={logo.src} style={{ height: 30, width: 'auto' }} />}
            {logo?.companyName && <span style={{ fontSize: 16, fontWeight: 700, color: 'white', letterSpacing: '.06em' }}>{logo.companyName}</span>}
          </div>

          <div style={{ display: 'flex', gap: 36 }}>
            {nav.map((item: any) => (
              <a key={item.name} href={item.href} style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.65)', textDecoration: 'none' }}>
                {item.name}
              </a>
            ))}
          </div>

          <button
            onClick={() => setShowAuthModal(true)}
            style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.65)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Sign In →
          </button>
        </nav>
      </div>

      {/* Hero content */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 24px' }}>
        {announcementBanner && (
          <div style={{ marginBottom: 24, padding: '6px 18px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)', fontSize: 13, backdropFilter: 'blur(8px)', background: 'rgba(255,255,255,0.05)' }}>
            {announcementBanner.text}{' '}
            <a href={announcementBanner.linkHref} style={{ color: 'rgba(200,180,255,0.9)', fontWeight: 600, textDecoration: 'none' }}>{announcementBanner.linkText} →</a>
          </div>
        )}

        <h1 style={{ fontSize: 'clamp(36px, 8vw, 80px)', fontWeight: 700, color: 'white', lineHeight: 1.1, letterSpacing: '-0.03em', maxWidth: 900, margin: '0 0 24px' }}>
          {title || 'Your intelligent AI companion for every task'}
        </h1>

        <p style={{ fontSize: 'clamp(15px, 2vw, 20px)', color: 'rgba(255,255,255,0.45)', maxWidth: 580, margin: 0, lineHeight: 1.65 }}>
          {description || 'Search the web, generate images, analyze documents, and hold natural conversations — all in one place.'}
        </p>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowAuthModal(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div style={{ background: '#0d0d18', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 380 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'white', margin: '0 0 4px' }}>Welcome to Vortis</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Sign in to continue</p>
              </div>
              <button onClick={() => setShowAuthModal(false)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {AUTH_BUTTONS.map(b => (
                <button
                  key={b.provider}
                  onClick={() => onLogin?.(b.provider)}
                  disabled={authLoading}
                  style={{ width: '100%', padding: '0 16px', height: 50, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, cursor: authLoading ? 'not-allowed' : 'pointer', color: 'rgba(255,255,255,0.85)', fontSize: 14, fontFamily: 'inherit', fontWeight: 500, transition: 'all .15s', opacity: authLoading ? 0.5 : 1 }}
                  onMouseEnter={e => { if (!authLoading) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{b.icon}</div>
                  <span style={{ flex: 1, textAlign: 'left' }}>{authLoading ? 'Opening…' : b.label}</span>
                  <svg width="12" height="12" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>

            {authError && <p style={{ fontSize: 12, color: '#f87171', marginTop: 12, textAlign: 'center' }}>{authError}</p>}
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 20, lineHeight: 1.8 }}>
              By continuing you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      )}
    </div>
  )
}