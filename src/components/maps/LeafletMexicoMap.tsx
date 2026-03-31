'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';

export type MexicoMapTone = 'emerald' | 'sky' | 'amber' | 'rose' | 'slate' | 'violet';

export interface MexicoMapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string | null;
  detail?: string | null;
  tone?: MexicoMapTone;
  radiusMeters?: number | null;
}

const MEXICO_CENTER: [number, number] = [23.6345, -102.5528];
const MEXICO_BOUNDS: LatLngBoundsExpression = [
  [14.3, -118.8],
  [32.9, -85.8],
];

interface MapTileProvider {
  id: string;
  url: string;
  attribution: string;
  subdomains?: string | string[];
}

const MAP_TILE_PROVIDERS: MapTileProvider[] = [
  {
    id: 'carto-light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: ['a', 'b', 'c', 'd'],
  },
  {
    id: 'esri-street',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, TomTom, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors',
  },
];

const MAP_TONE_STYLES: Record<
  MexicoMapTone,
  { stroke: string; fill: string; fillOpacity: number; circleOpacity: number }
> = {
  emerald: {
    stroke: '#0f766e',
    fill: '#2cb67d',
    fillOpacity: 0.92,
    circleOpacity: 0.16,
  },
  sky: {
    stroke: '#0369a1',
    fill: '#38bdf8',
    fillOpacity: 0.9,
    circleOpacity: 0.16,
  },
  amber: {
    stroke: '#b45309',
    fill: '#f59e0b',
    fillOpacity: 0.92,
    circleOpacity: 0.16,
  },
  rose: {
    stroke: '#be123c',
    fill: '#fb7185',
    fillOpacity: 0.92,
    circleOpacity: 0.16,
  },
  slate: {
    stroke: '#475569',
    fill: '#94a3b8',
    fillOpacity: 0.88,
    circleOpacity: 0.15,
  },
  violet: {
    stroke: '#6d28d9',
    fill: '#8f9bff',
    fillOpacity: 0.92,
    circleOpacity: 0.16,
  },
};

function FitMapToPoints({ points }: { points: MexicoMapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      map.fitBounds(MEXICO_BOUNDS, { padding: [24, 24] });
      return;
    }

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 11, { animate: false });
      return;
    }

    const bounds: LatLngBoundsExpression = points.map((item) => [item.lat, item.lng]);
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
  }, [map, points]);

  return null;
}

export function LeafletMexicoMap({
  points,
  selectedPointId,
  onSelect,
  heightClassName = 'h-[320px]',
  showCoverageCircles = false,
  showPath = false,
  minZoom = 4,
  maxZoom = 17,
}: {
  points: MexicoMapPoint[];
  selectedPointId?: string | null;
  onSelect?: (pointId: string) => void;
  heightClassName?: string;
  showCoverageCircles?: boolean;
  showPath?: boolean;
  minZoom?: number;
  maxZoom?: number;
}) {
  const [tileProviderIndex, setTileProviderIndex] = useState(0);
  const pathPoints = points
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .map((point) => [point.lat, point.lng] as [number, number]);
  const tileProvider = useMemo(
    () => MAP_TILE_PROVIDERS[Math.min(tileProviderIndex, MAP_TILE_PROVIDERS.length - 1)],
    [tileProviderIndex]
  );

  const handleTileError = useCallback(() => {
    setTileProviderIndex((currentIndex) => {
      if (currentIndex >= MAP_TILE_PROVIDERS.length - 1) {
        return currentIndex;
      }

      return currentIndex + 1;
    });
  }, []);

  return (
    <div
      className={`relative z-0 overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 ${heightClassName}`}
      data-testid="mexico-map"
    >
      <MapContainer
        center={MEXICO_CENTER}
        zoom={5}
        minZoom={minZoom}
        maxZoom={maxZoom}
        zoomControl
        scrollWheelZoom
        className="z-0 h-full w-full"
      >
        <TileLayer
          key={tileProvider.id}
          attribution={tileProvider.attribution}
          url={tileProvider.url}
          subdomains={tileProvider.subdomains}
          eventHandlers={{
            tileerror: handleTileError,
          }}
        />
        <FitMapToPoints points={points} />
        {showPath && pathPoints.length > 1 ? (
          <Polyline
            positions={pathPoints}
            pathOptions={{
              color: '#0f766e',
              weight: 4,
              opacity: 0.75,
              lineCap: 'round',
              lineJoin: 'round',
              dashArray: '10 10',
            }}
          />
        ) : null}
        {points.map((point) => {
          const tone = MAP_TONE_STYLES[point.tone ?? 'emerald'];
          const selected = point.id === selectedPointId;
          const markerRadius = selected ? 10 : 7;

          return (
            <div key={point.id}>
              {showCoverageCircles && point.radiusMeters && point.radiusMeters > 0 ? (
                <Circle
                  center={[point.lat, point.lng]}
                  radius={point.radiusMeters}
                  pathOptions={{
                    color: tone.stroke,
                    fillColor: tone.fill,
                    fillOpacity: tone.circleOpacity,
                    weight: selected ? 2 : 1,
                  }}
                  eventHandlers={
                    onSelect
                      ? {
                          click: () => onSelect(point.id),
                        }
                      : undefined
                  }
                />
              ) : null}
              <CircleMarker
                center={[point.lat, point.lng]}
                radius={markerRadius}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: tone.fill,
                  fillOpacity: tone.fillOpacity,
                  weight: selected ? 3 : 2,
                }}
                eventHandlers={
                  onSelect
                    ? {
                        click: () => onSelect(point.id),
                      }
                    : undefined
                }
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-950">{point.title}</p>
                    {point.subtitle ? (
                      <p className="text-xs text-slate-600">{point.subtitle}</p>
                    ) : null}
                    {point.detail ? <p className="text-xs text-slate-500">{point.detail}</p> : null}
                  </div>
                </Tooltip>
              </CircleMarker>
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}
