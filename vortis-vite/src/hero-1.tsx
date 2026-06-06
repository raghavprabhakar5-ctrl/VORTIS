import { useState } from 'react'
import { Menu, X } from 'lucide-react'

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
}

export function HeroLanding({
  logo = { src: "https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=violet&shade=500", alt: "Vortis AI", companyName: "Vortis AI" },
  navigation = [
    { name: 'Pricing', href: '/pricing' },
    { name: 'Resources', href: '/resources' },
    { name: 'About', href: '/about' },
    { name: 'Contact', href: '/contact' },
  ],
  loginText = "Sign In",
  loginHref = "/login",
  title = "Transform Your Business with AI-Powered Solutions",
  description = "Revolutionize your workflow with our cutting-edge artificial intelligence platform",
  announcementBanner = null,
  titleSize = "large",
  gradientColors = { from: "oklch(0.7 0.15 280)", to: "oklch(0.6 0.2 320)" },
  className = ""
}: HeroLandingProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const titleClass =
    titleSize === 'small' ? 'text-2xl sm:text-3xl md:text-5xl' :
    titleSize === 'medium' ? 'text-2xl sm:text-4xl md:text-6xl' :
    'text-3xl sm:text-5xl md:text-7xl'

  return (
    <div className={`min-h-screen w-screen overflow-x-hidden relative ${className}`}>
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
              <span className="sr-only">Open menu</span>
              <Menu className="size-6" />
            </button>
          </div>

          <div className="hidden lg:flex lg:gap-x-8 xl:gap-x-12">
            {navigation.map((item) => (
              <a key={item.name} href={item.href} className="text-sm font-semibold text-foreground hover:text-muted-foreground transition-colors">
                {item.name}
              </a>
            ))}
          </div>

          <div className="hidden lg:flex lg:flex-1 lg:justify-end">
            <a href={loginHref} className="text-sm font-semibold text-foreground hover:text-muted-foreground transition-colors">
              {loginText} →
            </a>
          </div>
        </nav>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-black/90 px-6 py-6">
            <div className="flex items-center justify-between">
              <a href="#" className="-m-1.5 p-1.5">
                <img alt={logo.alt} src={logo.src} className="h-8 w-auto" />
              </a>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="-m-2.5 rounded-md p-2.5 text-gray-400">
                <span className="sr-only">Close menu</span>
                <X className="size-6" />
              </button>
            </div>
            <div className="mt-6 space-y-2">
              {navigation.map((item) => (
                <a key={item.name} href={item.href} className="block rounded-lg px-3 py-2 text-base font-semibold text-white hover:bg-white/10 transition-colors">
                  {item.name}
                </a>
              ))}
              <a href={loginHref} className="block rounded-lg px-3 py-2 text-base font-semibold text-white hover:bg-white/10 transition-colors">
                {loginText}
              </a>
            </div>
          </div>
        )}
      </header>

      {/* Hero content */}
      <div className="relative isolate px-6 min-h-screen flex flex-col justify-center">
        <div className="mx-auto max-w-4xl text-center">
          {announcementBanner && (
            <div className="mb-6 flex justify-center">
              <div className="relative rounded-full px-3 py-1 text-sm text-muted-foreground ring-1 ring-white/20 hover:ring-white/40 transition-all">
                {announcementBanner.text}{' '}
                <a href={announcementBanner.linkHref} className="font-semibold text-primary hover:text-primary/80 transition-colors">
                  {announcementBanner.linkText} →
                </a>
              </div>
            </div>
          )}

          <h1 className={`${titleClass} font-semibold tracking-tight text-balance text-foreground`}>
            {title}
          </h1>
          <p className="mt-6 sm:mt-8 text-base sm:text-lg font-medium text-muted-foreground sm:text-xl/8">
            {description}
          </p>
        </div>
      </div>
    </div>
  )
}

export type { HeroLandingProps, NavigationItem, AnnouncementBanner }