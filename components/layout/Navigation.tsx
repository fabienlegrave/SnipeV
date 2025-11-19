'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Package, Settings, Database, Bell, Menu, X, LayoutDashboard, Home as HomeIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Button } from '@/components/ui/button'

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Overview and quick actions',
  },
  {
    href: '/search',
    label: 'Search',
    icon: Search,
    description: 'Smart search with AI filters',
  },
  {
    href: '/homepage',
    label: 'Feed',
    icon: HomeIcon,
    description: 'Vinted recommendations',
  },
  {
    href: '/items',
    label: 'Items',
    icon: Package,
    description: 'Browse your collection'
  },
  {
    href: '/alerts',
    label: 'Alerts',
    icon: Bell,
    description: 'Price alerts'
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    description: 'Configuration'
  }
]

export function Navigation() {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <>
      <nav className="bg-white/95 dark:bg-gray-950/95 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-800/50 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/dashboard" className="flex items-center space-x-3 group">
              <div className="relative">
                <Database className="h-7 w-7 text-blue-600 dark:text-blue-400 transition-transform group-hover:scale-110" />
                <div className="absolute inset-0 bg-blue-600/10 dark:bg-blue-400/10 rounded-lg blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                VintedScrap
              </span>
            </Link>

            <div className="flex items-center space-x-2">
              <ThemeToggle />

              <div className="hidden lg:flex items-center space-x-1">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname.startsWith(item.href)

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative",
                        isActive
                          ? "bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/50 dark:to-cyan-950/50 text-blue-700 dark:text-blue-300 shadow-sm"
                          : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      )}
                      title={item.description}
                    >
                      <Icon className={cn("h-4 w-4 transition-transform", isActive && "scale-110")} />
                      <span>{item.label}</span>
                      {isActive && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 rounded-full" />
                      )}
                    </Link>
                  )
                })}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="absolute right-0 top-16 bottom-0 w-64 bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-800 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname.startsWith(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/50 dark:to-cyan-950/50 text-blue-700 dark:text-blue-300 shadow-sm"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <div>
                      <div>{item.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{item.description}</div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}