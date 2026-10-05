'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { divIcon, type LatLngBoundsExpression } from 'leaflet';
import { getMapPointsSignature, getSafeSubdomains, sanitizeMapPoints } from './mapSanitization';

export type MexicoMapTone = 'emerald' | 'sky' | 'amber' | 'rose' | 'slate' | 'violet';

export interface MexicoMapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string | null;
  detail?: string | null;
  tone?: MexicoMapTone;
  customColor?: string;
  radiusMeters?: number | null;
  inRoute?: boolean;
  isInactive?: boolean;
  iconType?: 'dot' | 'house';
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
    id: 'esri-canvas',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    subdomains: 'abc',
  },
  {
    id: 'osm-standard',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
  },
  {
    id: 'esri-street',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, TomTom, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors',
    subdomains: 'abc',
  },
];

const MAP_TONE_STYLES: Record<
  MexicoMapTone,
  { stroke: string; fill: string; fillOpacity: number; circleOpacity: number }
> = {
  emerald: {
    stroke: '#064e3b',
    fill: '#059669',
    fillOpacity: 1,
    circleOpacity: 0.2,
  },
  sky: {
    stroke: '#075985',
    fill: '#0284c7',
    fillOpacity: 1,
    circleOpacity: 0.2,
  },
  amber: {
    stroke: '#9a3412',
    fill: '#f97316',
    fillOpacity: 1,
    circleOpacity: 0.2,
  },
  rose: {
    stroke: '#9f1239',
    fill: '#e11d48',
    fillOpacity: 1,
    circleOpacity: 0.2,
  },
  slate: {
    stroke: '#334155',
    fill: '#64748b',
    fillOpacity: 1,
    circleOpacity: 0.2,
  },
  violet: {
    stroke: '#5b21b6',
    fill: '#7c3aed',
    fillOpacity: 1,
    circleOpacity: 0.2,
  },
};

function FitMapToPoints({ points }: { points: MexicoMapPoint[] }) {
  const map = useMap();
  const lastSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    const signature = getMapPointsSignature(points);
    // Si el conjunto geográfico de puntos no ha cambiado (mismos IDs y coordenadas),
    // preservamos el zoom y paneo del usuario para no alejar la cámara al seleccionar tiendas.
    if (lastSignatureRef.current === signature) {
      return;
    }
    lastSignatureRef.current = signature;

    const fit = () => {
      map.invalidateSize({ animate: false });

      if (points.length === 0) {
        map.fitBounds(MEXICO_BOUNDS, { padding: [24, 24] });
        return;
      }

      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 12, { animate: false });
        return;
      }

      const bounds: LatLngBoundsExpression = points.map((item) => [item.lat, item.lng]);
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
    };

    const frameId = window.requestAnimationFrame(fit);
    return () => window.cancelAnimationFrame(frameId);
  }, [map, points]);

  return null;
}

function SyncMapSize() {
  const map = useMap();

  useEffect(() => {
    const syncSize = () => {
      map.invalidateSize({ animate: false });
    };

    syncSize();

    const container = map.getContainer();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            syncSize();
          });

    observer?.observe(container);
    window.addEventListener('resize', syncSize);

    return () => {
      window.removeEventListener('resize', syncSize);
      observer?.disconnect();
    };
  }, [map]);

  return null;
}

function MapBackgroundEvents({ onDeselect }: { onDeselect?: () => void }) {
  useMapEvents({
    click: () => {
      onDeselect?.();
    },
  });
  return null;
}

function createHouseIcon(color: string, selected: boolean) {
  const size = selected ? 38 : 32;
  const anchor = size / 2;
  return divIcon({
    className: 'custom-leaflet-house-pin',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background-color: ${color};
        border: 2.5px solid #ffffff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 10px rgba(0,0,0,0.35)${selected ? ', 0 0 0 4px ' + color + '55' : ''};
        cursor: pointer;
        user-select: none;
      ">
        <span style="font-size: ${selected ? '19px' : '16px'}; line-height: 1;">🏠</span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
  });
}

export function LeafletMexicoMap({
  points,
  selectedPointId,
  selectedPointIds,
  onSelect,
  onDeselect,
  heightClassName = 'h-[320px]',
  showCoverageCircles = false,
  showPath = false,
  minZoom = 4,
  maxZoom = 17,
}: {
  points: MexicoMapPoint[];
  selectedPointId?: string | null;
  selectedPointIds?: string[];
  onSelect?: (pointId: string) => void;
  onDeselect?: () => void;
  heightClassName?: string;
  showCoverageCircles?: boolean;
  showPath?: boolean;
  minZoom?: number;
  maxZoom?: number;
}) {
  const safePoints = useMemo(() => sanitizeMapPoints(points), [points]);
  const [isMonochrome, setIsMonochrome] = useState(true);
  const [tileProviderIndex, setTileProviderIndex] = useState(0);
  const routePoints = safePoints.some((p) => p.inRoute === true)
    ? safePoints.filter((p) => p.inRoute === true)
    : safePoints;
  const pathPoints = routePoints
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
      className={`relative z-0 overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 ${heightClassName} ${
        isMonochrome ? 'leaflet-monochrome-canvas' : ''
      }`}
      data-testid="mexico-map"
    >
      <style>{`
        .leaflet-monochrome-canvas .leaflet-tile-pane {
          filter: grayscale(100%) brightness(102%) contrast(88%);
        }
      `}</style>

      {/* Control flotante táctil para alternar fondo neutro o calles */}
      <div className="absolute right-3 top-3 z-1000 flex items-center gap-1 rounded-2xl border border-slate-200/90 bg-white/95 p-1 shadow-md backdrop-blur-xs">
        <button
          type="button"
          onClick={() => {
            setIsMonochrome(true);
            setTileProviderIndex(0);
          }}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold transition ${
            isMonochrome
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Fondo monocromático limpio para máximo contraste"
        >
          <span>🎨</span>
          <span>Fondo Neutro</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setIsMonochrome(false);
            setTileProviderIndex(1);
          }}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold transition ${
            !isMonochrome
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Fondo estándar con calles de colores"
        >
          <span>🗺️</span>
          <span>Calles</span>
        </button>
      </div>

      <MapContainer
        center={MEXICO_CENTER}
        zoom={5}
        minZoom={minZoom}
        maxZoom={maxZoom}
        zoomControl
        scrollWheelZoom
        className="z-0 h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          key={tileProvider.id}
          attribution={tileProvider.attribution}
          url={tileProvider.url}
          subdomains={getSafeSubdomains(tileProvider.subdomains)}
          eventHandlers={{
            tileerror: handleTileError,
          }}
        />
        <SyncMapSize />
        <MapBackgroundEvents onDeselect={onDeselect} />
        <FitMapToPoints points={safePoints} />
        {showPath && pathPoints.length > 1 ? (
          <>
            {/* Halo blanco inferior para máximo contraste contra el fondo del mapa */}
            <Polyline
              positions={pathPoints}
              pathOptions={{
                color: '#ffffff',
                weight: 8,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            {/* Trazo punteado principal superior con alto contraste */}
            <Polyline
              positions={pathPoints}
              pathOptions={{
                color: '#0284c7',
                weight: 4,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
                dashArray: '8 8',
              }}
            />
          </>
        ) : null}
        {safePoints.map((point) => {
          const tone = MAP_TONE_STYLES[point.tone ?? 'emerald'];
          const markerColor = point.customColor ?? tone.fill;
          const isMultiSelected = Boolean(selectedPointIds && selectedPointIds.includes(point.id));
          const selected = point.id === selectedPointId || isMultiSelected;
          const isInRoute = point.inRoute === true;
          const isInactive = point.isInactive === true;
          const markerRadius = isMultiSelected ? 13 : selected ? 12 : isInRoute ? 9 : 7;
          const isHouse = point.iconType === 'house';

          if (isHouse) {
            return (
              <Marker
                key={point.id}
                position={[point.lat, point.lng]}
                icon={createHouseIcon(markerColor, selected)}
                zIndexOffset={selected ? 2500 : 1200}
                eventHandlers={
                  onSelect || onDeselect
                    ? {
                        click: (e) => {
                          e.originalEvent?.stopPropagation();
                          if (selected) {
                            onDeselect?.();
                          } else {
                            onSelect?.(point.id);
                          }
                        },
                      }
                    : undefined
                }
              >
                <Tooltip direction="top" offset={[0, -18]} opacity={1}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">🏠</span>
                      <p className="text-sm font-semibold text-slate-950">{point.title}</p>
                    </div>
                    {point.subtitle ? (
                      <p className="text-xs text-slate-600">{point.subtitle}</p>
                    ) : null}
                    {point.detail ? (
                      <p className="text-xs font-medium text-slate-700">{point.detail}</p>
                    ) : null}
                  </div>
                </Tooltip>
              </Marker>
            );
          }

          return (
            <Fragment key={point.id}>
              {showCoverageCircles && point.radiusMeters && point.radiusMeters > 0 ? (
                <Circle
                  center={[point.lat, point.lng]}
                  radius={point.radiusMeters}
                  pathOptions={{
                    color: markerColor,
                    fillColor: markerColor,
                    fillOpacity: tone.circleOpacity,
                    weight: selected ? 2 : 1,
                  }}
                  eventHandlers={
                    onSelect || onDeselect
                      ? {
                          click: (e) => {
                            e.originalEvent?.stopPropagation();
                            if (selected) {
                              onDeselect?.();
                            } else {
                              onSelect?.(point.id);
                            }
                          },
                        }
                      : undefined
                  }
                />
              ) : null}
              <CircleMarker
                center={[point.lat, point.lng]}
                radius={markerRadius}
                pathOptions={{
                  color: isMultiSelected ? '#38bdf8' : selected ? '#0284c7' : isInactive ? '#d97706' : '#ffffff',
                  fillColor: markerColor,
                  fillOpacity: isInactive ? 0.75 : 1,
                  weight: isMultiSelected ? 5 : selected ? 4 : isInactive ? 3 : 2.5,
                  dashArray: isInactive ? '4 4' : undefined,
                }}
                eventHandlers={
                  onSelect || onDeselect
                    ? {
                        click: (e) => {
                          e.originalEvent?.stopPropagation();
                          if (selected) {
                            onDeselect?.();
                          } else {
                            onSelect?.(point.id);
                          }
                        },
                      }
                    : undefined
                }
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-slate-950">{point.title}</p>
                      {isInactive && (
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                          ⚠️ Inactivo
                        </span>
                      )}
                    </div>
                    {point.subtitle ? (
                      <p className="text-xs text-slate-600">{point.subtitle}</p>
                    ) : null}
                    {point.detail ? <p className="text-xs text-slate-500">{point.detail}</p> : null}
                  </div>
                </Tooltip>
              </CircleMarker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
