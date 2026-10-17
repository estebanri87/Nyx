import { useState, useEffect, useMemo, useRef } from 'react';
import { getForecast } from '../services';

const WEATHER_FEATURE_FORECAST_DAILY = 1;
const WEATHER_FEATURE_FORECAST_HOURLY = 2;

/**
 * Hook to map multiple weather entities to forecast data
 * Returns [forecastsById, setForecastsById]
 */
export default function useWeatherForecast(conn, cardSettings, entities, entitiesLoaded) {
  const [forecastsById, setForecastsById] = useState({});
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;

  // Derive a stable list of weather entity IDs used across cards
  const weatherIds = useMemo(() => {
    const ids = Object.keys(cardSettings)
      .map((section) => {
        const settings = cardSettings[section];
        if (section.includes('::weather_temp_')) return settings.weatherId;
        if (settings.type === 'weather') return settings.weatherId;
        return null;
      })
      .filter(Boolean);
    return Array.from(new Set(ids));
  }, [cardSettings]);

  useEffect(() => {
    if (!conn) return undefined;
    if (weatherIds.length === 0) {
      setForecastsById({});
      return undefined;
    }

    let cancelled = false;

    const fetchForecasts = async () => {
      const newForecasts = {};

      await Promise.all(
        weatherIds.map(async (entityId) => {
          if (cancelled) return;
          const supportedFeatures = Number(
            entitiesRef.current?.[entityId]?.attributes?.supported_features || 0
          );
          const supportsHourly = (supportedFeatures & WEATHER_FEATURE_FORECAST_HOURLY) !== 0;
          const supportsDaily = (supportedFeatures & WEATHER_FEATURE_FORECAST_DAILY) !== 0;
          // Entities that advertise neither flag (e.g. a KNX weather entity built
          // from bus sensors) reject weather.get_forecasts outright, logging a
          // server-side error on every call. Skip them instead of asking.
          if (!supportsHourly && !supportsDaily) return;
          try {
            let data = supportsHourly ? await getForecast(conn, { entityId, type: 'hourly' }) : null;
            if ((!data || data.length === 0) && supportsDaily) {
              data = await getForecast(conn, { entityId, type: 'daily' });
            }
            if (!cancelled && data && data.length > 0) {
              newForecasts[entityId] = data;
            }
          } catch (_err) {
            // Silent failure
          }
        })
      );

      if (cancelled) return;
      setForecastsById((prev) => {
        // Drop stale entries for weather cards that were removed
        const next = weatherIds.reduce((acc, id) => {
          if (prev[id]) acc[id] = prev[id];
          return acc;
        }, {});
        if (Object.keys(newForecasts).length) {
          return { ...next, ...newForecasts };
        }
        return next;
      });
    };

    fetchForecasts();
    const interval = setInterval(fetchForecasts, 30 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // entitiesLoaded (not entities) is the dependency: it flips once when the
    // initial state snapshot arrives, so supported_features is known before
    // the first fetch without re-running this effect on every state update.
  }, [conn, weatherIds, entitiesLoaded]);

  return [forecastsById, setForecastsById];
}
