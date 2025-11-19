'use client'

import { useQuery } from '@tanstack/react-query'
import { Navigation } from '@/components/layout/Navigation'
import { Container } from '@/components/ui/container'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { supabaseClient } from '@/lib/supabase'
import { formatPrice } from '@/lib/utils'
import {
  LayoutDashboard,
  Package,
  Heart,
  TrendingUp,
  Bell,
  Search,
  Eye,
  Euro,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { DEFAULT_BLUR_PLACEHOLDER, generateColorPlaceholder } from '@/lib/utils/imagePlaceholder'
import type { VintedItem } from '@/lib/types'

const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET || 'vinted_scraper_secure_2024'

interface DashboardStats {
  totalItems: number
  favoriteItems: number
  availableItems: number
  avgPrice: number
  recentlyAdded: number
  activeAlerts: number
  aiAnalyzed: number
}

interface PriceAlert {
  id: number
  game_title: string
  platform: string | null
  max_price: number
  is_active: boolean
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data: items, error } = await supabaseClient
    .from('vinted_items')
    .select('price_amount, is_favorite, can_buy, scraped_at, ai_vision_confidence')

  if (error) throw error

  const now = new Date()
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const totalItems = items?.length || 0
  const favoriteItems = items?.filter(i => i.is_favorite === true).length || 0
  const availableItems = items?.filter(i => i.can_buy === true).length || 0
  const recentlyAdded = items?.filter(i => new Date(i.scraped_at) > last7Days).length || 0
  const aiAnalyzed = items?.filter(i => i.ai_vision_confidence && i.ai_vision_confidence >= 0.75).length || 0

  const prices = items?.map(i => i.price_amount).filter((p): p is number => p !== null) || []
  const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0

  const alertsResponse = await fetch('/api/v1/alerts?active_only=true', {
    headers: { 'x-api-key': API_SECRET }
  })
  const alertsData = await alertsResponse.json()
  const activeAlerts = alertsData.alerts?.length || 0

  return {
    totalItems,
    favoriteItems,
    availableItems,
    avgPrice,
    recentlyAdded,
    activeAlerts,
    aiAnalyzed,
  }
}

async function fetchRecentFavorites(): Promise<VintedItem[]> {
  const { data, error } = await supabaseClient
    .from('vinted_items')
    .select('*')
    .eq('is_favorite', true)
    .order('scraped_at', { ascending: false })
    .limit(6)

  if (error) throw error
  return data || []
}

async function fetchActiveAlerts(): Promise<PriceAlert[]> {
  const response = await fetch('/api/v1/alerts?active_only=true', {
    headers: { 'x-api-key': API_SECRET }
  })
  const data = await response.json()
  return data.alerts || []
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  })

  const { data: recentFavorites, isLoading: favoritesLoading } = useQuery({
    queryKey: ['recent-favorites'],
    queryFn: fetchRecentFavorites,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  })

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['active-alerts'],
    queryFn: fetchActiveAlerts,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <Navigation />

      <Container size="xl" className="py-8">
        <PageHeader
          icon={LayoutDashboard}
          title="Dashboard"
          description="Overview of your Vinted collection and activity"
          actions={
            <Button asChild>
              <Link href="/search">
                <Search className="h-4 w-4 mr-2" />
                New Search
              </Link>
            </Button>
          }
        />

        {statsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {Array(8).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard
                title="Total Items"
                value={stats.totalItems}
                icon={Package}
                description="In your collection"
                color="blue"
              />
              <StatCard
                title="Favorites"
                value={stats.favoriteItems}
                icon={Heart}
                description="Marked as favorite"
                color="red"
              />
              <StatCard
                title="Available"
                value={stats.availableItems}
                icon={TrendingUp}
                description="Ready to buy"
                color="green"
              />
              <StatCard
                title="Average Price"
                value={`${stats.avgPrice.toFixed(2)}€`}
                icon={Euro}
                description="Across all items"
                color="amber"
              />
              <StatCard
                title="Recent"
                value={stats.recentlyAdded}
                icon={Sparkles}
                description="Added last 7 days"
                color="purple"
              />
              <StatCard
                title="Active Alerts"
                value={stats.activeAlerts}
                icon={Bell}
                description="Monitoring prices"
                color="cyan"
              />
              <StatCard
                title="AI Analyzed"
                value={stats.aiAnalyzed}
                icon={Eye}
                description="Vision analysis done"
                color="blue"
              />
              <StatCard
                title="Analysis Rate"
                value={`${stats.totalItems > 0 ? Math.round((stats.aiAnalyzed / stats.totalItems) * 100) : 0}%`}
                icon={TrendingUp}
                description="Items analyzed"
                color="green"
              />
            </div>
          </>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-xl font-semibold">Recent Favorites</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/items" className="flex items-center gap-1">
                    View All
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {favoritesLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array(4).fill(0).map((_, i) => (
                      <Skeleton key={i} className="h-40" />
                    ))}
                  </div>
                ) : recentFavorites && recentFavorites.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {recentFavorites.map(item => (
                      <Link key={item.id} href={`/items/${item.id}`}>
                        <Card className="hover:shadow-lg transition-all duration-300 cursor-pointer overflow-hidden group">
                          <div className="flex gap-3 p-3">
                            <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                              {item.photos_data?.[0]?.full_size_url || item.images?.[0] ? (
                                <Image
                                  src={item.photos_data?.[0]?.full_size_url || item.images?.[0] || ''}
                                  alt={item.title || 'Item'}
                                  fill
                                  className="object-cover group-hover:scale-110 transition-transform duration-300"
                                  sizes="96px"
                                  placeholder="blur"
                                  blurDataURL={
                                    item.photos_data?.[0]?.dominant_color
                                      ? generateColorPlaceholder(item.photos_data[0].dominant_color)
                                      : DEFAULT_BLUR_PLACEHOLDER
                                  }
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="h-8 w-8 text-gray-300" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-sm line-clamp-2 mb-1 group-hover:text-blue-600 transition-colors">
                                {item.title}
                              </h4>
                              <p className="text-lg font-bold text-blue-600">
                                {formatPrice(item.price_amount, item.price_currency)}
                              </p>
                              {item.condition && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  {item.condition}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Heart}
                    title="No favorites yet"
                    description="Start adding items to your favorites from search results"
                    action={{
                      label: 'Search Items',
                      onClick: () => window.location.href = '/search',
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-xl font-semibold">Active Alerts</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/alerts" className="flex items-center gap-1">
                    Manage
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {alertsLoading ? (
                  <div className="space-y-3">
                    {Array(3).fill(0).map((_, i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : alerts && alerts.length > 0 ? (
                  <div className="space-y-3">
                    {alerts.slice(0, 5).map(alert => (
                      <div
                        key={alert.id}
                        className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{alert.game_title}</p>
                            {alert.platform && (
                              <p className="text-xs text-gray-500">{alert.platform}</p>
                            )}
                          </div>
                          <Badge className="bg-green-600 flex-shrink-0">
                            ≤ {alert.max_price}€
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {alerts.length > 5 && (
                      <p className="text-xs text-gray-500 text-center pt-2">
                        +{alerts.length - 5} more alerts
                      </p>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    icon={Bell}
                    title="No alerts"
                    description="Create price alerts to get notified of deals"
                    action={{
                      label: 'Create Alert',
                      onClick: () => window.location.href = '/alerts',
                    }}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href="/search">
                    <Search className="h-4 w-4 mr-2" />
                    New Search
                  </Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href="/items">
                    <Package className="h-4 w-4 mr-2" />
                    Browse Items
                  </Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href="/alerts">
                    <Bell className="h-4 w-4 mr-2" />
                    Manage Alerts
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  )
}
