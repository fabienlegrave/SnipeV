/**
 * Health check endpoint pour les Workers Régionaux
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const region = process.env.FLY_REGION || 'unknown'
  const workerId = process.env.FLY_APP_NAME || 'unknown'
  
  return NextResponse.json({
    status: 'healthy',
    workerId,
    region,
    timestamp: new Date().toISOString(),
  })
}

