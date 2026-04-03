import { env } from '../config/env';
import logger from '../utils/logger';
import type {
  MandiPrice,
  CropProduction,
  Market,
  RawMandiRecord,
  RawCropRecord,
  DataGovResponse,
} from '../types/dataGov';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.data.gov.in/resource';
const MANDI_PRICES_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';
const CROP_PRODUCTION_RESOURCE = '35be999b-68ea-4e98-8e76-8a99ec2f7b34';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// Simple TTL cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function fetchResource<T>(
  resourceId: string,
  filters: Record<string, string>,
  limit = 50
): Promise<DataGovResponse<T>> {
  const url = new URL(`${BASE_URL}/${resourceId}`);
  url.searchParams.set('api-key', env.DATA_GOV_API_KEY);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(limit));

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  logger.debug('data.gov.in API request', { resourceId, filters, limit });

  const response = await fetch(url.toString());

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown');
    logger.error('data.gov.in API error', {
      resourceId,
      status: response.status,
      body: text.slice(0, 500),
    });
    throw new Error(`data.gov.in API returned ${response.status}`);
  }

  const json = (await response.json()) as DataGovResponse<T>;

  if (json.status !== 'ok') {
    logger.warn('data.gov.in non-ok status', { status: json.status, message: json.message });
  }

  return json;
}

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------

function toMandiPrice(raw: RawMandiRecord): MandiPrice {
  return {
    state: raw.state ?? '',
    district: raw.district ?? '',
    market: raw.market ?? '',
    commodity: raw.commodity ?? '',
    variety: raw.variety ?? '',
    arrivalDate: raw.arrival_date ?? '',
    minPrice: Number(raw.min_price) || 0,
    maxPrice: Number(raw.max_price) || 0,
    modalPrice: Number(raw.modal_price) || 0,
  };
}

function toCropProduction(raw: RawCropRecord): CropProduction {
  return {
    state: raw.state_name ?? '',
    district: raw.district_name ?? '',
    crop: raw.crop ?? '',
    season: raw.season ?? '',
    area: Number(raw.area) || 0,
    production: Number(raw.production) || 0,
    yield: Number(raw.yield) || 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch current mandi/market prices for commodities.
 */
export async function getMandiPrices(
  commodity?: string,
  state?: string,
  market?: string
): Promise<MandiPrice[]> {
  const cacheKey = `mandi:${commodity ?? ''}:${state ?? ''}:${market ?? ''}`;
  const cached = getCached<MandiPrice[]>(cacheKey);
  if (cached) {
    logger.debug('Cache hit for mandi prices', { cacheKey });
    return cached;
  }

  try {
    const filters: Record<string, string> = {};
    if (commodity) filters['filters[commodity]'] = commodity;
    if (state) filters['filters[state]'] = state;
    if (market) filters['filters[market]'] = market;

    const response = await fetchResource<RawMandiRecord>(MANDI_PRICES_RESOURCE, filters);
    const prices = (response.records ?? []).map(toMandiPrice);
    setCache(cacheKey, prices);
    logger.info('Fetched mandi prices', { count: prices.length, commodity, state, market });
    return prices;
  } catch (error) {
    logger.error('Failed to fetch mandi prices', {
      error: error instanceof Error ? error.message : String(error),
      commodity,
      state,
      market,
    });
    throw error;
  }
}

/**
 * Fetch crop production statistics by state/district.
 */
export async function getCropProduction(
  state?: string,
  crop?: string,
  year?: string
): Promise<CropProduction[]> {
  const cacheKey = `crop:${state ?? ''}:${crop ?? ''}:${year ?? ''}`;
  const cached = getCached<CropProduction[]>(cacheKey);
  if (cached) {
    logger.debug('Cache hit for crop production', { cacheKey });
    return cached;
  }

  try {
    const filters: Record<string, string> = {};
    if (state) filters['filters[state_name]'] = state;
    if (crop) filters['filters[crop]'] = crop;
    if (year) filters['filters[crop_year]'] = year;

    const response = await fetchResource<RawCropRecord>(CROP_PRODUCTION_RESOURCE, filters);
    const records = (response.records ?? []).map(toCropProduction);
    setCache(cacheKey, records);
    logger.info('Fetched crop production data', { count: records.length, state, crop, year });
    return records;
  } catch (error) {
    logger.error('Failed to fetch crop production data', {
      error: error instanceof Error ? error.message : String(error),
      state,
      crop,
      year,
    });
    throw error;
  }
}

/**
 * Search for mandis/markets by name or location.
 * Reuses the mandi prices resource, filtering by market name.
 */
export async function searchMarkets(query: string): Promise<Market[]> {
  const cacheKey = `market-search:${query}`;
  const cached = getCached<Market[]>(cacheKey);
  if (cached) {
    logger.debug('Cache hit for market search', { cacheKey });
    return cached;
  }

  try {
    const filters: Record<string, string> = {
      'filters[market]': query,
    };

    const response = await fetchResource<RawMandiRecord>(MANDI_PRICES_RESOURCE, filters, 100);

    // Deduplicate markets by name+state+district
    const seen = new Set<string>();
    const markets: Market[] = [];

    for (const raw of response.records ?? []) {
      const key = `${raw.market}|${raw.state}|${raw.district}`;
      if (!seen.has(key)) {
        seen.add(key);
        markets.push({
          name: raw.market ?? '',
          state: raw.state ?? '',
          district: raw.district ?? '',
        });
      }
    }

    setCache(cacheKey, markets);
    logger.info('Market search complete', { query, count: markets.length });
    return markets;
  } catch (error) {
    logger.error('Failed to search markets', {
      error: error instanceof Error ? error.message : String(error),
      query,
    });
    throw error;
  }
}
