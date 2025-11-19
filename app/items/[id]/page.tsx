'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Navigation } from '@/components/layout/Navigation'
import { PhotoGallery } from '@/components/ui/enhanced-image'
import { GPTAnalysis } from '@/components/ui/gpt-analysis'
import { VisionFactsDisplay } from '@/components/ui/vision-facts-display'
import { supabaseClient } from '@/lib/supabase'
import { formatPrice, formatDate } from '@/lib/utils'
import type { VintedItem } from '@/lib/types'
import { ArrowLeft, ExternalLink, RefreshCw, Package, ShoppingCart, Truck, Shield, User, Euro, Gamepad2, MapPin, Tag, Star } from 'lucide-react'

const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET || 'vinted_scraper_secure_2024'

async function fetchItem(id: string): Promise<VintedItem | null> {
  const { data, error } = await supabaseClient
    .from('vinted_items')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return data
}

async function enrichItem(id: number) {
  const response = await fetch('/api/v1/scrape/enrich', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_SECRET
    },
    body: JSON.stringify({ ids: [id] })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.details || error.error || `HTTP ${response.status}`)
  }

  const enrichedItems = await response.json()
  return enrichedItems[0] || null
}

export default function ItemDetailPage() {
  const params = useParams()
  const itemId = params.id as string

  const {
    data: item,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => fetchItem(itemId),
    enabled: !!itemId,
    refetchOnWindowFocus: false
  })

  const enrichMutation = useMutation({
    mutationFn: () => enrichItem(Number(itemId)),
    onSuccess: () => {
      refetch()
    }
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-6xl mx-auto">
            <Skeleton className="h-8 w-32 mb-6" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Skeleton className="h-96 rounded-lg" />
              <div className="space-y-4">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Item not found</h1>
            <p className="text-gray-600 mb-6">The requested item could not be found in the database.</p>
            <Button asChild>
              <Link href="/items">Back to Items</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Back Button */}
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/items" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Items
            </Link>
          </Button>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Images avec galerie enrichie */}
            <div className="space-y-4">
              <Card className="overflow-hidden">
                <PhotoGallery
                  photos={item.photos_data || undefined}
                  fallbackImages={item.images || undefined}
                  alt={item.title || 'Item image'}
                  className="w-full"
                />
              </Card>
            </div>

            {/* Details */}
            <div className="space-y-6">
              <div>
                <div className="flex items-start justify-between mb-4">
                  <h1 className="text-3xl font-bold text-gray-900 leading-tight">
                    {item.title || 'No title'}
                  </h1>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => enrichMutation.mutate()}
                      disabled={enrichMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${enrichMutation.isPending ? 'animate-spin' : ''}`} />
                      Re-enrich
                    </Button>
                    <Button asChild size="sm">
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4" />
                        View on Vinted
                      </a>
                    </Button>
                  </div>
                </div>

                {/* Prix et frais détaillés */}
                <div className="space-y-2 mb-6">
                  <div className="text-4xl font-bold text-blue-600">
                    {formatPrice(item.price_amount, item.price_currency)}
                  </div>
                  {item.total_item_price_amount && item.total_item_price_amount !== item.price_amount && (
                    <div className="text-lg text-gray-600 flex items-center gap-2">
                      <Euro className="h-4 w-4" />
                      <span>Prix total: <span className="font-semibold">{formatPrice(item.total_item_price_amount, item.total_item_price_currency || 'EUR')}</span></span>
                      {item.service_fee_amount && (
                        <span className="text-sm">(+{formatPrice(item.service_fee_amount, item.service_fee_currency || 'EUR')} frais Vinted)</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Badges de statut */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {item.can_buy && !item.is_reserved && (
                    <Badge className="bg-green-600 flex items-center gap-1">
                      <ShoppingCart className="h-3 w-3" />
                      Available
                    </Badge>
                  )}
                  {item.is_reserved && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Reserved
                    </Badge>
                  )}
                  {item.can_instant_buy && (
                    <Badge className="bg-purple-600">Instant Buy</Badge>
                  )}
                  {item.condition && (
                    <Badge variant="outline">{item.condition}</Badge>
                  )}
                  {item.is_promoted && (
                    <Badge className="bg-yellow-500 flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      Promoted
                    </Badge>
                  )}
                </div>

                {/* Métadonnées enrichies */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {/* Prioriser les données IA Vision si disponibles */}
                  {((item.ai_vision_confidence >= 0.75 && item.ai_platform) || 
                    (!item.ai_platform && item.detected_platform && item.detected_platform !== 'unknown')) && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                      <Gamepad2 className="h-5 w-5 text-blue-600" />
                      <div>
                        <div className="font-medium text-blue-900">Plateforme</div>
                        <div className="text-sm text-blue-700 capitalize">
                          {item.ai_platform || item.detected_platform}
                        </div>
                      </div>
                    </div>
                  )}
                  {((item.ai_vision_confidence >= 0.75 && item.ai_condition_grade) || 
                    (!item.ai_condition_grade && item.condition_bucket && item.condition_bucket !== 'unknown')) && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                      <Package className="h-5 w-5 text-green-600" />
                      <div>
                        <div className="font-medium text-green-900">État</div>
                        <div className="text-sm text-green-700 capitalize">
                          {item.ai_condition_grade || item.condition_bucket}
                        </div>
                      </div>
                    </div>
                  )}
                  {((item.ai_vision_confidence >= 0.75 && item.ai_region) || 
                    (!item.ai_region && item.detected_region && item.detected_region !== 'unknown')) && (
                    <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg">
                      <MapPin className="h-5 w-5 text-purple-600" />
                      <div>
                        <div className="font-medium text-purple-900">Région</div>
                        <div className="text-sm text-purple-700">
                          {item.ai_region || item.detected_region}
                        </div>
                      </div>
                    </div>
                  )}
                  {item.brand_title && (
                    <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg">
                      <Tag className="h-5 w-5 text-orange-600" />
                      <div>
                        <div className="font-medium text-orange-900">Marque</div>
                        <div className="text-sm text-orange-700">{item.brand_title}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Jeu normalisé */}
                {/* Afficher seulement si pas encore analysé par l'IA */}
                {item.normalized_game_title && !item.ai_vision_confidence && (
                  <div className="p-4 bg-blue-50 rounded-lg mb-6">
                    <div className="font-medium text-blue-900 mb-1">🎮 Jeu détecté</div>
                    <div className="text-blue-700 font-mono">{item.normalized_game_title}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      ⚠️ Détection heuristique - L'IA Vision fournira des données plus précises
                    </div>
                  </div>
                )}

                {/* Informations vendeur */}
                {item.seller_login && (
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Vendeur
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4">
                        {item.seller_photo_url && (
                          <div className="relative w-12 h-12 rounded-full overflow-hidden">
                            <Image
                              src={item.seller_photo_url}
                              alt={`Photo de ${item.seller_login}`}
                              fill
                              className="object-cover"
                            />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.seller_login}</span>
                            {item.seller_is_business && (
                              <Badge variant="outline" className="text-xs">PRO</Badge>
                            )}
                          </div>
                          {item.seller_profile_url && (
                            <a 
                              href={item.seller_profile_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                            >
                              Voir le profil
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Analyse GPT complète */}
                {item.ai_vision_confidence >= 0.75 && (
                  <VisionFactsDisplay item={item} />
                )}
                
                {item.gpt_analysis && (
                  <GPTAnalysis item={item} />
                )}

                {/* Métadonnées de recherche */}
                {item.search_score && (
                  <div className="p-3 bg-gray-50 rounded-lg mb-6">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Score de recherche:</span>
                      <span className="font-medium">{item.search_score.toFixed(2)}</span>
                    </div>
                    {item.content_source && (
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-gray-600">Source:</span>
                        <span className="font-medium capitalize">{item.content_source}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>


              {/* Description */}
              {item.description && (
                <Card>
                  <CardHeader>
                    <CardTitle>Description</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Fees */}
              {(item.shipping_fee !== null || item.protection_fee_amount !== null) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      Shipping & Fees
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {item.shipping_fee !== null && (
                      <div className="flex justify-between">
                        <span>Shipping Fee</span>
                        <span className="font-medium">
                          {formatPrice(item.shipping_fee, item.price_currency)}
                        </span>
                      </div>
                    )}
                    {item.protection_fee_amount !== null && (
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span>Buyer Protection</span>
                          <span className="font-medium">
                            {formatPrice(item.protection_fee_amount, item.price_currency)}
                          </span>
                        </div>
                        {item.protection_fee_note && (
                          <p className="text-sm text-green-600">{item.protection_fee_note}</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Meta Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Item Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Item ID</span>
                    <span className="font-mono">{item.id}</span>
                  </div>
                  {item.added_since && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Listed</span>
                      <span>{item.added_since}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Scraped</span>
                    <span>{formatDate(item.scraped_at || null)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}