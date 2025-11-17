'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Clock, User, Key, Copy, Eye, EyeOff, Save, Trash2 } from 'lucide-react'
import { useTokenStore, getClientTokenStore } from '@/lib/tokenStore.client'
import { useCookieMonitor } from '@/lib/hooks/useCookieMonitor'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { logger } from '@/lib/logger'

interface TokenManagerProps {
  className?: string
}

interface TokenValidation {
  isValid: boolean
  error?: string
  details?: {
    statusCode: number
    message: string
    expiresAt?: string
    userId?: string
  }
  timestamp?: string
}

export function TokenManager({ className = '' }: TokenManagerProps) {
  const { token, tokenInfo, isValid, setToken, clearToken, updateValidation, fullCookies } = useTokenStore()
  const [isLoading, setIsLoading] = useState(false)
  const [newToken, setNewToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  
  // Monitoring automatique des cookies (pour le refresh token uniquement)
  const cookieMonitor = useCookieMonitor(60) // Vérifie toutes les heures
  const [renewalLogs, setRenewalLogs] = useState<string[]>([])
  const [isRenewing, setIsRenewing] = useState(false)
  const [isFetchingCookies, setIsFetchingCookies] = useState(false)
  
  // Mode cookies complets uniquement (le token simple ne fonctionne pas)

  // Initialisation du token au montage du composant
  useEffect(() => {
    if (typeof window !== 'undefined' && !isInitialized) {
      console.log('🔄 Initialisation TokenManager...')
      const store = getClientTokenStore()
      const currentToken = store.getTokenInfo()
      
      if (currentToken) {
        console.log('✅ Token trouvé lors de l\'initialisation:', {
          hasToken: !!currentToken.token,
          isValid: currentToken.isValid,
          tokenPreview: currentToken.token ? `${currentToken.token.substring(0, 10)}...` : 'None'
        })
      } else {
        console.log('❌ Aucun token trouvé lors de l\'initialisation')
      }
      
      setIsInitialized(true)
    }
  }, [isInitialized])

  // Convertir tokenInfo en format TokenValidation pour compatibilité
  const tokenStatus: TokenValidation | null = tokenInfo ? {
    isValid: tokenInfo.isValid,
    error: tokenInfo.error,
    details: {
      statusCode: tokenInfo.isValid ? 200 : 403,
      message: tokenInfo.isValid ? 'Token valide' : (tokenInfo.error || 'Token invalide'),
      expiresAt: tokenInfo.expiresAt?.toISOString(),
      userId: tokenInfo.userId
    },
    timestamp: tokenInfo.validatedAt.toISOString()
  } : null

  const checkTokenStatus = async () => {
    setIsLoading(true)
    try {
      // Récupérer le token actuel depuis le store client
      const currentToken = token || tokenInfo?.token
      
      if (!currentToken) {
        updateValidation({
          isValid: false,
          error: 'Aucun token disponible',
          details: {
            statusCode: 400,
            message: 'Aucun token trouvé dans le store'
          }
        })
        setIsLoading(false)
        return
      }
      
      // Envoyer le token dans le body pour validation côté serveur
      const response = await fetch('/api/v1/token/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NEXT_PUBLIC_API_SECRET || '',
        },
        body: JSON.stringify({ token: currentToken })
      })
      
      if (response.ok) {
        const result = await response.json()
        updateValidation(result)
      } else {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        console.error('❌ Token validation failed:', response.status, errorData)
        updateValidation({
          isValid: false,
          error: errorData.error || `HTTP ${response.status}`,
          details: {
            statusCode: response.status,
            message: errorData.details?.message || `Erreur de validation: ${response.statusText}`
          }
        })
      }
    } catch (error) {
      console.error('Error checking token status:', error)
      updateValidation({
        isValid: false,
        error: 'Erreur de vérification',
        details: {
          statusCode: 500,
          message: error instanceof Error ? error.message : 'Erreur inconnue'
        }
      })
    } finally {
      setIsLoading(false)
    }
  }

  const validateCookies = async (cookies: string) => {
    try {
      // Vérifier que c'est bien des cookies complets
      if (!cookies.includes('access_token_web=')) {
        return {
          isValid: false,
          error: 'Cookies invalides',
          details: {
            statusCode: 400,
            message: 'Les cookies doivent contenir access_token_web'
          }
        }
      }
      
      // Extraire le token pour la validation
      const tokenMatch = cookies.match(/access_token_web=([^;]+)/)
      const extractedToken = tokenMatch ? tokenMatch[1] : ''
      
      if (!extractedToken) {
        return {
          isValid: false,
          extractedToken: '',
          details: {
            statusCode: 400,
            message: 'Token non trouvé dans les cookies'
          }
        }
      }
      
      // Valider les cookies complets via l'endpoint de validation
      // IMPORTANT: Envoyer les cookies complets, pas juste le token
      const response = await fetch('/api/v1/token/validate', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.NEXT_PUBLIC_API_SECRET || 'vinted_scraper_secure_2024',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cookies: cookies }) // Envoyer les cookies complets
      })
      
      const result = await response.json()
      
      if (result.isValid) {
        return {
          isValid: true,
          extractedToken: extractedToken,
          details: {
            statusCode: 200,
            message: result.message || '✅ Token valide',
            cookiesValidated: true
          }
        }
      } else {
        return {
          isValid: false,
          error: result.error || 'Validation échouée',
          details: {
            statusCode: result.statusCode || 500,
            message: result.message || 'Cookies non fonctionnels'
          }
        }
      }
    } catch (error) {
      return {
        isValid: false,
        error: 'Erreur de validation',
        details: {
          statusCode: 500,
          message: 'Impossible de valider les cookies'
        }
      }
    }
  }

  const handleSaveToken = async () => {
    if (!newToken.trim()) {
      alert('Veuillez saisir un token')
      return
    }

    setIsSaving(true)
    try {
      // Valider d'abord les cookies
      console.log('🍪 Validation des cookies complets...')
      const validation = await validateCookies(newToken.trim())
      
              if (!validation.isValid) {
          alert(`Cookies invalides: ${validation.error}\n${validation.details?.message}`)
          return
        }

      // Sauvegarder avec le nouveau système TokenStore
      // IMPORTANT: Sauvegarder les cookies complets pour éviter les erreurs 403
      const tokenToSave = validation.extractedToken || newToken.trim()
      const fullCookiesToSave = newToken.trim() // Les cookies complets sont dans newToken
      await setToken(tokenToSave, validation, fullCookiesToSave)
      
      // Sauvegarder également en base de données pour GitHub Actions
      try {
        const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET || 'vinted_scraper_secure_2024'
        const saveResponse = await fetch('/api/v1/admin/vinted/save-cookies', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_SECRET
          },
          body: JSON.stringify({
            fullCookies: fullCookiesToSave,
            notes: 'Saved from TokenManager UI'
          })
        })
        
        if (saveResponse.ok) {
          console.log('✅ Cookies sauvegardés en base de données pour GitHub Actions')
        } else {
          const errorData = await saveResponse.json()
          console.warn('⚠️ Erreur lors de la sauvegarde en DB:', errorData)
          // Ne pas bloquer si la sauvegarde DB échoue, l'app fonctionne quand même
        }
      } catch (error) {
        console.warn('⚠️ Erreur lors de la sauvegarde en DB (non bloquant):', error)
        // Ne pas bloquer si la sauvegarde DB échoue
      }
       
      console.log('✅ Cookies sauvegardés dans l\'application (token + cookies complets)')
      setIsEditing(false)
      setNewToken('')
      
      alert('✅ Cookies mis à jour avec succès!\n\nL\'authentification Vinted est maintenant active dans l\'application et sauvegardée pour GitHub Actions !')
      
    } catch (error) {
      console.error('Error saving token:', error)
      alert('Erreur lors de la sauvegarde du token')
    } finally {
      setIsSaving(false)
    }
  }

  const copyTokenTemplate = () => {
    const template = newToken.trim()
    navigator.clipboard.writeText(template)
    alert('📋 Token copié dans le presse-papiers!')
  }

  const handleClearToken = () => {
    if (confirm('Êtes-vous sûr de vouloir supprimer le token actuel ?')) {
      clearToken()
      setIsEditing(false)
      setNewToken('')
      alert('🗑️ Token supprimé avec succès')
    }
  }

  const handleAutoFetchCookies = async () => {
    if (!fullCookies) {
      alert('❌ Aucun cookie disponible pour la récupération automatique')
      return
    }

    setIsFetchingCookies(true)
    setRenewalLogs([])
    
    const logs: string[] = []
    const addLog = (message: string) => {
      const timestamp = new Date().toLocaleTimeString()
      logs.push(`[${timestamp}] ${message}`)
      setRenewalLogs([...logs])
      logger.info(`🔄 Auto-fetch: ${message}`)
    }

    try {
      addLog('🔄 Début de la récupération automatique des cookies...')
      addLog('📡 Requête HEAD vers /how_it_works...')
      
      const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET || 'vinted_scraper_secure_2024'
      
      const response = await fetch('/api/v1/cookies/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET
        },
        body: JSON.stringify({
          fullCookies: fullCookies
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.success) {
        addLog('✅ Cookies récupérés avec succès!')
        addLog(`📦 ${result.cookieCount || 0} cookies mis à jour`)
        
        if (result.extractedToken) {
          addLog(`📝 Nouveau access token: ${result.extractedToken.substring(0, 20)}...`)
        }
        
        // Mettre à jour le token store avec les nouveaux cookies
        await setToken(
          result.extractedToken || token || '',
          {
            isValid: true,
            details: {
              statusCode: result.statusCode || 200,
              message: `✅ Cookies mis à jour automatiquement - ${result.cookieCount || 0} cookies`
            }
          },
          result.fullCookieString
        )
        
        addLog('💾 Cookies sauvegardés dans le store')
        addLog('✅ Processus terminé avec succès')
        
        // Re-vérifier le statut
        setTimeout(() => checkTokenStatus(), 1000)
      } else {
        addLog(`❌ Échec: ${result.error}`)
        if (result.details) {
          addLog(`   Détails: ${result.details}`)
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
      addLog(`❌ Erreur: ${errorMessage}`)
      logger.error('Erreur lors de la récupération automatique des cookies', error as Error)
    } finally {
      setIsFetchingCookies(false)
    }
  }

  const handleForceRefresh = async () => {
    if (!cookieMonitor.analysis?.refreshToken || !fullCookies) {
      alert('❌ Refresh token non disponible')
      return
    }

    setIsRenewing(true)
    setRenewalLogs([])
    
    const logs: string[] = []
    const addLog = (message: string) => {
      const timestamp = new Date().toLocaleTimeString()
      logs.push(`[${timestamp}] ${message}`)
      setRenewalLogs([...logs])
      logger.info(`🔄 Refresh: ${message}`)
    }

    try {
      addLog('🔄 Début du renouvellement forcé...')
      addLog(`📋 Refresh token trouvé: ${cookieMonitor.analysis.refreshToken.substring(0, 20)}...`)
      
      // Utiliser l'API route pour éviter les problèmes CORS
      addLog('🔍 Test des endpoints via API serveur...')
      
      const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET || 'vinted_scraper_secure_2024'
      
      const response = await fetch('/api/v1/token/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET
        },
        body: JSON.stringify({
          refreshToken: cookieMonitor.analysis.refreshToken,
          currentCookies: fullCookies
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.success) {
        addLog('✅ Renouvellement réussi!')
        addLog(`📝 Nouveau access token: ${result.newAccessToken?.substring(0, 20)}...`)
        
        // Mettre à jour le token store
        await setToken(
          result.newAccessToken!,
          { isValid: true, details: { statusCode: 200, message: 'Token renouvelé manuellement' } },
          result.newCookies
        )
        
        addLog('💾 Tokens sauvegardés dans le store')
        addLog('✅ Processus terminé avec succès')
        
        // Re-vérifier le statut
        setTimeout(() => checkTokenStatus(), 1000)
      } else {
        addLog(`❌ Échec: ${result.error}`)
        
        // Afficher les détails des tentatives
        if (result.attempts && result.attempts.length > 0) {
          addLog('')
          addLog('📊 Détails des tentatives (depuis le serveur):')
          addLog('─'.repeat(60))
          
          // Grouper par endpoint pour plus de clarté
          const byEndpoint = new Map<string, typeof result.attempts>()
          result.attempts.forEach(attempt => {
            if (!byEndpoint.has(attempt.endpoint)) {
              byEndpoint.set(attempt.endpoint, [])
            }
            byEndpoint.get(attempt.endpoint)!.push(attempt)
          })
          
          let attemptIndex = 1
          byEndpoint.forEach((attempts, endpoint) => {
            const bestAttempt = attempts.find(a => a.status === 200) || attempts[0]
            const bodyPreview = bestAttempt.body.substring(0, 70).replace(/\n/g, ' ').replace(/\s+/g, ' ')
            
            if (bestAttempt.status === 200) {
              addLog(`  ${attemptIndex}. ✅ ${endpoint}`)
              addLog(`     → HTTP ${bestAttempt.status} (SUCCÈS!)`)
              addLog(`     Format body: ${bodyPreview}...`)
            } else if (bestAttempt.status > 0) {
              addLog(`  ${attemptIndex}. ❌ ${endpoint}`)
              addLog(`     → HTTP ${bestAttempt.status}`)
              addLog(`     Format body: ${bodyPreview}...`)
              if (bestAttempt.error) {
                addLog(`     Erreur: ${bestAttempt.error}`)
              }
            } else {
              // Erreur réseau (pas de status HTTP)
              addLog(`  ${attemptIndex}. ❌ ${endpoint}`)
              addLog(`     → ${bestAttempt.error || 'Erreur réseau'}`)
              addLog(`     Format body: ${bodyPreview}...`)
            }
            attemptIndex++
          })
          
          addLog('─'.repeat(60))
          addLog(`📈 Total: ${result.attempts.length} tentatives (${byEndpoint.size} endpoints × ${result.attempts.length / byEndpoint.size} formats)`)
          addLog('')
          addLog('💡 Analyse:')
          if (result.attempts.every(a => a.status === 0)) {
            addLog('   • Toutes les requêtes échouent avant d\'atteindre Vinted')
            addLog('   • Possible: DNS, firewall, ou Vinted bloque les requêtes POST')
          } else if (result.attempts.some(a => a.status === 404)) {
            addLog('   • Certains endpoints retournent 404 (n\'existent pas)')
          } else if (result.attempts.some(a => a.status === 401 || a.status === 403)) {
            addLog('   • Certains endpoints retournent 401/403 (auth requise)')
            addLog('   • Les headers ou le format de body peuvent être incorrects')
          } else {
            addLog('   • Mélange de codes HTTP - certains endpoints existent mais refusent')
          }
        } else {
          addLog('⚠️ Aucune tentative enregistrée (erreur avant les requêtes)')
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
      addLog(`❌ Erreur: ${errorMessage}`)
      logger.error('Erreur lors du refresh forcé', error as Error)
    } finally {
      setIsRenewing(false)
    }
  }

  // Vérification automatique au montage
  // Le token est quand même affiché correctement car useTokenStore le charge depuis le localStorage
  // Ne pas appeler checkTokenStatus() automatiquement - l'utilisateur peut cliquer sur "Refresh" manuellement
    //   useEffect(() => {
    //     checkTokenStatus()
    //   }, [])

  const getStatusIcon = () => {
    if (isLoading) return <RefreshCw className="h-4 w-4 animate-spin" />
    if (!tokenStatus) return <AlertCircle className="h-4 w-4 text-gray-400" />
    return tokenStatus.isValid 
      ? <CheckCircle className="h-4 w-4 text-green-500" />
      : <XCircle className="h-4 w-4 text-red-500" />
  }

  const getStatusBadge = () => {
    if (isLoading) return <Badge variant="secondary">Vérification...</Badge>
    if (!tokenStatus) return <Badge variant="secondary">Inconnu</Badge>
    
    return tokenStatus.isValid 
      ? <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-300">
          ✅ Valide
        </Badge>
      : <Badge variant="secondary" className="bg-red-100 text-red-800 border-red-300">
          ❌ Invalide
        </Badge>
  }

  const formatExpiryDate = (dateStr?: string) => {
    if (!dateStr) return null
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diffHours = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60))
      
      if (diffHours < 0) {
        return `Expiré il y a ${Math.abs(diffHours)}h`
      } else if (diffHours < 24) {
        return `Expire dans ${diffHours}h`
      } else {
        const diffDays = Math.round(diffHours / 24)
        return `Expire dans ${diffDays}j`
      }
    } catch {
      return null
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Key className="h-5 w-5" />
            <span>Gestion du Token Vinted</span>
          </div>
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Key className="h-3 w-3 mr-1" />
              Modifier
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">

        {/* Logs de renouvellement / Auto Fetch */}
        {renewalLogs.length > 0 && (
          <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                {isFetchingCookies ? 'Logs de récupération automatique' : isRenewing ? 'Logs de renouvellement OAuth2' : 'Logs'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-60 overflow-y-auto font-mono text-xs bg-gray-900 text-green-400 p-3 rounded">
                {renewalLogs.map((log, index) => (
                  <div key={index} className="text-green-400 dark:text-green-300">
                    {log}
                  </div>
                ))}
              </div>
              {renewalLogs.length > 0 && !isFetchingCookies && !isRenewing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRenewalLogs([])}
                  className="mt-2 w-full text-xs"
                >
                  Effacer les logs
                </Button>
              )}
            </CardContent>
          </Card>
        )}
        
        {/* Guide de test pour Auto Fetch */}
        {fullCookies ? (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
              <div className="text-xs text-green-800 flex-1">
                <strong>✅ Cookies configurés ! Vous pouvez maintenant utiliser le renouvellement automatique</strong>
                <div className="mt-2 space-y-2">
                  <div className="bg-white p-2 rounded border border-green-200">
                    <strong className="text-green-700">🔄 Deux méthodes de renouvellement disponibles :</strong>
                    <ul className="list-disc list-inside mt-1 space-y-1 text-green-700">
                      <li><strong>"Auto Fetch 🚀"</strong> : Récupère les cookies via requête HTTP (méthode du repository Discord bot)</li>
                      <li><strong>"Force Refresh"</strong> : Utilise refresh_token_web via OAuth2 (si disponible)</li>
                    </ul>
                  </div>
                  <p className="text-green-600 font-semibold">
                    🎯 <strong>Objectif :</strong> Configurer les cookies une seule fois, puis les renouveler automatiquement avec ces boutons !
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-xs text-blue-800 flex-1">
                <strong>📝 Pour tester "Auto Fetch", vous devez d'abord configurer des cookies :</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1 text-blue-700">
                  <li>Cliquez sur le bouton <strong>"Modifier"</strong> ci-dessus</li>
                  <li>Collez vos cookies Vinted (depuis DevTools ou l'extension navigateur)</li>
                  <li>Cliquez sur <strong>"Sauvegarder"</strong></li>
                  <li>Une fois les cookies configurés, le bouton <strong>"Auto Fetch 🚀"</strong> apparaîtra</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Statut actuel */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            {getStatusIcon()}
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-medium text-sm">Token actuel</span>
                {getStatusBadge()}
              </div>
              
              {tokenStatus?.details && (
                <div className="mt-1 space-y-1">
                  <div className="text-xs text-gray-600">
                    {tokenStatus.details.message}
                  </div>
                  
                  {tokenStatus.details.userId && (
                    <div className="flex items-center space-x-1 text-xs text-gray-500">
                      <User className="h-3 w-3" />
                      <span>User ID: {tokenStatus.details.userId}</span>
                    </div>
                  )}
                  
                  {tokenStatus.details.expiresAt && (
                    <div className="flex items-center space-x-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>{formatExpiryDate(tokenStatus.details.expiresAt)}</span>
                    </div>
                  )}
                </div>
              )}
              
              {tokenStatus?.error && (
                <div className="mt-1 text-xs text-red-600">
                  {tokenStatus.error}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={checkTokenStatus}
              disabled={isLoading}
              title="Vérifier le statut du token"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            {fullCookies && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoFetchCookies}
                disabled={isFetchingCookies}
                className="bg-green-50 text-green-700 hover:bg-green-100 border-green-300"
                title="Récupérer automatiquement les cookies depuis Vinted via requête HEAD vers /how_it_works (méthode automatique - pas besoin d'action manuelle)"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isFetchingCookies ? 'animate-spin' : ''}`} />
                {isFetchingCookies ? 'Récupération...' : 'Auto Fetch 🚀'}
              </Button>
            )}
            {cookieMonitor.analysis?.refreshToken && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleForceRefresh}
                disabled={isRenewing}
                className="text-blue-600 hover:text-blue-700"
                title="Renouveler le token via refresh_token_web (OAuth2)"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isRenewing ? 'animate-spin' : ''}`} />
                Force Refresh
              </Button>
            )}
          </div>
        </div>

        {/* Formulaire de mise à jour */}
        {isEditing && (
          <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                             <div className="space-y-3">
                   <Label htmlFor="new-token">Configuration Token Vinted</Label>
                   
                   {/* Mode cookies complets uniquement */}
                   <div className="text-sm text-blue-700 font-medium">
                     🍪 Configuration par cookies complets (recommandé et fonctionnel)
                   </div>
                 </div>
                 
                 <div className="space-y-2">
                   <div className="relative">
                     <textarea
                       id="new-token"
                       value={newToken}
                       onChange={(e) => setNewToken(e.target.value)}
                       placeholder="Collez ici la chaîne complète de cookies depuis DevTools Network tab..."
                       className="min-h-[120px] w-full p-3 border rounded-md text-xs font-mono"
                       rows={5}
                     />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-7 w-7 p-0"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              </div>
              
                                                <div className="text-xs text-gray-600 space-y-2">
                     <div>
                       <strong>📋 Instructions pour récupérer vos cookies :</strong><br/>
                       1. Connectez-vous sur <strong>vinted.fr</strong> dans votre navigateur<br/>
                       2. Ouvrez DevTools (F12) → <strong>Network</strong> → Rechargez la page<br/>
                       3. Cliquez sur une requête vers <strong>vinted.fr/api/v2</strong><br/>
                       4. Dans "Request Headers", copiez toute la valeur <code className="bg-gray-200 px-1 rounded">cookie:</code><br/>
                       5. Collez ici - la validation est automatique ! 🎯
                     </div>
                     <div className="text-orange-600">
                       ⚠️ <strong>Important:</strong> Les cookies expirent - renouvelez si nécessaire !
                     </div>
                   </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={handleSaveToken}
                disabled={!newToken.trim() || isSaving}
                size="sm"
              >
                {isSaving ? (
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Save className="h-3 w-3 mr-1" />
                )}
                {isSaving ? 'Validation...' : 'Sauvegarder'}
              </Button>
              
                             {newToken.trim() && (
                 <Button
                   variant="outline"
                   onClick={copyTokenTemplate}
                   size="sm"
                 >
                   <Copy className="h-3 w-3 mr-1" />
                   Copier token
                 </Button>
               )}
               
               {token && (
                 <Button
                   variant="outline"
                   onClick={handleClearToken}
                   size="sm"
                   className="text-red-600 hover:text-red-700"
                 >
                   <Trash2 className="h-3 w-3 mr-1" />
                   Supprimer
                 </Button>
               )}
               
               <Button
                 variant="outline"
                 onClick={() => {
                   setIsEditing(false)
                   setNewToken('')
                 }}
                 size="sm"
               >
                 Annuler
               </Button>
            </div>
          </div>
        )}

        {/* Warning si token invalide */}
        {tokenStatus && !tokenStatus.isValid && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-start space-x-2">
              <XCircle className="h-4 w-4 text-red-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-red-800">Token invalide</p>
                <p className="text-red-600 mt-1">
                  Le scraping ne fonctionnera pas. Veuillez mettre à jour votre token Vinted.
                </p>
                {!isEditing && (
                  <Button
                    onClick={() => setIsEditing(true)}
                    className="mt-2"
                    size="sm"
                    variant="outline"
                  >
                    <Key className="h-3 w-3 mr-1" />
                    Mettre à jour le token
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 