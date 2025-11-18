import { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  description?: string
  trend?: {
    value: number
    label: string
  }
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'cyan'
  className?: string
}

const colorClasses = {
  blue: {
    icon: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-100 dark:bg-blue-950',
    value: 'text-blue-600 dark:text-blue-400',
    trend: 'text-blue-600',
  },
  green: {
    icon: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-100 dark:bg-emerald-950',
    value: 'text-emerald-600 dark:text-emerald-400',
    trend: 'text-emerald-600',
  },
  amber: {
    icon: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-100 dark:bg-amber-950',
    value: 'text-amber-600 dark:text-amber-400',
    trend: 'text-amber-600',
  },
  red: {
    icon: 'text-red-600 dark:text-red-400',
    iconBg: 'bg-red-100 dark:bg-red-950',
    value: 'text-red-600 dark:text-red-400',
    trend: 'text-red-600',
  },
  purple: {
    icon: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-purple-100 dark:bg-purple-950',
    value: 'text-purple-600 dark:text-purple-400',
    trend: 'text-purple-600',
  },
  cyan: {
    icon: 'text-cyan-600 dark:text-cyan-400',
    iconBg: 'bg-cyan-100 dark:bg-cyan-950',
    value: 'text-cyan-600 dark:text-cyan-400',
    trend: 'text-cyan-600',
  },
}

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  color = 'blue',
  className,
}: StatCardProps) {
  const colors = colorClasses[color]

  return (
    <Card className={cn('hover:shadow-lg transition-shadow duration-300', className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              {title}
            </p>
            <p className={cn('text-3xl font-bold mb-2', colors.value)}>{value}</p>
            {description && (
              <p className="text-xs text-gray-500 dark:text-gray-500">{description}</p>
            )}
            {trend && (
              <div className={cn('flex items-center gap-1 mt-2 text-sm font-medium', colors.trend)}>
                <span>{trend.value > 0 ? '↑' : '↓'}</span>
                <span>{Math.abs(trend.value)}%</span>
                <span className="text-gray-500 text-xs">{trend.label}</span>
              </div>
            )}
          </div>
          <div className={cn('p-3 rounded-xl', colors.iconBg)}>
            <Icon className={cn('h-6 w-6', colors.icon)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
