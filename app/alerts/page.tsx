'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Navigation } from '@/components/layout/Navigation'
import { useToast } from '@/components/ui/toast'
import { checkAlerts } from '@/lib/utils/alertChecker'
import { Bell, Plus, X, Edit, Trash2, CheckCircle2, XCircle, AlertCircle, RefreshCw, Clock, ExternalLink, Package, Heart, Eye, MapPin, Calendar, Star, Zap, Truck, Upload, FileText } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import type { ApiItem } from '@/lib/types/core'
import { formatPrice } from '@/lib/utils'
import { DEFAULT_BLUR_PLACEHOLDER, generateColorPlaceholder } from '@/lib/utils/imagePlaceholder'
import { logger } from '@/lib/logger'

// Mapping des états vers les status_ids de l'API Vinted
const CONDITION_STATUS_IDS: Record<string, string> = {
  'neuf': '6,1',
  'tres_bon_etat': '2',
  'bon_etat': '3'
}

const CONDITION_LABELS: Record<string, string> = {
  'neuf': 'Neuf',
  'tres_bon_etat': 'Très bon état',
  'bon_etat': 'Bon état'
}

// Convertir les status_ids en états sélectionnés
function statusIdsToConditions(statusIds: string | null): string[] {
  if (!statusIds) return []
  const conditions: string[] = []
  for (const [key, value] of Object.entries(CONDITION_STATUS_IDS)) {
    const ids = value.split(',').map(id => id.trim())
    const statusIdsArray = statusIds.split(',').map(id => id.trim())
    if (ids.every(id => statusIdsArray.includes(id))) {
      conditions.push(key)
    }
  }
  return conditions
}

// Convertir les états sélectionnés en status_ids
function conditionsToStatusIds(conditions: string[]): string | null {
  if (conditions.length === 0) return null
  const allIds = new Set<string>()
  for (const condition of conditions) {
    const ids = CONDITION_STATUS_IDS[condition]?.split(',').map(id => id.trim()) || []
    ids.forEach(id => allIds.add(id))
  }
  return Array.from(allIds).sort().join(',')
}

interface PriceAlert {
  id: number
  game_title: string
  platform: string | null
  max_price: number
  condition: string | null // Stocke les status_ids (ex: "6,1" ou "2" ou "3")
  is_active: boolean
  created_at: string
  updated_at: string
  triggered_at: string | null
  triggered_count: number
}

const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET || 'vinted_scraper_secure_2024'

async function fetchAlerts(): Promise<PriceAlert[]> {
  const response = await fetch('/api/v1/alerts?active_only=false', {
    headers: {
      'x-api-key': API_SECRET
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch alerts')
  }

  const data = await response.json()
  return data.alerts || []
}

interface CheckResult {
  success: boolean
  checkedAt: string
  alertsChecked: number
  itemsChecked: number
  totalItemsChecked?: number
  matches: Array<{
    alertId: number
    alertTitle: string
    matchReason: string
    item: ApiItem
  }>
  updatedAlerts: number[]
  stats?: {
    skippedUnavailable: number
    skippedPrice: number
    skippedPlatform: number
    skippedTitle: number
  }
  debugInfo?: Array<{
    alert: string
    item: string
    reason: string
  }>
  error?: string
}

export default function AlertsPage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<{ alerts: any[]; errors: any[]; duplicates: any[] } | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [editingAlert, setEditingAlert] = useState<PriceAlert | null>(null)
  const [newAlert, setNewAlert] = useState({
    game_title: '',
    platform: '',
    max_price: '',
    conditions: [] as string[] // Array des clés d'états sélectionnés
  })
  const [isChecking, setIsChecking] = useState(false)
  const [lastCheckResult, setLastCheckResult] = useState<CheckResult | null>(null)
  const [uniqueMatches, setUniqueMatches] = useState<Array<{ alertId: number; alertTitle: string; matchReason: string; item: ApiItem }>>([])
  const [isFilteringDuplicates, setIsFilteringDuplicates] = useState(false)
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true)
  const [checkInterval, setCheckInterval] = useState(5) // Intervalle en minutes
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['price-alerts'],
    queryFn: fetchAlerts
  })

  // Fonction pour vérifier les alertes
  const handleCheckAlerts = async () => {
    setIsChecking(true)
    setIsFilteringDuplicates(true)
    try {
      const result = await checkAlerts(5) // Récupérer jusqu'à 5 pages
      setLastCheckResult(result)
      
      // Filtrer les doublons en vérifiant en base
      if (result.matches.length > 0) {
        const ids = result.matches.map(m => m.item.id)
        try {
          const response = await fetch('/api/v1/missing-ids', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': API_SECRET
            },
            body: JSON.stringify({ ids })
          })
          
          if (response.ok) {
            const { missing } = await response.json()
            const missingIds = new Set(missing)
            const unique = result.matches.filter(m => missingIds.has(m.item.id))
            setUniqueMatches(unique)
            
            // Sauvegarder les items uniques en base de données
            if (unique.length > 0) {
              try {
                const itemsToSave = unique.map(m => m.item)
                const upsertResponse = await fetch('/api/v1/upsert', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': API_SECRET
                  },
                  body: JSON.stringify(itemsToSave)
                })
                
                if (upsertResponse.ok) {
                  const upsertResult = await upsertResponse.json()
                  toast.success(`🎯 ${unique.length} nouveau(x) match(s) trouvé(s) et sauvegardé(s) (${result.matches.length - unique.length} déjà en base)`)
                } else {
                  toast.warning(`🎯 ${unique.length} nouveau(x) match(s) trouvé(s), mais erreur lors de la sauvegarde`)
                }
              } catch (error) {
                logger.warn('Failed to save items to database', error as Error)
                toast.warning(`🎯 ${unique.length} nouveau(x) match(s) trouvé(s), mais erreur lors de la sauvegarde`)
              }
            } else {
              toast.info(`✅ ${result.matches.length} match(s) trouvé(s), mais tous sont déjà en base`)
            }
          } else {
            // Si la vérification échoue, afficher tous les matches
            setUniqueMatches(result.matches)
            toast.success(`🎯 ${result.matches.length} match(s) trouvé(s) !`)
          }
        } catch (error) {
          // En cas d'erreur, afficher tous les matches
          setUniqueMatches(result.matches)
          toast.success(`🎯 ${result.matches.length} match(s) trouvé(s) !`)
        }
        queryClient.invalidateQueries({ queryKey: ['price-alerts'] })
      } else {
        setUniqueMatches([])
        toast.info(`✅ Vérification terminée: ${result.itemsChecked} items vérifiés, aucun match`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Erreur lors de la vérification: ${errorMessage}`)
      setLastCheckResult({
        success: false,
        checkedAt: new Date().toISOString(),
        alertsChecked: 0,
        itemsChecked: 0,
        matches: [],
        updatedAlerts: [],
        error: errorMessage
      })
      setUniqueMatches([])
    } finally {
      setIsChecking(false)
      setIsFilteringDuplicates(false)
    }
  }

  const activeAlerts = alerts.filter(a => a.is_active)
  const inactiveAlerts = alerts.filter(a => !a.is_active)

  // Vérification automatique selon l'intervalle configuré
  useEffect(() => {
    if (!autoCheckEnabled || activeAlerts.length === 0) return

    // Vérifier immédiatement au chargement
    handleCheckAlerts()

    // Puis selon l'intervalle configuré
    const intervalMs = checkInterval * 60 * 1000
    const interval = setInterval(() => {
      handleCheckAlerts()
    }, intervalMs)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheckEnabled, activeAlerts.length, checkInterval])

  const createMutation = useMutation({
    mutationFn: async (alert: { game_title: string; platform?: string; max_price: number; condition?: string }) => {
      const response = await fetch('/api/v1/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET
        },
        body: JSON.stringify(alert)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create alert')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-alerts'] })
      setShowCreateForm(false)
      setNewAlert({ game_title: '', platform: '', max_price: '', conditions: [] })
      toast.success('Price alert created')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const response = await fetch(`/api/v1/alerts/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET
        },
        body: JSON.stringify({ is_active })
      })

      if (!response.ok) {
        throw new Error('Failed to update alert')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-alerts'] })
      toast.success('Alert updated')
    },
    onError: () => {
      toast.error('Failed to update alert')
    }
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, game_title, platform, max_price, condition }: { id: number; game_title: string; platform?: string; max_price: number; condition?: string | null }) => {
      const response = await fetch(`/api/v1/alerts/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET
        },
        body: JSON.stringify({ game_title, platform, max_price, condition })
      })

      if (!response.ok) {
        throw new Error('Failed to update alert')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-alerts'] })
      setEditingAlert(null)
      toast.success('Alert updated')
    },
    onError: () => {
      toast.error('Failed to update alert')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/v1/alerts/${id}`, {
        method: 'DELETE',
        headers: {
          'x-api-key': API_SECRET
        }
      })

      if (!response.ok) {
        throw new Error('Failed to delete alert')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-alerts'] })
      toast.success('Alert deleted')
    },
    onError: () => {
      toast.error('Failed to delete alert')
    }
  })

  // Import mutations
  const parseImportMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await fetch('/api/v1/alerts/import', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET
        },
        body: JSON.stringify({ text })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to parse import')
      }

      return response.json()
    },
    onSuccess: (data) => {
      setImportPreview({
        alerts: data.alerts || [],
        errors: data.errorsList || [],
        duplicates: data.duplicatesList || []
      })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const importMutation = useMutation({
    mutationFn: async (alerts: any[]) => {
      const response = await fetch('/api/v1/alerts/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET
        },
        body: JSON.stringify({ alerts, skipDuplicates: true })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to import alerts')
      }

      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['price-alerts'] })
      setShowImportDialog(false)
      setImportText('')
      setImportPreview(null)
      toast.success(`✅ ${data.created} alertes créées${data.skipped > 0 ? `, ${data.skipped} déjà existantes` : ''}${data.duplicates > 0 ? `, ${data.duplicates} doublons ignorés` : ''}`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setImportText(text)
      handleParseImport(text)
    }
    reader.readAsText(file)
  }

  const handleParseImport = (text: string) => {
    if (!text.trim()) {
      toast.warning('Le texte est vide')
      return
    }

    setIsParsing(true)
    parseImportMutation.mutate(text, {
      onSettled: () => {
        setIsParsing(false)
      }
    })
  }

  const handleImportAlerts = () => {
    if (!importPreview || importPreview.alerts.length === 0) {
      toast.warning('Aucune alerte valide à importer')
      return
    }

    importMutation.mutate(importPreview.alerts)
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAlert.game_title.trim() || !newAlert.max_price) {
      toast.warning('Please fill in all required fields')
      return
    }

    const statusIds = conditionsToStatusIds(newAlert.conditions)
    createMutation.mutate({
      game_title: newAlert.game_title.trim(),
      platform: newAlert.platform.trim() || undefined,
      max_price: parseFloat(newAlert.max_price),
      condition: statusIds || undefined
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <Bell className="h-8 w-8 text-yellow-500" />
                Price Alerts
              </h1>
              <p className="text-gray-600 mt-1">
                Get notified when items match your price criteria (checked against homepage recommendations)
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={handleCheckAlerts}
                disabled={isChecking || activeAlerts.length === 0}
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-50"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
                {isChecking ? 'Checking...' : 'Check Now'}
              </Button>
              <Button
                onClick={() => setShowImportDialog(true)}
                variant="outline"
                className="border-purple-600 text-purple-600 hover:bg-purple-50"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              <Button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Alert
              </Button>
            </div>
          </div>

          {/* Status Card - Simplified */}
          {lastCheckResult && (
            <Card className={lastCheckResult.success ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Last Check Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <p>
                    <strong>Checked:</strong> {new Date(lastCheckResult.checkedAt).toLocaleString()}
                  </p>
                  <p>
                    <strong>Alerts:</strong> {lastCheckResult.alertsChecked} | 
                    <strong> Items:</strong> {lastCheckResult.itemsChecked} | 
                    <strong> Matches:</strong> {lastCheckResult.matches.length}
                  </p>
                  {lastCheckResult.stats && (
                    <div className="text-xs text-gray-600 mt-2">
                      <p><strong>Stats:</strong> {lastCheckResult.stats.skippedUnavailable} non-disponibles, {lastCheckResult.stats.skippedPrice} prix trop élevés, {lastCheckResult.stats.skippedPlatform} plateforme, {lastCheckResult.stats.skippedTitle} titre</p>
                    </div>
                  )}
                  {lastCheckResult.error && (
                    <p className="text-red-600 mt-2">
                      <strong>Error:</strong> {lastCheckResult.error}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Matched Items Section */}
          {uniqueMatches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    Matched Items ({uniqueMatches.length})
                  </span>
                  {isFilteringDuplicates && (
                    <Badge variant="secondary" className="animate-pulse">
                      Filtering duplicates...
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Items found matching your alerts (duplicates filtered from database)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {uniqueMatches.map((match, idx) => {
                    const alert = alerts.find(a => a.id === match.alertId)
                    return (
                      <Link 
                        key={idx} 
                        href={match.item.url || '#'} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <Card className="hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer border-green-200 bg-white dark:bg-gray-800/50 overflow-hidden">
                          <CardContent className="p-0">
                            {/* Image */}
                            <div className="relative w-full h-56 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 overflow-hidden">
                              {match.item.photos?.[0]?.url ? (
                                <Image
                                  src={match.item.photos[0].url}
                                  alt={match.item.title || 'Item'}
                                  fill
                                  className="object-cover hover:scale-105 transition-transform duration-300"
                                  loading="lazy"
                                  placeholder="blur"
                                  blurDataURL={
                                    match.item.photos[0].dominant_color
                                      ? generateColorPlaceholder(match.item.photos[0].dominant_color)
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
                              {match.item.photos && match.item.photos.length > 1 && (
                                <Badge className="absolute top-2 left-2 bg-black/60 text-white text-xs">
                                  {match.item.photos.length} photos
                                </Badge>
                              )}
                              {/* Match badge */}
                              <Badge className="absolute top-2 right-2 bg-green-600 animate-pulse">
                                Match!
                              </Badge>
                              {/* Alert badge */}
                              {alert && (
                                <Badge className="absolute bottom-2 left-2 bg-blue-600/90 text-white text-xs">
                                  {match.alertTitle}
                                </Badge>
                              )}
                            </div>

                            <div className="p-4 space-y-2">
                              {/* Title */}
                              <h4 className="font-semibold text-base line-clamp-2 min-h-[3rem] text-gray-900 dark:text-white hover:text-green-600 dark:hover:text-green-400 transition-colors">
                                {match.item.title}
                              </h4>

                              {/* Price */}
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">
                                    {formatPrice(match.item.price?.amount || null, match.item.price?.currency_code)}
                                  </span>
                                  {alert && (
                                    <span className="text-xs text-gray-500">
                                      Max: {alert.max_price}€
                                    </span>
                                  )}
                                </div>
                                {match.item.total_item_price && match.item.total_item_price.amount !== match.item.price?.amount && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Total: {formatPrice(
                                      typeof match.item.total_item_price.amount === 'string' 
                                        ? parseFloat(match.item.total_item_price.amount) 
                                        : match.item.total_item_price.amount,
                                      match.item.total_item_price.currency_code
                                    )}
                                  </p>
                                )}
                                {/* Fees breakdown */}
                                {(match.item.shipping_fee || match.item.service_fee) && (
                                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                    {match.item.shipping_fee && (
                                      <span className="flex items-center gap-1">
                                        <Truck className="h-3 w-3" />
                                        +{formatPrice(match.item.shipping_fee, match.item.price?.currency_code || 'EUR')}
                                      </span>
                                    )}
                                    {match.item.service_fee && (
                                      <span>
                                        +{formatPrice(
                                          typeof match.item.service_fee.amount === 'string' 
                                            ? parseFloat(match.item.service_fee.amount) 
                                            : match.item.service_fee.amount,
                                          match.item.service_fee.currency_code || match.item.price?.currency_code || 'EUR'
                                        )}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Seller Info */}
                              {match.item.seller && (
                                <div className="mb-2 space-y-1">
                                  <div className="flex items-center gap-2 text-xs text-gray-600">
                                    {match.item.seller.photo && (
                                      <div className="relative w-6 h-6 rounded-full overflow-hidden bg-gray-200">
                                        {match.item.seller.photo.thumbnails?.find(t => t.type === 'thumb50')?.url || match.item.seller.photo.url ? (
                                          <Image
                                            src={match.item.seller.photo.thumbnails?.find(t => t.type === 'thumb50')?.url || match.item.seller.photo.url || ''}
                                            alt={match.item.seller.login || ''}
                                            fill
                                            className="object-cover"
                                            sizes="24px"
                                          />
                                        ) : null}
                                      </div>
                                    )}
                                    <span className="truncate">
                                      {match.item.seller.business && <Badge variant="outline" className="mr-1 text-xs">Pro</Badge>}
                                      {match.item.seller.login}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Condition & Status */}
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                {match.item.item_box?.badge?.title && (
                                  <Badge className="bg-blue-500 text-xs">
                                    {match.item.item_box.badge.title}
                                  </Badge>
                                )}
                                {match.item.condition && (
                                  <Badge variant="outline" className="text-xs">
                                    {match.item.condition}
                                  </Badge>
                                )}
                                {match.item.brand_title && (
                                  <Badge variant="secondary" className="text-xs">
                                    {match.item.brand_title}
                                  </Badge>
                                )}
                                {match.item.size_title && (
                                  <Badge variant="secondary" className="text-xs">
                                    {match.item.size_title}
                                  </Badge>
                                )}
                                {match.item.is_promoted && (
                                  <Badge className="bg-purple-500 text-xs">
                                    <Star className="h-3 w-3 mr-1" />
                                    Promoted
                                  </Badge>
                                )}
                                {match.item.can_instant_buy && (
                                  <Badge className="bg-blue-500 text-xs">
                                    <Zap className="h-3 w-3 mr-1" />
                                    Instant
                                  </Badge>
                                )}
                                {(match.item.favourite_count ?? 0) > 0 && (
                                  <span className="text-gray-500 flex items-center gap-1">
                                    <Heart className="h-3 w-3" />
                                    {match.item.favourite_count}
                                  </span>
                                )}
                                {(match.item.view_count ?? 0) > 0 && (
                                  <span className="text-gray-500 flex items-center gap-1">
                                    <Eye className="h-3 w-3" />
                                    {match.item.view_count}
                                  </span>
                                )}
                              </div>

                              {/* Added date */}
                              {match.item.added_since && (
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <Calendar className="h-3 w-3" />
                                  <span>
                                    {(() => {
                                      const date = new Date(match.item.added_since)
                                      const now = new Date()
                                      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
                                      if (diffDays === 0) return 'Today'
                                      if (diffDays === 1) return 'Yesterday'
                                      if (diffDays < 7) return `${diffDays} days ago`
                                      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
                                      return `${Math.floor(diffDays / 30)} months ago`
                                    })()}
                                  </span>
                                </div>
                              )}

                              {/* Match reason */}
                              <div className="pt-2 border-t border-gray-100">
                                <p className="text-xs text-green-600 font-medium">
                                  {match.matchReason}
                                </p>
                              </div>

                              {/* External link indicator */}
                              <div className="flex items-center justify-end pt-1">
                                <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
                                  <ExternalLink className="h-4 w-4" />
                                  <span>View on Vinted</span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Auto-check toggle */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Automatic Check</p>
                    <p className="text-sm text-gray-600">
                      Automatically checks homepage recommendations against your active alerts
                    </p>
                  </div>
                  <Button
                    variant={autoCheckEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAutoCheckEnabled(!autoCheckEnabled)}
                  >
                    {autoCheckEnabled ? 'Enabled' : 'Disabled'}
                  </Button>
                </div>
                {autoCheckEnabled && (
                  <div className="flex items-center gap-3 pt-2 border-t">
                    <Label htmlFor="check-interval" className="text-sm">Check interval:</Label>
                    <Input
                      id="check-interval"
                      type="number"
                      min="1"
                      max="60"
                      value={checkInterval}
                      onChange={(e) => setCheckInterval(Math.max(1, Math.min(60, parseInt(e.target.value) || 5)))}
                      className="w-20"
                    />
                    <span className="text-sm text-gray-600">minutes</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Create Form */}
          {showCreateForm && (
            <Card>
              <CardHeader>
                <CardTitle>Create Price Alert</CardTitle>
                <CardDescription>
                  Get notified when items are listed below your maximum price
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <Label htmlFor="game_title">Game Title *</Label>
                    <Input
                      id="game_title"
                      value={newAlert.game_title}
                      onChange={(e) => setNewAlert(prev => ({ ...prev, game_title: e.target.value }))}
                      placeholder="Ex: Zelda Breath of the Wild"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="platform">Platform (optional)</Label>
                    <Input
                      id="platform"
                      value={newAlert.platform}
                      onChange={(e) => setNewAlert(prev => ({ ...prev, platform: e.target.value }))}
                      placeholder="Ex: Switch, PS5, Xbox"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="max_price">Maximum Price (€) *</Label>
                    <Input
                      id="max_price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={newAlert.max_price}
                      onChange={(e) => setNewAlert(prev => ({ ...prev, max_price: e.target.value }))}
                      placeholder="50.00"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>Condition (optional)</Label>
                    <div className="space-y-2 mt-2">
                      {Object.entries(CONDITION_LABELS).map(([key, label]) => (
                        <Checkbox
                          key={key}
                          id={`condition_${key}`}
                          checked={newAlert.conditions.includes(key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewAlert(prev => ({
                                ...prev,
                                conditions: [...prev.conditions, key]
                              }))
                            } else {
                              setNewAlert(prev => ({
                                ...prev,
                                conditions: prev.conditions.filter(c => c !== key)
                              }))
                            }
                          }}
                          label={label}
                        />
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending ? 'Creating...' : 'Create Alert'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowCreateForm(false)
                        setNewAlert({ game_title: '', platform: '', max_price: '', conditions: [] })
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Import Dialog */}
          {showImportDialog && (
            <Card className="border-purple-200 bg-purple-50/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-purple-600" />
                  Import Alertes depuis un fichier
                </CardTitle>
                <CardDescription>
                  Collez votre liste ou importez un fichier .txt. Format: "Nom du jeu - Prix€"
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File Upload */}
                <div>
                  <Label htmlFor="file-upload">Importer un fichier</Label>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".txt,.text"
                    onChange={handleFileUpload}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Format attendu: "Nom du jeu - Prix€" (une ligne par alerte)
                  </p>
                </div>

                {/* Text Input */}
                <div>
                  <Label htmlFor="import-text">Ou collez votre liste ici</Label>
                  <textarea
                    id="import-text"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={`Valfaris - 35€
Gravity Circuit Recherche - 39€
Chasm - 50€
Blossom Tales - 150 €
Blossom Tales II - 80€`}
                    className="w-full min-h-[200px] p-3 border border-gray-300 rounded-md font-mono text-sm mt-1"
                  />
                </div>

                {/* Parse Button */}
                <Button
                  onClick={() => handleParseImport(importText)}
                  disabled={!importText.trim() || isParsing}
                  className="w-full"
                >
                  {isParsing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      Analyser la liste
                    </>
                  )}
                </Button>

                {/* Preview */}
                {importPreview && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{importPreview.alerts.length}</div>
                        <div className="text-gray-600">Alertes valides</div>
                      </div>
                      {importPreview.duplicates.length > 0 && (
                        <div className="text-center p-3 bg-yellow-50 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-600">{importPreview.duplicates.length}</div>
                          <div className="text-gray-600">Doublons</div>
                        </div>
                      )}
                      {importPreview.errors.length > 0 && (
                        <div className="text-center p-3 bg-red-50 rounded-lg">
                          <div className="text-2xl font-bold text-red-600">{importPreview.errors.length}</div>
                          <div className="text-gray-600">Erreurs</div>
                        </div>
                      )}
                    </div>

                    {/* Valid Alerts Preview */}
                    {importPreview.alerts.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-green-700">Alertes à créer:</h4>
                        <div className="max-h-[200px] overflow-y-auto space-y-1 text-sm">
                          {importPreview.alerts.map((alert, idx) => (
                            <div key={idx} className="p-2 bg-white rounded border border-green-200">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{alert.gameTitle}</span>
                                <Badge className="bg-green-600">≤ {alert.maxPrice}€</Badge>
                              </div>
                              {alert.platform && (
                                <div className="text-xs text-gray-500 mt-1">Plateforme: {alert.platform}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Errors */}
                    {importPreview.errors.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-red-700">Erreurs de parsing:</h4>
                        <div className="max-h-[150px] overflow-y-auto space-y-1 text-sm">
                          {importPreview.errors.map((error, idx) => (
                            <div key={idx} className="p-2 bg-red-50 rounded border border-red-200 text-red-700">
                              <div className="font-medium">Ligne {error.line}: {error.content}</div>
                              <div className="text-xs mt-1">{error.error}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Duplicates */}
                    {importPreview.duplicates.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-yellow-700">Doublons (seront ignorés):</h4>
                        <div className="max-h-[150px] overflow-y-auto space-y-1 text-sm">
                          {importPreview.duplicates.map((dup, idx) => (
                            <div key={idx} className="p-2 bg-yellow-50 rounded border border-yellow-200 text-yellow-700">
                              {dup.gameTitle} - {dup.maxPrice}€
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Import Button */}
                    {importPreview.alerts.length > 0 && (
                      <Button
                        onClick={handleImportAlerts}
                        disabled={importMutation.isPending}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                      >
                        {importMutation.isPending ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Import en cours...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Créer {importPreview.alerts.length} alerte{importPreview.alerts.length > 1 ? 's' : ''}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {/* Close Button */}
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowImportDialog(false)
                    setImportText('')
                    setImportPreview(null)
                  }}
                  className="w-full"
                >
                  Fermer
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Active Alerts - Simplified */}
          {activeAlerts.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Active Alerts ({activeAlerts.length})
              </h2>
              <div className="space-y-3">
                {activeAlerts.map((alert) => {
                  const recentMatches = lastCheckResult?.matches.filter(m => m.alertId === alert.id) || []
                  const isEditing = editingAlert?.id === alert.id
                  
                  return (
                    <Card key={alert.id} className={recentMatches.length > 0 ? 'border-green-300 bg-green-50/30' : ''}>
                      <CardContent className="p-4">
                        {isEditing ? (
                          <form onSubmit={(e) => {
                            e.preventDefault()
                            const formData = new FormData(e.currentTarget)
                            const selectedConditions: string[] = []
                            Object.keys(CONDITION_LABELS).forEach(key => {
                              if (formData.get(`condition_${key}`)) {
                                selectedConditions.push(key)
                              }
                            })
                            const statusIds = conditionsToStatusIds(selectedConditions)
                            updateMutation.mutate({
                              id: alert.id,
                              game_title: formData.get('game_title') as string,
                              platform: (formData.get('platform') as string) || undefined,
                              max_price: parseFloat(formData.get('max_price') as string),
                              condition: statusIds || undefined
                            })
                          }} className="space-y-3">
                            <div>
                              <Label htmlFor={`edit_game_title_${alert.id}`}>Game Title *</Label>
                              <Input
                                id={`edit_game_title_${alert.id}`}
                                name="game_title"
                                defaultValue={alert.game_title}
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor={`edit_platform_${alert.id}`}>Platform (optional)</Label>
                              <Input
                                id={`edit_platform_${alert.id}`}
                                name="platform"
                                defaultValue={alert.platform || ''}
                                placeholder="Ex: Switch, PS5, Xbox"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`edit_max_price_${alert.id}`}>Maximum Price (€) *</Label>
                              <Input
                                id={`edit_max_price_${alert.id}`}
                                name="max_price"
                                type="number"
                                step="0.01"
                                min="0"
                                defaultValue={alert.max_price}
                                required
                              />
                            </div>
                            <div>
                              <Label>Condition (optional)</Label>
                              <div className="space-y-2 mt-2">
                                {Object.entries(CONDITION_LABELS).map(([key, label]) => {
                                  const selectedConditions = statusIdsToConditions(alert.condition)
                                  return (
                                    <Checkbox
                                      key={key}
                                      id={`edit_condition_${alert.id}_${key}`}
                                      name={`condition_${key}`}
                                      defaultChecked={selectedConditions.includes(key)}
                                      label={label}
                                    />
                                  )
                                })}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                                {updateMutation.isPending ? 'Saving...' : 'Save'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingAlert(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold text-lg">{alert.game_title}</h3>
                                {alert.platform && (
                                  <Badge variant="outline">{alert.platform}</Badge>
                                )}
                                {alert.condition && (() => {
                                  const conditions = statusIdsToConditions(alert.condition)
                                  return conditions.map(cond => (
                                    <Badge key={cond} variant="outline">
                                      {CONDITION_LABELS[cond] || cond}
                                    </Badge>
                                  ))
                                })()}
                                <Badge className="bg-green-600">
                                  ≤ {alert.max_price}€
                                </Badge>
                                {recentMatches.length > 0 && (
                                  <Badge className="bg-yellow-500 animate-pulse">
                                    {recentMatches.length} match{recentMatches.length > 1 ? 'es' : ''}!
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-gray-600 space-y-1">
                                <p>Created: {new Date(alert.created_at).toLocaleDateString()}</p>
                                {alert.triggered_count > 0 && (
                                  <p className="text-yellow-600">
                                    Triggered {alert.triggered_count} time{alert.triggered_count > 1 ? 's' : ''}
                                    {alert.triggered_at && (
                                      <span> (last: {new Date(alert.triggered_at).toLocaleDateString()})</span>
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 ml-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingAlert(alert)}
                                disabled={updateMutation.isPending}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleMutation.mutate({ id: alert.id, is_active: false })}
                                disabled={toggleMutation.isPending}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteMutation.mutate(alert.id)}
                                disabled={deleteMutation.isPending}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Inactive Alerts */}
          {inactiveAlerts.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <XCircle className="h-5 w-5 text-gray-400" />
                Inactive Alerts ({inactiveAlerts.length})
              </h2>
              <div className="space-y-3">
                {inactiveAlerts.map((alert) => (
                  <Card key={alert.id} className="opacity-60">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-lg">{alert.game_title}</h3>
                            {alert.platform && (
                              <Badge variant="outline">{alert.platform}</Badge>
                            )}
                            {alert.condition && (() => {
                              const conditions = statusIdsToConditions(alert.condition)
                              return conditions.map(cond => (
                                <Badge key={cond} variant="outline">
                                  {CONDITION_LABELS[cond] || cond}
                                </Badge>
                              ))
                            })()}
                            <Badge variant="outline">
                              ≤ {alert.max_price}€
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleMutation.mutate({ id: alert.id, is_active: true })}
                            disabled={toggleMutation.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteMutation.mutate(alert.id)}
                            disabled={deleteMutation.isPending}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && alerts.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No price alerts yet</h3>
                <p className="text-gray-600 mb-4">
                  Create an alert to get notified when items match your criteria
                </p>
                <Button onClick={() => setShowCreateForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Alert
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Loading State */}
          {isLoading && (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-gray-500">Loading alerts...</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

