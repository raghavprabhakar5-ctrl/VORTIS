import { useState } from 'react'
import { Menu, X } from 'lucide-react'

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" style={{ display:'block' }}>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="white" style={{ display:'block' }}>
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
  </svg>
)

const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2" style={{ display:'block' }}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

interface NavigationItem {
  name: string
  href: string
}

interface AnnouncementBanner {
  text: string
  linkText: string
  linkHref: string
}

interface HeroLandingProps {
  logo?: { src: string; alt: string; companyName: string }
  navigation?: NavigationItem[]
  loginText?: string
  loginHref?: string
  title: string
  description: string
  announcementBanner?: AnnouncementBanner | null
  titleSize?: 'small' | 'medium' | 'large'
  gradientColors?: { from: string; to: string }
  className?: string
  // Auth props
  onLogin?: (provider: string) => void
  authLoading?: boolean
  authError?: string
}

export function HeroLanding({
  logo = { src: "https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=violet&shade=500", alt: "Vortis AI", companyName: "Vortis AI" },
  navigation = [
    { name: 'Pricing', href: '#' },
    { name: 'Resources', href: '#' },
    { name: 'About', href: '#' },
    { name: 'Contact', href: '#' },
  ],
  title = "Transform Your Business with AI-Powered Solutions",
  description = "Revolutionize your workflow with our cutting-edge artificial intelligence platform",
  announcementBanner = null,
  titleSize = "large",
  gradientColors = { from: "oklch(0.7 0.15 280)", to: "oklch(0.6 0.2 320)" },
  className = "",
  onLogin,
  authLoading = false,
  authError = "",
}: HeroLandingProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  const titleClass =
    titleSize === 'small' ? 'text-2xl sm:text-3xl md:text-5xl' :
    titleSize === 'medium' ? 'text-2xl sm:text-4xl md:text-6xl' :
    'text-3xl sm:text-5xl md:text-7xl'

  const AUTH_BUTTONS = [
    { provider: 'google',   label: 'Continue with Google',   icon: <GoogleIcon />   },
    { provider: 'github',   label: 'Continue with GitHub',   icon: <GithubIcon />   },
    { provider: 'facebook', label: 'Continue with Facebook', icon: <FacebookIcon /> },
  ]

  return (
    <div className={`min-h-screen w-screen overflow-x-hidden relative ${className}`} style={{ background: '#080810' }}>
      {/* Top gradient */}
      <div aria-hidden="true" className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
        <div
          style={{
            clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
            background: `linear-gradient(to top right, ${gradientColors.from}, ${gradientColors.to})`
          }}
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] max-w-none -translate-x-1/2 rotate-[30deg] opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
        />
      </div>

      {/* Bottom gradient */}
      <div aria-hidden="true" className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]">
        <div
          style={{
            clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
            background: `linear-gradient(to top right, ${gradientColors.from}, ${gradientColors.to})`
          }}
          className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] max-w-none -translate-x-1/2 opacity-30 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"
        />
      </div>

      {/* Nav */}
      <header className="absolute inset-x-0 top-0 z-10">
        <nav className="flex items-center justify-between p-4 sm:p-6 lg:px-8">
          <div className="flex lg:flex-1">
            <a href="#" className="-m-1.5 p-1.5">
              <span className="sr-only">{logo.companyName}</span>
              <img alt={logo.alt} src={logo.src} className="h-6 sm:h-8 w-auto" />
            </a>
          </div>

          <div className="flex lg:hidden">
            <button type="button" onClick={() => setMobileMenuOpen(true)} className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-400">
              <Menu className="size-6" />
            </button>
          </div>

          <div className="hidden lg:flex lg:gap-x-8 xl:gap-x-12">
            {navigation.map((item) => (
              <a key={item.name} href={item.href} className="text-sm font-semibold text-white/70 hover:text-white transition-colors">
                {item.name}
              </a>
            ))}
          </div>

          <div className="hidden lg:flex lg:flex-1 lg:justify-end">
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-sm font-semibold text-white/70 hover:text-white transition-colors"
            >
              Sign In →
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-black/90 px-6 py-6">
            <div className="flex items-center justify-between">
              <img alt={logo.alt} src={logo.src} className="h-8 w-auto" />
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="-m-2.5 rounded-md p-2.5 text-gray-400">
                <X className="size-6" />
              </button>
            </div>
            <div className="mt-6 space-y-2">
              {navigation.map((item) => (
                <a key={item.name} href={item.href} className="block rounded-lg px-3 py-2 text-base font-semibold text-white hover:bg-white/10 transition-colors">
                  {item.name}
                </a>
              ))}
              <button
                onClick={() => { setMobileMenuOpen(false); setShowAuthModal(true); }}
                className="block w-full text-left rounded-lg px-3 py-2 text-base font-semibold text-white hover:bg-white/10 transition-colors"
              >
                Sign In
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Hero content */}
      <div className="relative isolate px-6 min-h-screen flex flex-col justify-center">
        <div className="mx-auto max-w-4xl text-center">
          {announcementBanner && (
            <div className="mb-6 flex justify-center">
              <div className="relative rounded-full px-3 py-1 text-sm text-white/50 ring-1 ring-white/20 hover:ring-white/40 transition-all">
                {announcementBanner.text}{' '}
                <a href={announcementBanner.linkHref} className="font-semibold text-white/80 hover:text-white transition-colors">
                  {announcementBanner.linkText} →
                </a>
              </div>
            </div>
          )}

          <h1 className={`${titleClass} font-semibold tracking-tight text-balance text-white`}>
            {title}
          </h1>
          <p className="mt-6 sm:mt-8 text-base sm:text-lg font-medium text-white/50 sm:text-xl/8">
            {description}
          </p>

          {/* Get Started button */}
          <div className="mt-10 flex justify-center">
            <button
              onClick={() => setShowAuthModal(true)}
              style={{
                padding: '14px 36px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 12,
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all .2s',
                backdropFilter: 'blur(8px)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.18)'; e.currentTarget.style.transform='translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.1)'; e.currentTarget.style.transform='none'; }}
            >
              Get Started →
            </button>
          </div>
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}
        >
          <div style={{ background: '#0d0d18', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 380, animation: 'fadeUp .2s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 4 }}>Welcome to Vortis</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Sign in to continue</p>
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
                  style={{
                    width: '100%', padding: '0 16px', height: 50,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12,
                    cursor: authLoading ? 'not-allowed' : 'pointer',
                    color: 'rgba(255,255,255,0.85)', fontSize: 14,
                    fontFamily: 'inherit', fontWeight: 500,
                    transition: 'all .15s', opacity: authLoading ? 0.5 : 1
                  }}
                  onMouseEnter={e => { if (!authLoading) { e.currentTarget.style.background='rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)'; } }}
                  onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'; }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {b.icon}
                  </div>
                  <span style={{ flex: 1, textAlign: 'left' }}>{authLoading ? 'Opening…' : b.label}</span>
                  <svg width="12" height="12" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>

            {authError && <p style={{ fontSize: 12, color: '#f87171', marginTop: 12, textAlign: 'center', fontFamily: 'monospace' }}>{authError}</p>}

            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 20, lineHeight: 1.8 }}>
              By continuing you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export type { HeroLandingProps, NavigationItem, AnnouncementBanner }