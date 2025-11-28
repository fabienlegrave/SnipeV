import { describe, it, expect, beforeEach } from 'vitest'
import { SearchCache } from './searchCache'

describe('SearchCache', () => {
  let cache: SearchCache

  beforeEach(() => {
    cache = new SearchCache({
      ttlMinutes: 1,
      maxEntries: 10
    })
  })

  it('should store and retrieve cached results', async () => {
    const query = 'test query'
    const filters = { priceTo: 50 }
    const result = { items: [{ id: 1, title: 'Test Item' }], totalPages: 1 }

    await cache.set(query, filters, result)
    const cached = await cache.get(query, filters)

    expect(cached).toBeDefined()
    expect(cached?.items).toHaveLength(1)
    expect(cached?.items[0].id).toBe(1)
  })

  it('should return null for non-existent cache', async () => {
    const cached = await cache.get('nonexistent', {})
    expect(cached).toBeNull()
  })

  it('should respect TTL expiration', async () => {
    cache = new SearchCache({ ttlMinutes: 0.001, maxEntries: 10 })

    await cache.set('test', {}, { items: [], totalPages: 1 })

    await new Promise(resolve => setTimeout(resolve, 100))

    const cached = await cache.get('test', {})
    expect(cached).toBeNull()
  })

  it('should invalidate cache entries', async () => {
    await cache.set('test', {}, { items: [], totalPages: 1 })
    await cache.invalidate('test')

    const cached = await cache.get('test', {})
    expect(cached).toBeNull()
  })

  it('should generate consistent hashes for same inputs', async () => {
    const query1 = 'zelda'
    const filters1 = { priceTo: 30, priceFrom: 10 }

    await cache.set(query1, filters1, { items: [{ id: 1 }], totalPages: 1 })

    const cached = await cache.get(query1, { priceFrom: 10, priceTo: 30 })
    expect(cached).toBeDefined()
  })

  it('should track cache statistics', async () => {
    await cache.set('test1', {}, { items: [], totalPages: 1 })
    await cache.get('test1', {})
    await cache.get('nonexistent', {})

    const stats = await cache.getStats()

    expect(stats.hits).toBeGreaterThan(0)
    expect(stats.misses).toBeGreaterThan(0)
    expect(stats.totalEntries).toBe(1)
  })
})
