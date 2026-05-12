import { Request, Response } from 'express';
import * as weatherService from '../services/weatherService';
import logger from '../utils/logger';

/**
 * GET /api/weather/current?lat=28.6&lon=77.2
 * GET /api/weather/current?city=Delhi
 */
export async function getCurrentWeather(req: Request, res: Response): Promise<void> {
  try {
    const { lat, lon, city } = req.query;

    let weather: weatherService.CurrentWeather | null = null;

    if (city && typeof city === 'string') {
      weather = await weatherService.getWeatherByCity(city);
    } else if (lat && lon) {
      const latitude = parseFloat(lat as string);
      const longitude = parseFloat(lon as string);
      if (isNaN(latitude) || isNaN(longitude)) {
        res.status(400).json({ success: false, message: 'lat and lon must be valid numbers' });
        return;
      }
      weather = await weatherService.getCurrentWeather(latitude, longitude);
    } else {
      res.status(400).json({ success: false, message: 'Provide lat/lon or city query parameter' });
      return;
    }

    if (!weather) {
      res.status(502).json({ success: false, message: 'Weather data temporarily unavailable' });
      return;
    }

    res.json({ success: true, data: weather });
  } catch (error) {
    logger.error('getCurrentWeather controller error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, message: 'Failed to fetch weather data' });
  }
}

/**
 * GET /api/weather/forecast?lat=28.6&lon=77.2
 */
export async function getForecast(req: Request, res: Response): Promise<void> {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      res.status(400).json({ success: false, message: 'lat and lon query parameters are required' });
      return;
    }

    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lon as string);
    if (isNaN(latitude) || isNaN(longitude)) {
      res.status(400).json({ success: false, message: 'lat and lon must be valid numbers' });
      return;
    }

    const forecast = await weatherService.getForecast(latitude, longitude);

    if (!forecast) {
      res.status(502).json({ success: false, message: 'Forecast data temporarily unavailable' });
      return;
    }

    res.json({ success: true, data: forecast });
  } catch (error) {
    logger.error('getForecast controller error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, message: 'Failed to fetch forecast data' });
  }
}

/**
 * GET /api/weather/disease-risk?lat=28.6&lon=77.2
 */
export async function getDiseaseRisk(req: Request, res: Response): Promise<void> {
  try {
    const { lat, lon, city } = req.query;

    let weather: weatherService.CurrentWeather | null = null;

    if (city && typeof city === 'string') {
      weather = await weatherService.getWeatherByCity(city);
    } else if (lat && lon) {
      const latitude = parseFloat(lat as string);
      const longitude = parseFloat(lon as string);
      if (isNaN(latitude) || isNaN(longitude)) {
        res.status(400).json({ success: false, message: 'lat and lon must be valid numbers' });
        return;
      }
      weather = await weatherService.getCurrentWeather(latitude, longitude);
    } else {
      res.status(400).json({ success: false, message: 'Provide lat/lon or city query parameter' });
      return;
    }

    if (!weather) {
      res.status(502).json({ success: false, message: 'Weather data temporarily unavailable' });
      return;
    }

    const risk = weatherService.getDiseaseRiskFromWeather(weather);
    res.json({ success: true, data: { weather, risk } });
  } catch (error) {
    logger.error('getDiseaseRisk controller error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, message: 'Failed to assess disease risk' });
  }
}
