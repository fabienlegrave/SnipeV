'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { useTokenStore } from '@/lib/tokenStore.client'
import { VintedItem } from '@/lib/types/core'
import { logger } from '@/lib/logger'
import { useToast } from '@/components/ui/toast'
import { RefreshCw, ExternalLink, Heart, Eye, MapPin, Calendar, Package, AlertCircle, Search, Star, Truck, Plus, Zap } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { DEFAULT_BLUR_PLACEHOLDER, generateColorPlaceholder } from '@/lib/utils/imagePlaceholder'
import { Navigation } from '@/components/layout/Navigation'
import { formatPrice } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface HomepageResponse {
  items: VintedItem[]
  nextPageToken?: string
  homepageSessionId: string
  hasMore: boolean
  totalItems: number
}

export default function HomepagePage() {
  const { fullCookies } = useTokenStore()
  const toast = useToast()
  const queryClient = useQueryClient()
  
  const [homepageSessionId, setHomepageSessionId] = useState<string | undefined>()
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [allItems, setAllItems] = useState<VintedItem[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isLoadingAll, setIsLoadingAll] = useState(false)
  const [loadAllPages, setLoadAllPages] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'relevance' | 'price-asc' | 'price-desc' | 'date-asc' | 'date-desc'>('relevance')
  
  // Vérifier si les cookies contiennent access_token_web (nécessaire pour l'endpoint homepage)
  const hasAccessToken = fullCookies ? fullCookies.includes('access_token_web=') : false

  // Fonction pour récupérer les items homepage
  const fetchHomepageItems = async (pageToken?: string, sessionId?: string): Promise<HomepageResponse> => {
    if (!fullCookies) {
      throw new Error('Cookies requis pour accéder à la homepage')
    }

    const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET || 'vinted_scraper_secure_2024'
    
    const response = await fetch('/api/v1/homepage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_SECRET
      },
      body: JSON.stringify({
        fullCookies,
        nextPageToken: pageToken,
        homepageSessionId: sessionId,
        getAllPages: false
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return response.json()
  }

  // Query principale pour charger la première page ou toutes les pages
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['homepage', homepageSessionId, loadAllPages],
    queryFn: async () => {
      if (loadAllPages) {
        // Charger toutes les pages disponibles
        setIsLoadingAll(true)
        try {
          const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET || 'vinted_scraper_secure_2024'
          const response = await fetch('/api/v1/homepage', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': API_SECRET
            },
            body: JSON.stringify({
              fullCookies,
              homepageSessionId,
              getAllPages: true,
              maxPages: 50 // Limite à 50 pages pour récupérer un maximum d'items
            })
          })

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || `HTTP ${response.status}`)
          }

          const result = await response.json()
          return {
            items: result.items,
            nextPageToken: undefined,
            homepageSessionId: result.homepageSessionId,
            hasMore: false,
            totalItems: result.items.length
          }
        } finally {
          setIsLoadingAll(false)
        }
      } else {
        return fetchHomepageItems(undefined, homepageSessionId)
      }
    },
    enabled: !!fullCookies && hasAccessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1
  })

  // Mettre à jour les items et la session ID quand les données arrivent
  useEffect(() => {
    if (data) {
      setAllItems(data.items)
      setHomepageSessionId(data.homepageSessionId)
      setNextPageToken(data.nextPageToken)
    }
  }, [data])

  // Filtrer et trier les items
  const filteredAndSortedItems = useMemo(() => {
    let filtered = [...allItems]

    // Filtre par nom
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase()
      filtered = filtered.filter(item => 
        item.title?.toLowerCase().includes(queryLower) ||
        item.description?.toLowerCase().includes(queryLower)
      )
    }

    // Trier
    switch (sortBy) {
      case 'price-asc':
        filtered.sort((a, b) => {
          const priceA = a.price?.amount ?? Infinity
          const priceB = b.price?.amount ?? Infinity
          return priceA - priceB
        })
        break
      case 'price-desc':
        filtered.sort((a, b) => {
          const priceA = a.price?.amount ?? 0
          const priceB = b.price?.amount ?? 0
          return priceB - priceA
        })
        break
      case 'date-asc':
        filtered.sort((a, b) => {
          const dateA = a.added_since ? new Date(a.added_since).getTime() : 0
          const dateB = b.added_since ? new Date(b.added_since).getTime() : 0
          return dateA - dateB
        })
        break
      case 'date-desc':
        filtered.sort((a, b) => {
          const dateA = a.added_since ? new Date(a.added_since).getTime() : Infinity
          const dateB = b.added_since ? new Date(b.added_since).getTime() : Infinity
          return dateB - dateA
        })
        break
      case 'relevance':
      default:
        // Garder l'ordre original (déjà trié par pertinence par Vinted)
        break
    }

    return filtered
  }, [allItems, searchQuery, sortBy])

  // Charger plus d'items (pagination)
  const loadMore = async () => {
    if (!nextPageToken || !homepageSessionId || isLoadingMore) return

    setIsLoadingMore(true)
    try {
      const result = await fetchHomepageItems(nextPageToken, homepageSessionId)
      setAllItems(prev => [...prev, ...result.items])
      setNextPageToken(result.nextPageToken)
      
      toast.success(`${result.items.length} nouveaux items ajoutés`)
    } catch (error) {
      logger.error('Erreur chargement homepage', error as Error)
      toast.error(error instanceof Error ? error.message : 'Impossible de charger plus d\'items')
    } finally {
      setIsLoadingMore(false)
    }
  }

  // Recharger depuis le début
  const handleRefresh = () => {
    setAllItems([])
    setNextPageToken(undefined)
    setHomepageSessionId(undefined)
    setLoadAllPages(false)
    queryClient.invalidateQueries({ queryKey: ['homepage'] })
    refetch()
  }

  // Charger toutes les pages
  const handleLoadAll = () => {
    setLoadAllPages(true)
    setAllItems([])
    setNextPageToken(undefined)
    setHomepageSessionId(undefined)
    queryClient.invalidateQueries({ queryKey: ['homepage'] })
    refetch()
  }

  if (!fullCookies) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Cookies requis pour accéder à la homepage. Veuillez configurer vos cookies Vinted.
          </AlertDescription>
        </Alert>
      </div>
    )
  }
  
  if (!hasAccessToken) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Authentification incomplète</strong><br/>
            L'endpoint homepage nécessite un <code>access_token_web</code> (authentification complète).<br/>
            Les cookies Cloudflare/Datadome seuls ne suffisent pas pour cet endpoint.<br/>
            <br/>
            Pour utiliser la homepage, vous devez :
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Vous connecter sur vinted.fr dans votre navigateur</li>
              <li>Copier les cookies complets depuis DevTools (incluant <code>access_token_web</code>)</li>
              <li>Les coller dans le TokenManager</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
                Recommandations Vinted
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Items personnalisés basés sur votre historique de recherche
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleLoadAll}
                disabled={isLoading || isLoadingAll}
                variant="default"
                className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingAll ? 'animate-spin' : ''}`} />
                {isLoadingAll ? 'Chargement...' : 'Tout charger'}
              </Button>
              <Button
                onClick={handleRefresh}
                disabled={isLoading || isLoadingAll}
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Actualiser
              </Button>
            </div>
          </div>

          {(isLoading || isLoadingAll) && (
            <div className="mb-4">
              <Progress value={undefined} className="h-2" />
              <p className="text-sm text-gray-500 mt-2">
                {isLoadingAll ? `Chargement de toutes les pages... (${allItems.length} items trouvés)` : 'Chargement des recommandations...'}
              </p>
            </div>
          )}
        </div>

        {/* Erreur */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error instanceof Error ? error.message : 'Erreur lors du chargement'}
            </AlertDescription>
          </Alert>
        )}

        {/* Filtres et tri */}
        {allItems.length > 0 && (
          <Card className="mb-6 border-0 shadow-md bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Recherche par nom */}
                <div className="flex-1">
                  <Label htmlFor="search" className="text-sm mb-2 block">Rechercher par nom</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="search"
                      type="text"
                      placeholder="Rechercher dans les items..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                {/* Tri */}
                <div className="md:w-48">
                  <Label htmlFor="sortBy" className="text-sm mb-2 block">Trier par</Label>
                  <select
                    id="sortBy"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="relevance">Pertinence</option>
                    <option value="price-asc">Prix ↑</option>
                    <option value="price-desc">Prix ↓</option>
                    <option value="date-asc">Date ↑</option>
                    <option value="date-desc">Date ↓</option>
                  </select>
                </div>
              </div>
              {searchQuery && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {filteredAndSortedItems.length} {filteredAndSortedItems.length === 1 ? 'résultat' : 'résultats'} sur {allItems.length}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Résultats */}
        {allItems.length > 0 && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {filteredAndSortedItems.length} {filteredAndSortedItems.length === 1 ? 'item trouvé' : 'items trouvés'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAndSortedItems.map((item) => (
                <div key={item.id} className="relative group">
                  <Link href={item.url || `https://www.vinted.fr/items/${item.id}`} target="_blank" rel="noopener noreferrer">
                    <Card className="hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full border-0 shadow-md bg-white dark:bg-gray-800/50 overflow-hidden">
                      <CardContent className="p-0">
                        {/* Image */}
                        <div className="relative w-full h-56 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 overflow-hidden">
                          {item.photos?.[0]?.url ? (
                            <Image
                              src={item.photos[0].url}
                              alt={item.title || 'Item'}
                              fill
                              className="object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                              placeholder="blur"
                              blurDataURL={
                                item.photos[0].dominant_color
                                  ? generateColorPlaceholder(item.photos[0].dominant_color)
                                  : DEFAULT_BLUR_PLACEHOLDER
                              }
                              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <Package className="h-12 w-12" />
                            </div>
                          )}
                          {/* Multiple photos indicator */}
                          {item.photos && item.photos.length > 1 && (
                            <Badge className="absolute top-2 left-2 bg-black/60 text-white text-xs">
                              {item.photos.length} photos
                            </Badge>
                          )}
                        </div>

                        <div className="p-4">
                          {/* Title */}
                          <h3 className="font-semibold text-base mb-3 line-clamp-2 min-h-[3rem] text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {item.title}
                          </h3>

                          {/* Price */}
                          <div className="mb-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                                {formatPrice(item.price?.amount || null, item.price?.currency_code)}
                              </span>
                              {item.total_item_price && item.total_item_price.amount !== item.price?.amount && (
                                <span className="text-xs text-gray-500">
                                  Total: {formatPrice(item.total_item_price.amount, item.total_item_price.currency_code)}
                                </span>
                              )}
                            </div>
                            {/* Fees breakdown */}
                            {(item.shipping_fee || item.service_fee) && (
                              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                {item.shipping_fee && (
                                  <span className="flex items-center gap-1">
                                    <Truck className="h-3 w-3" />
                                    +{formatPrice(item.shipping_fee, item.price?.currency_code || 'EUR')}
                                  </span>
                                )}
                                {item.service_fee && (
                                  <span>
                                    +{formatPrice(
                                      typeof item.service_fee.amount === 'string' 
                                        ? parseFloat(item.service_fee.amount) 
                                        : item.service_fee.amount,
                                      item.service_fee.currency_code || item.price?.currency_code || 'EUR'
                                    )}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Seller Info */}
                          {item.seller && (
                            <div className="mb-2 space-y-1">
                              <div className="flex items-center gap-2 text-xs text-gray-600">
                                {item.seller.photo && (
                                  <div className="relative w-6 h-6 rounded-full overflow-hidden bg-gray-200">
                                    {item.seller.photo.thumbnails?.find(t => t.type === 'thumb50')?.url || item.seller.photo.url ? (
                                      <Image
                                        src={item.seller.photo.thumbnails?.find(t => t.type === 'thumb50')?.url || item.seller.photo.url || ''}
                                        alt={item.seller.login}
                                        fill
                                        className="object-cover"
                                        sizes="24px"
                                      />
                                    ) : null}
                                  </div>
                                )}
                                <span className="truncate">
                                  {item.seller.business && <Badge variant="outline" className="mr-1 text-xs">Pro</Badge>}
                                  {item.seller.login}
                                </span>
                              </div>
                              {/* Location */}
                              {item.location && (item.location.city || item.location.country) && (
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate">
                                    {[item.location.city, item.location.country].filter(Boolean).join(', ')}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Condition & Status */}
                          <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
                            {item.condition && (
                              <Badge variant="outline" className="text-xs">
                                {item.condition}
                              </Badge>
                            )}
                            {/* Badge depuis item_box (En demande, Pro, etc.) */}
                            {item.item_box?.badge?.title && (
                              <Badge className="bg-orange-500 text-white text-xs">
                                {item.item_box.badge.title}
                              </Badge>
                            )}
                            {item.brand_title && (
                              <Badge variant="secondary" className="text-xs">
                                {item.brand_title}
                              </Badge>
                            )}
                            {item.size_title && (
                              <Badge variant="secondary" className="text-xs">
                                {item.size_title}
                              </Badge>
                            )}
                            {item.is_promoted && (
                              <Badge className="bg-purple-500 text-xs">
                                <Star className="h-3 w-3 mr-1" />
                                Promoted
                              </Badge>
                            )}
                            {item.can_instant_buy && (
                              <Badge className="bg-blue-500 text-xs">
                                <Zap className="h-3 w-3 mr-1" />
                                Instant
                              </Badge>
                            )}
                            {item.favourite_count > 0 && (
                              <span className="text-gray-500 flex items-center gap-1">
                                <Heart className="h-3 w-3" />
                                {item.favourite_count}
                              </span>
                            )}
                            {item.view_count > 0 && (
                              <span className="text-gray-500 flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {item.view_count}
                              </span>
                            )}
                          </div>

                          {/* Availability & Date */}
                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex flex-col gap-1">
                              {item.is_reserved && (
                                <Badge variant="destructive" className="text-xs">
                                  Reserved
                                </Badge>
                              )}
                              {item.added_since && (
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <Calendar className="h-3 w-3" />
                                  <span>
                                    {(() => {
                                      const date = new Date(item.added_since)
                                      const now = new Date()
                                      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
                                      if (diffDays === 0) return 'Today'
                                      if (diffDays === 1) return 'Yesterday'
                                      if (diffDays < 7) return `${diffDays}d ago`
                                      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
                                      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                                    })()}
                                  </span>
                                </div>
                              )}
                            </div>
                            <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              ))}
            </div>

            {/* Bouton charger plus */}
            {data?.hasMore && nextPageToken && (
              <div className="mt-8 text-center">
                <Button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  variant="outline"
                  className="flex items-center gap-2 mx-auto"
                >
                  {isLoadingMore ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Chargement...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Charger plus d'items
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}

        {/* État vide */}
        {!isLoading && !error && allItems.length === 0 && (
          <div className="text-center py-12">
            <Package className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              Aucune recommandation disponible pour le moment
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

