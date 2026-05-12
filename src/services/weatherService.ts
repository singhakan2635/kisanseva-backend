import { env } from '../config/env';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CurrentWeather {
  city: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  description: string;
  icon: string;
  windSpeed: number;
  pressure: number;
}

export interface ForecastItem {
  dt: number;
  temp: number;
  feelsLike: number;
  humidity: number;
  description: string;
  icon: string;
  windSpeed: number;
  pop: number; // probability of precipitation
}

export interface ForecastData {
  city: string;
  list: ForecastItem[];
}

export interface DiseaseRisk {
  risk: 'low' | 'moderate' | 'high';
  diseases: string[];
  advisory: string;
}

// ---------------------------------------------------------------------------
// In-memory cache (30 min TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 30 * 60 * 1000;

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
// Mock / fallback data (used when API key is not configured)
// ---------------------------------------------------------------------------

function getMockWeather(city: string): CurrentWeather {
  return {
    city: city || 'Delhi',
    temp: 32,
    feelsLike: 35,
    humidity: 65,
    description: 'Partly cloudy',
    icon: '02d',
    windSpeed: 3.5,
    pressure: 1012,
  };
}

function getMockForecast(city: string): ForecastData {
  const now = Math.floor(Date.now() / 1000);
  const list: ForecastItem[] = [];
  for (let i = 0; i < 40; i++) {
    list.push({
      dt: now + i * 3 * 3600,
      temp: 28 + Math.round(Math.random() * 8),
      feelsLike: 30 + Math.round(Math.random() * 8),
      humidity: 55 + Math.round(Math.random() * 30),
      description: i % 3 === 0 ? 'Light rain' : 'Partly cloudy',
      icon: i % 3 === 0 ? '10d' : '02d',
      windSpeed: 2 + Math.round(Math.random() * 5),
      pop: Math.round(Math.random() * 60) / 100,
    });
  }
  return { city: city || 'Delhi', list };
}

// ---------------------------------------------------------------------------
// OpenWeatherMap API helpers
// ---------------------------------------------------------------------------

const OWM_BASE = 'https://api.openweathermap.org/data/2.5';

function isApiKeyConfigured(): boolean {
  return env.OPENWEATHER_API_KEY.length > 0;
}

interface OWMCurrentResponse {
  name: string;
  main: { temp: number; feels_like: number; humidity: number; pressure: number };
  weather: Array<{ description: string; icon: string }>;
  wind: { speed: number };
}

interface OWMForecastResponse {
  city: { name: string };
  list: Array<{
    dt: number;
    main: { temp: number; feels_like: number; humidity: number };
    weather: Array<{ description: string; icon: string }>;
    wind: { speed: number };
    pop: number;
  }>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenWeatherMap API error ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getCurrentWeather(lat: number, lon: number): Promise<CurrentWeather | null> {
  const cacheKey = `weather_current_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = getCached<CurrentWeather>(cacheKey);
  if (cached) return cached;

  if (!isApiKeyConfigured()) {
    logger.warn('OPENWEATHER_API_KEY not configured, returning mock weather data');
    const mock = getMockWeather('');
    setCache(cacheKey, mock);
    return mock;
  }

  try {
    const url = `${OWM_BASE}/weather?lat=${lat}&lon=${lon}&appid=${env.OPENWEATHER_API_KEY}&units=metric`;
    const data = await fetchJson<OWMCurrentResponse>(url);
    const result: CurrentWeather = {
      city: data.name,
      temp: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      description: data.weather[0]?.description || 'Unknown',
      icon: data.weather[0]?.icon || '01d',
      windSpeed: data.wind.speed,
      pressure: data.main.pressure,
    };
    setCache(cacheKey, result);
    logger.info('Fetched current weather from OpenWeatherMap', { city: result.city, lat, lon });
    return result;
  } catch (error) {
    logger.error('Failed to fetch current weather', {
      error: error instanceof Error ? error.message : String(error),
      lat,
      lon,
    });
    return null;
  }
}

export async function getWeatherByCity(city: string, country = 'IN'): Promise<CurrentWeather | null> {
  const cacheKey = `weather_city_${city.toLowerCase()}_${country}`;
  const cached = getCached<CurrentWeather>(cacheKey);
  if (cached) return cached;

  if (!isApiKeyConfigured()) {
    logger.warn('OPENWEATHER_API_KEY not configured, returning mock weather data');
    const mock = getMockWeather(city);
    setCache(cacheKey, mock);
    return mock;
  }

  try {
    const url = `${OWM_BASE}/weather?q=${encodeURIComponent(city)},${country}&appid=${env.OPENWEATHER_API_KEY}&units=metric`;
    const data = await fetchJson<OWMCurrentResponse>(url);
    const result: CurrentWeather = {
      city: data.name,
      temp: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      description: data.weather[0]?.description || 'Unknown',
      icon: data.weather[0]?.icon || '01d',
      windSpeed: data.wind.speed,
      pressure: data.main.pressure,
    };
    setCache(cacheKey, result);
    logger.info('Fetched weather by city from OpenWeatherMap', { city: result.city });
    return result;
  } catch (error) {
    logger.error('Failed to fetch weather by city', {
      error: error instanceof Error ? error.message : String(error),
      city,
      country,
    });
    return null;
  }
}

export async function getForecast(lat: number, lon: number): Promise<ForecastData | null> {
  const cacheKey = `weather_forecast_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = getCached<ForecastData>(cacheKey);
  if (cached) return cached;

  if (!isApiKeyConfigured()) {
    logger.warn('OPENWEATHER_API_KEY not configured, returning mock forecast data');
    const mock = getMockForecast('');
    setCache(cacheKey, mock);
    return mock;
  }

  try {
    const url = `${OWM_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${env.OPENWEATHER_API_KEY}&units=metric`;
    const data = await fetchJson<OWMForecastResponse>(url);
    const result: ForecastData = {
      city: data.city.name,
      list: data.list.map((item) => ({
        dt: item.dt,
        temp: Math.round(item.main.temp),
        feelsLike: Math.round(item.main.feels_like),
        humidity: item.main.humidity,
        description: item.weather[0]?.description || 'Unknown',
        icon: item.weather[0]?.icon || '01d',
        windSpeed: item.wind.speed,
        pop: item.pop,
      })),
    };
    setCache(cacheKey, result);
    logger.info('Fetched forecast from OpenWeatherMap', { city: result.city, lat, lon });
    return result;
  } catch (error) {
    logger.error('Failed to fetch forecast', {
      error: error instanceof Error ? error.message : String(error),
      lat,
      lon,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Disease risk analysis based on weather conditions
// ---------------------------------------------------------------------------

export function getDiseaseRiskFromWeather(weather: CurrentWeather): DiseaseRisk {
  const { temp, humidity, description } = weather;
  const lower = description.toLowerCase();
  const isRainy = lower.includes('rain') || lower.includes('drizzle') || lower.includes('thunderstorm');

  const diseases: string[] = [];
  const advisories: string[] = [];

  // High humidity + cool temps: Late Blight, Downy Mildew
  if (humidity > 80 && temp >= 15 && temp <= 25) {
    diseases.push('Late Blight', 'Downy Mildew');
    advisories.push('High humidity with cool temperatures favors fungal diseases. Apply preventive fungicide sprays.');
  }

  // High humidity + warm temps: Bacterial diseases
  if (humidity > 80 && temp > 25 && temp <= 35) {
    diseases.push('Bacterial Leaf Blight', 'Bacterial Wilt');
    advisories.push('Warm, humid conditions favor bacterial infections. Avoid overhead irrigation and remove infected plants.');
  }

  // Hot and dry: Powdery Mildew, Spider Mites
  if (temp > 35 && humidity < 50) {
    diseases.push('Powdery Mildew', 'Spider Mites');
    advisories.push('Hot, dry weather promotes powdery mildew and spider mites. Increase watering and consider neem-based sprays.');
  }

  // Prolonged rain: Root Rot, Damping Off
  if (isRainy && humidity > 75) {
    diseases.push('Root Rot', 'Damping Off');
    advisories.push('Prolonged wet conditions increase root disease risk. Ensure proper drainage in fields.');
  }

  // Cold + wet: Frost damage
  if (temp < 10 && (humidity > 70 || isRainy)) {
    diseases.push('Frost Damage', 'Cold Injury');
    advisories.push('Low temperatures with moisture can cause frost damage. Cover sensitive crops overnight.');
  }

  // Moderate humidity range: Leaf Spot
  if (humidity > 70 && humidity <= 80 && temp >= 20 && temp <= 30) {
    diseases.push('Leaf Spot');
    advisories.push('Moderate humidity favors leaf spot diseases. Monitor crops closely.');
  }

  // Determine overall risk level
  let risk: 'low' | 'moderate' | 'high' = 'low';
  if (diseases.length >= 3) {
    risk = 'high';
  } else if (diseases.length >= 1) {
    risk = 'moderate';
  }

  const advisory = advisories.length > 0
    ? advisories.join(' ')
    : 'Weather conditions are favorable for crops. Continue regular monitoring.';

  return { risk, diseases, advisory };
}
