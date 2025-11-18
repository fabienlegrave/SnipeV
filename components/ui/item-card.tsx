import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/utils'
import { DEFAULT_BLUR_PLACEHOLDER, generateColorPlaceholder } from '@/lib/utils/imagePlaceholder'
import type { VintedItem } from '@/lib/types'
import {
  Heart,
  Eye,
  MapPin,
  Calendar,
  Package,
  Star,
  Zap,
  Truck,
  ShoppingCart,
  ExternalLink,
  Sparkles,
} from 'lucide-react'

interface ItemCardProps {
  item: VintedItem
  onFavorite?: (itemId: number) => void
  isFavoriting?: boolean
  showActions?: boolean
  compact?: boolean
  className?: string
}

export function ItemCard({
  item,
  onFavorite,
  isFavoriting = false,
  showActions = false,
  compact = false,
  className,
}: ItemCardProps) {
  const imageUrl = item.photos_data?.[0]?.full_size_url || item.images?.[0]
  const dominantColor = item.photos_data?.[0]?.dominant_color
  const photoCount = (item.photos_data?.length || item.images?.length || 0)

  return (
    <div className={cn('group relative', className)}>
      <Link href={`/items/${item.id}`}>
        <Card className="hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full border-0 shadow-md bg-white dark:bg-gray-800/50 overflow-hidden">
          <CardContent className="p-0">
            <div className={cn('relative w-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 overflow-hidden', compact ? 'h-40' : 'h-56')}>
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={item.title || 'Item'}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  placeholder="blur"
                  blurDataURL={
                    dominantColor
                      ? generateColorPlaceholder(dominantColor)
                      : DEFAULT_BLUR_PLACEHOLDER
                  }
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <Package className="h-12 w-12" />
                </div>
              )}

              {photoCount > 1 && (
                <Badge className="absolute top-2 left-2 bg-black/60 text-white text-xs backdrop-blur-sm">
                  {photoCount} photos
                </Badge>
              )}

              {item.is_reserved && (
                <Badge variant="destructive" className="absolute top-2 right-2">
                  Reserved
                </Badge>
              )}
              {item.can_buy && !item.is_reserved && (
                <Badge className="absolute top-2 right-2 bg-green-600">
                  Available
                </Badge>
              )}

              {item.gpt_deal_score && item.gpt_deal_score >= 70 && (
                <Badge className="absolute bottom-2 left-2 bg-amber-500 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Deal {item.gpt_deal_score}%
                </Badge>
              )}
            </div>

            <div className={cn('p-4', compact && 'p-3')}>
              <h3 className={cn('font-semibold line-clamp-2 min-h-[3rem] text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors', compact ? 'text-sm min-h-[2.5rem]' : 'text-base')}>
                {item.title || 'No title'}
              </h3>

              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <span className={cn('font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent', compact ? 'text-lg' : 'text-xl')}>
                    {formatPrice(item.price_amount, item.price_currency)}
                  </span>
                  {item.condition && (
                    <Badge variant="outline" className="text-xs">
                      {item.condition}
                    </Badge>
                  )}
                </div>
                {item.total_item_price_amount && item.total_item_price_amount !== item.price_amount && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                    <ShoppingCart className="h-3 w-3" />
                    <span>Total: {formatPrice(item.total_item_price_amount, item.total_item_price_currency || 'EUR')}</span>
                    {item.service_fee_amount && (
                      <span className="text-xs">(+{formatPrice(item.service_fee_amount, item.service_fee_currency || 'EUR')} fees)</span>
                    )}
                  </div>
                )}
              </div>

              {item.seller_login && !compact && (
                <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 dark:bg-gray-800 rounded p-2 mb-2">
                  {item.seller_photo_url && (
                    <div className="relative w-5 h-5 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                      <Image
                        src={item.seller_photo_url}
                        alt={item.seller_login}
                        fill
                        className="object-cover"
                        sizes="20px"
                      />
                    </div>
                  )}
                  <span className="truncate font-medium">{item.seller_login}</span>
                  {item.seller_is_business && (
                    <Badge variant="outline" className="text-xs">PRO</Badge>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
                {item.brand_title && (
                  <Badge variant="secondary" className="text-xs">
                    {item.brand_title}
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
              </div>

              <div className="flex items-center justify-between text-sm text-gray-600">
                <div className="flex items-center gap-3">
                  {item.favourite_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {item.favourite_count}
                    </span>
                  )}
                  {item.view_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {item.view_count}
                    </span>
                  )}
                </div>
                {item.added_since && (
                  <div className="flex items-center gap-1 text-xs">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {(() => {
                        const date = new Date(item.added_since)
                        const now = new Date()
                        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
                        if (diffDays === 0) return 'Today'
                        if (diffDays === 1) return 'Yesterday'
                        if (diffDays < 7) return `${diffDays}d`
                        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`
                        return `${Math.floor(diffDays / 30)}mo`
                      })()}
                    </span>
                  </div>
                )}
              </div>

              {showActions && (
                <div className="flex gap-2 pt-3 border-t mt-3">
                  <Button size="sm" variant="outline" className="flex-1" asChild>
                    <Link href={`/items/${item.id}`}>
                      Details
                    </Link>
                  </Button>
                  {onFavorite && (
                    <Button
                      size="sm"
                      variant="default"
                      disabled={isFavoriting}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onFavorite(item.id)
                      }}
                      className="flex-1"
                    >
                      {isFavoriting ? 'Adding...' : 'Add to Favorites'}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" asChild>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
