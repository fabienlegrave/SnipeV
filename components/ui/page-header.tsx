import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
  className?: string
  gradient?: boolean
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  gradient = true,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-8', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            {Icon && (
              <div className="flex-shrink-0 p-2 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl shadow-lg">
                <Icon className="h-6 w-6 text-white" />
              </div>
            )}
            <h1
              className={cn(
                'text-3xl md:text-4xl font-bold truncate',
                gradient
                  ? 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 dark:from-white dark:via-gray-100 dark:to-gray-300 bg-clip-text text-transparent'
                  : 'text-gray-900 dark:text-white'
              )}
            >
              {title}
            </h1>
          </div>
          {description && (
            <p className="text-base text-gray-600 dark:text-gray-400 max-w-3xl">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
