import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ItemCard } from '@/components/ui/item-card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import type { VintedItem } from '@/lib/types'
import { Grid, List, Package } from 'lucide-react'

interface ItemsGridProps {
  items: VintedItem[]
  isLoading?: boolean
  onFavorite?: (itemId: number) => void
  favoritingIds?: Set<number>
  showActions?: boolean
  emptyState?: {
    title: string
    description: string
    actionLabel?: string
    onAction?: () => void
  }
  className?: string
}

export function ItemsGrid({
  items,
  isLoading = false,
  onFavorite,
  favoritingIds = new Set(),
  showActions = false,
  emptyState,
  className,
}: ItemsGridProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  if (!isLoading && items.length === 0 && emptyState) {
    return (
      <EmptyState
        icon={Package}
        title={emptyState.title}
        description={emptyState.description}
        action={
          emptyState.actionLabel && emptyState.onAction
            ? {
                label: emptyState.actionLabel,
                onClick: emptyState.onAction,
              }
            : undefined
        }
      />
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </p>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className="h-8"
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="h-8"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
            : 'flex flex-col gap-4'
        )}
      >
        {items.map(item => (
          <ItemCard
            key={item.id}
            item={item}
            onFavorite={onFavorite}
            isFavoriting={favoritingIds.has(item.id)}
            showActions={showActions}
            compact={viewMode === 'list'}
            className={viewMode === 'list' ? 'w-full' : ''}
          />
        ))}
      </div>
    </div>
  )
}
