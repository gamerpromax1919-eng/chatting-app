/// <reference types="google.maps" />
import { useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  Circle,
  ColorScheme,
  InfoWindow,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Check,
  Compass,
  Copy,
  Crosshair,
  Flame,
  Footprints,
  Car,
  LocateFixed,
  MapPin,
  MessageCircle,
  Navigation,
  Radio,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  FocusedMapTarget,
  LocationStory,
  LocationZone,
  PresenceUser,
  ZoneId,
} from '../types/drift.ts';
import {
  calculateDistanceKm,
  formatCoordPair,
  formatDistanceLabel,
  formatRemainingTime,
} from '../utils/ephemeral.ts';
import { PersonaGlyph } from './PersonaGlyph.tsx';

interface RadarViewProps {
  mapsApiKey: string;
  mapsKeyLoaded: boolean;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  zones: readonly LocationZone[];
  selectedZoneId: ZoneId;
  stories: readonly LocationStory[];
  peers: readonly PresenceUser[];
  currentUid: string;
  friendUids: Set<string>;
  pendingFriendUids: Set<string>;
  usingLiveGps: boolean;
  gpsLoading: boolean;
  gpsError: string | null;
  focusedTarget: FocusedMapTarget | null;
  now: number;
  onSelectZone: (zoneId: ZoneId) => void;
  onOpenStory: (story: LocationStory) => void;
  onToggleLiveGps: () => void;
  onQuickAddFriend: (peer: PresenceUser) => void;
  onOpenDirectChatByUid: (uid: string) => void;
  onClearFocusedTarget: () => void;
}

type DirectoryFilter = 'all' | 'friends' | 'live' | 'stories';
type TravelModeChoice = 'WALKING' | 'DRIVING';

type SelectedPin =
  | { kind: 'self' }
  | { kind: 'peer'; peer: PresenceUser }
  | { kind: 'story'; story: LocationStory }
  | { kind: 'zone'; zone: LocationZone }
  | { kind: 'pin'; target: FocusedMapTarget };

interface RouteSummary {
  distanceText: string;
  durationText: string;
  label: string;
}

const DEMO_MAP_ID = 'DEMO_MAP_ID';
const ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

function formatDurationMs(durationValue: unknown): string {
  if (typeof durationValue !== 'number' || !Number.isFinite(durationValue)) {
    return 'Nearby';
  }
  const mins = Math.max(1, Math.round(durationValue / 60000));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

function formatMeters(metersValue: unknown): string {
  if (typeof metersValue !== 'number' || !Number.isFinite(metersValue)) {
    return '';
  }
  if (metersValue < 1000) return `${Math.round(metersValue)} m`;
  return `${(metersValue / 1000).toFixed(1)} km`;
}

function MapCameraController({
  panTarget,
}: {
  panTarget: { lat: number; lng: number; zoom?: number; seq: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !panTarget) return;
    map.panTo({ lat: panTarget.lat, lng: panTarget.lng });
    if (typeof panTarget.zoom === 'number') {
      const currentZoom = map.getZoom() ?? 13;
      if (currentZoom < panTarget.zoom) {
        map.setZoom(panTarget.zoom);
      }
    }
  }, [map, panTarget]);

  return null;
}

function RouteLayer({
  origin,
  destination,
  travelMode,
  onRouteSummary,
  onRouteError,
}: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number; label: string } | null;
  travelMode: TravelModeChoice;
  onRouteSummary: (summary: RouteSummary | null) => void;
  onRouteError: (msg: string | null) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');

  useEffect(() => {
    if (!map || !routesLib || !destination) {
      onRouteSummary(null);
      onRouteError(null);
      return;
    }

    let cancelled = false;
    let activePolylines: google.maps.Polyline[] = [];

    const runRoute = async () => {
      try {
        onRouteError(null);
        const modeEnum =
          travelMode === 'DRIVING'
            ? google.maps.TravelMode.DRIVING
            : google.maps.TravelMode.WALKING;

        // Static Route.computeRoutes per Maps JS Routes API
        const response = await routesLib.Route.computeRoutes({
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          travelMode: modeEnum,
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
        });

        if (cancelled) return;

        const primaryRoute = response.routes?.[0];
        if (!primaryRoute) {
          onRouteSummary(null);
          onRouteError('No direct route returned for these coordinates.');
          return;
        }

        const polylines = primaryRoute.createPolylines();
        polylines.forEach((line) => {
          line.setOptions({
            strokeColor: '#2dd4bf',
            strokeOpacity: 0.92,
            strokeWeight: 5,
          });
          line.setMap(map);
        });
        activePolylines = polylines;

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport, 48);
        }

        onRouteSummary({
          distanceText: formatMeters(primaryRoute.distanceMeters),
          durationText: formatDurationMs(primaryRoute.durationMillis),
          label: destination.label,
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err ?? '');
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('QUOTA') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onRouteSummary(null);
        onRouteError('Unable to draw live directions right now.');
      }
    };

    void runRoute();

    return () => {
      cancelled = true;
      activePolylines.forEach((line) => line.setMap(null));
      activePolylines = [];
    };
  }, [
    map,
    routesLib,
    origin.lat,
    origin.lng,
    destination?.lat,
    destination?.lng,
    destination?.label,
    travelMode,
    onRouteSummary,
    onRouteError,
  ]);

  return null;
}

function MapsStatusBanner({ children }: { children: React.ReactNode }) {
  const status = useApiLoadingStatus();

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="h-[460px] sm:h-[540px] w-full rounded-xl border border-amber-400/30 bg-[#071522]/90 flex flex-col items-center justify-center p-6 text-center space-y-2.5">
        <Compass className="w-8 h-8 text-amber-300" aria-hidden="true" />
        <h3 className="font-display text-base font-bold text-[#ECF7FA]">
          Google Maps temporarily unavailable
        </h3>
        <p className="text-xs text-[#9CC0CE] max-w-md leading-relaxed">
          Check your Google Maps API key or quota status. You can still share live GPS coordinates
          and view everyone&apos;s exact coordinates in the directory on the right.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export function RadarView({
  mapsApiKey,
  mapsKeyLoaded,
  centerLat,
  centerLng,
  radiusKm,
  zones,
  selectedZoneId,
  stories,
  peers,
  currentUid,
  friendUids,
  pendingFriendUids,
  usingLiveGps,
  gpsLoading,
  gpsError,
  focusedTarget,
  now,
  onSelectZone,
  onOpenStory,
  onToggleLiveGps,
  onQuickAddFriend,
  onOpenDirectChatByUid,
  onClearFocusedTarget,
}: RadarViewProps) {
  const [filter, setFilter] = useState<DirectoryFilter>('all');
  const [selectedPin, setSelectedPin] = useState<SelectedPin | null>(null);
  const [routeDestination, setRouteDestination] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  const [travelMode, setTravelMode] = useState<TravelModeChoice>('WALKING');
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [coordsCopied, setCoordsCopied] = useState(false);
  const [panTarget, setPanTarget] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    seq: number;
  } | null>(null);

  // Sync external "View on Radar" focus target
  useEffect(() => {
    if (!focusedTarget) return;
    setPanTarget({
      lat: focusedTarget.lat,
      lng: focusedTarget.lng,
      zoom: 16,
      seq: Date.now(),
    });
    if (focusedTarget.uid) {
      const peer = peers.find((p) => p.uid === focusedTarget.uid);
      if (peer) {
        setSelectedPin({ kind: 'peer', peer });
        return;
      }
    }
    if (focusedTarget.storyId) {
      const story = stories.find((s) => s.id === focusedTarget.storyId);
      if (story) {
        setSelectedPin({ kind: 'story', story });
        return;
      }
    }
    setSelectedPin({ kind: 'pin', target: focusedTarget });
  }, [focusedTarget, peers, stories]);

  const sortedPeers = useMemo(() => {
    return peers
      .filter((p) => p.uid !== currentUid)
      .map((p) => ({
        ...p,
        distanceKm: calculateDistanceKm(centerLat, centerLng, p.lat, p.lng),
        isFriend: friendUids.has(p.uid),
      }))
      .filter((p) => p.isFriend || p.distanceKm <= radiusKm)
      .sort((a, b) => {
        if (a.isFriend !== b.isFriend) return a.isFriend ? -1 : 1;
        if (Boolean(a.isLiveLocation) !== Boolean(b.isLiveLocation)) {
          return a.isLiveLocation ? -1 : 1;
        }
        return a.distanceKm - b.distanceKm;
      });
  }, [peers, currentUid, centerLat, centerLng, radiusKm, friendUids]);

  const filteredPeers = useMemo(() => {
    if (filter === 'stories') return [];
    if (filter === 'friends') return sortedPeers.filter((p) => p.isFriend);
    if (filter === 'live') return sortedPeers.filter((p) => p.isLiveLocation);
    return sortedPeers;
  }, [sortedPeers, filter]);

  const filteredStories = useMemo(() => {
    if (filter === 'friends' || filter === 'live') return [];
    return stories;
  }, [stories, filter]);

  const handleCopyMyCoords = async () => {
    const coordStr = formatCoordPair(centerLat, centerLng);
    try {
      await navigator.clipboard.writeText(coordStr);
    } catch {
      // Ignore clipboard failures in restricted contexts
    }
    setCoordsCopied(true);
    window.setTimeout(() => setCoordsCopied(false), 1800);
  };

  const handleFocusCoords = (
    lat: number,
    lng: number,
    pin: SelectedPin,
    zoom = 15
  ) => {
    setSelectedPin(pin);
    setPanTarget({ lat, lng, zoom, seq: Date.now() });
  };

  const handleRouteTo = (lat: number, lng: number, label: string) => {
    setRouteDestination({ lat, lng, label });
    setPanTarget({ lat, lng, zoom: 15, seq: Date.now() });
  };

  const infoWindowPos = useMemo(() => {
    if (!selectedPin) return null;
    if (selectedPin.kind === 'self') return { lat: centerLat, lng: centerLng };
    if (selectedPin.kind === 'peer') return { lat: selectedPin.peer.lat, lng: selectedPin.peer.lng };
    if (selectedPin.kind === 'story') return { lat: selectedPin.story.lat, lng: selectedPin.story.lng };
    if (selectedPin.kind === 'zone') return { lat: selectedPin.zone.lat, lng: selectedPin.zone.lng };
    return { lat: selectedPin.target.lat, lng: selectedPin.target.lng };
  }, [selectedPin, centerLat, centerLng]);

  const mySelfPeer = useMemo(
    () => peers.find((p) => p.uid === currentUid),
    [peers, currentUid]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
      {/* Left: Google Maps Interactive Radar */}
      <section
        aria-label="Live Google Maps Radar"
        className="lg:col-span-7 shader-panel rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3.5"
      >
        {/* Radar Header + Quick Live GPS Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#ECF7FA] flex items-center gap-2">
              <Compass className="w-5 h-5 text-teal-300" aria-hidden="true" />
              <span>Live People &amp; Story Radar</span>
            </h2>
            <p className="text-xs text-[#8EB3C2] mt-0.5 tabular-nums">
              {formatCoordPair(centerLat, centerLng)}
              {usingLiveGps && mySelfPeer?.accuracyMeters
                ? ` · Live GPS (±${mySelfPeer.accuracyMeters} m)`
                : usingLiveGps
                  ? ' · Live GPS Active'
                  : ' · Zone Hub Center'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleLiveGps}
              disabled={gpsLoading}
              data-testid="radar-live-gps-btn"
              className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                usingLiveGps
                  ? 'border-emerald-400/45 bg-emerald-500/20 text-emerald-200'
                  : 'border-teal-400/35 bg-teal-500/15 text-teal-200 hover:bg-teal-500/25'
              }`}
            >
              <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {gpsLoading
                  ? 'Locking GPS...'
                  : usingLiveGps
                    ? 'Live GPS On'
                    : 'Share Live GPS'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleCopyMyCoords()}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded-xl border border-sky-400/20 bg-[#081523]/85 hover:bg-sky-400/10 text-xs font-medium text-[#CBE4EE] cursor-pointer"
              title="Copy your current coordinates"
            >
              {coordsCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
                  <span className="text-emerald-300">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
                  <span className="hidden sm:inline">Copy Coords</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                setPanTarget({
                  lat: centerLat,
                  lng: centerLng,
                  zoom: 15,
                  seq: Date.now(),
                })
              }
              aria-label="Center map on my location"
              title="Center on me"
              className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] rounded-xl border border-sky-400/20 bg-[#081523]/85 hover:bg-sky-400/10 text-sky-300 cursor-pointer"
            >
              <Crosshair className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {gpsError && (
          <div className="px-3 py-2 rounded-xl border border-amber-400/30 bg-amber-500/10 text-xs text-amber-200">
            {gpsError}
          </div>
        )}

        {/* Active Route Bar */}
        {routeDestination && (
          <div className="px-3.5 py-2.5 rounded-xl border border-teal-400/35 bg-[#081C2C]/90 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Navigation className="w-4 h-4 text-teal-300 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#ECF7FA] truncate">
                  Route to {routeDestination.label}
                </div>
                <div className="text-[11px] font-mono text-teal-300 tabular-nums">
                  {routeSummary
                    ? `${routeSummary.durationText} · ${routeSummary.distanceText}`
                    : routeError ?? 'Calculating route...'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTravelMode('WALKING')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                  travelMode === 'WALKING'
                    ? 'bg-teal-400/25 text-teal-200 border border-teal-400/40'
                    : 'bg-[#050C14]/75 text-[#8EB3C2] border border-sky-400/15'
                }`}
              >
                <Footprints className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Walk</span>
              </button>
              <button
                type="button"
                onClick={() => setTravelMode('DRIVING')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                  travelMode === 'DRIVING'
                    ? 'bg-teal-400/25 text-teal-200 border border-teal-400/40'
                    : 'bg-[#050C14]/75 text-[#8EB3C2] border border-sky-400/15'
                }`}
              >
                <Car className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Drive</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRouteDestination(null);
                  setRouteSummary(null);
                  setRouteError(null);
                }}
                aria-label="Clear route"
                className="p-1.5 rounded-lg text-[#8EB3C2] hover:text-[#ECF7FA] hover:bg-sky-400/10 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Map Container (Explicit non-zero height required) */}
        {!mapsKeyLoaded ? (
          <div className="h-[460px] sm:h-[540px] w-full rounded-xl border border-sky-400/20 bg-[#071522]/85 animate-pulse flex items-center justify-center text-xs text-[#8EB3C2]">
            Loading Google Maps configuration...
          </div>
        ) : !mapsApiKey ? (
          <div className="h-[460px] sm:h-[540px] w-full rounded-xl border border-sky-400/20 bg-[#071522]/85 flex flex-col items-center justify-center p-6 text-center space-y-2">
            <Compass className="w-8 h-8 text-sky-300" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-[#ECF7FA]">
              Google Maps key not detected
            </h3>
            <p className="text-xs text-[#8EB3C2] max-w-md">
              Restart the preview server or configure a Google Maps API key to render live map
              tiles. Exact coordinates and friends remain available in the directory.
            </p>
          </div>
        ) : (
          <div
            data-testid="google-radar-map-container"
            className="h-[460px] sm:h-[540px] w-full rounded-xl overflow-hidden border border-sky-400/25 bg-[#050C14] relative"
          >
            <APIProvider
              apiKey={mapsApiKey}
              libraries={['marker', 'routes']}
              language="en"
              region="US"
            >
              <MapsStatusBanner>
                <GoogleMap
                  mapId={DEMO_MAP_ID}
                  colorScheme={ColorScheme.DARK}
                  defaultCenter={{ lat: centerLat, lng: centerLng }}
                  defaultZoom={14}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  mapTypeControl={false}
                  streetViewControl={false}
                  fullscreenControl={true}
                  internalUsageAttributionIds={ATTRIBUTION_IDS}
                  style={{ width: '100%', height: '100%' }}
                  onClick={() => {
                    setSelectedPin(null);
                    if (focusedTarget) onClearFocusedTarget();
                  }}
                >
                  <MapCameraController panTarget={panTarget} />

                  <RouteLayer
                    origin={{ lat: centerLat, lng: centerLng }}
                    destination={routeDestination}
                    travelMode={travelMode}
                    onRouteSummary={setRouteSummary}
                    onRouteError={setRouteError}
                  />

                  {/* Discovery Radius Ring */}
                  <Circle
                    center={{ lat: centerLat, lng: centerLng }}
                    radius={radiusKm * 1000}
                    strokeColor="#2dd4bf"
                    strokeOpacity={0.5}
                    strokeWeight={1.5}
                    fillColor="#0ea5e9"
                    fillOpacity={0.06}
                    clickable={false}
                  />

                  {/* Neighborhood Hub Markers */}
                  {zones.map((z) => {
                    const isSelected = z.id === selectedZoneId;
                    return (
                      <AdvancedMarker
                        key={`zone-${z.id}`}
                        position={{ lat: z.lat, lng: z.lng }}
                        title={`${z.name} (${z.neighborhood})`}
                        zIndex={isSelected ? 20 : 10}
                        onClick={() =>
                          handleFocusCoords(z.lat, z.lng, { kind: 'zone', zone: z }, 14)
                        }
                      >
                        <div
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border shadow-md flex items-center gap-1 transition-transform hover:scale-105 ${
                            isSelected
                              ? 'bg-teal-400 text-[#041820] border-white/80'
                              : 'bg-[#091826]/95 text-[#CBE4EE] border-sky-400/40'
                          }`}
                        >
                          <span>#{z.name.split(' ')[0]}</span>
                          <span className="font-mono text-[10px] opacity-80">
                            {z.activeCount}
                          </span>
                        </div>
                      </AdvancedMarker>
                    );
                  })}

                  {/* Active Stories Markers */}
                  {stories.map((story) => (
                    <AdvancedMarker
                      key={`story-${story.id}`}
                      position={{ lat: story.lat, lng: story.lng }}
                      title={story.headline}
                      zIndex={30}
                      onClick={() =>
                        handleFocusCoords(
                          story.lat,
                          story.lng,
                          { kind: 'story', story },
                          15
                        )
                      }
                    >
                      <div className="px-2 py-1 rounded-full bg-emerald-500 text-[#031B16] border-2 border-[#050C14] shadow-lg flex items-center gap-1 text-[11px] font-bold hover:scale-110 transition-transform">
                        <Flame className="w-3 h-3" aria-hidden="true" />
                        <span className="max-w-[90px] truncate">{story.vibe.split(' ')[0]}</span>
                      </div>
                    </AdvancedMarker>
                  ))}

                  {/* Nearby People & Friends Markers */}
                  {sortedPeers.map((peer) => (
                    <AdvancedMarker
                      key={`peer-${peer.uid}`}
                      position={{ lat: peer.lat, lng: peer.lng }}
                      title={`${peer.handle}${peer.isLiveLocation ? ' (Live GPS)' : ''}`}
                      zIndex={peer.isFriend ? 45 : 35}
                      onClick={() =>
                        handleFocusCoords(
                          peer.lat,
                          peer.lng,
                          { kind: 'peer', peer },
                          16
                        )
                      }
                    >
                      <div
                        className={`relative px-2 py-1 rounded-full border-2 shadow-lg flex items-center gap-1.5 text-[11px] font-semibold transition-transform hover:scale-110 ${
                          peer.isFriend
                            ? 'bg-[#082B26] text-emerald-200 border-emerald-400'
                            : 'bg-[#081F31] text-sky-100 border-sky-400'
                        }`}
                      >
                        {peer.isLiveLocation && (
                          <span
                            className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span className="max-w-[95px] truncate">{peer.handle}</span>
                      </div>
                    </AdvancedMarker>
                  ))}

                  {/* Focused Custom Pin (e.g. from Chat "Open on Radar") */}
                  {focusedTarget &&
                    focusedTarget.kind === 'pin' && (
                      <AdvancedMarker
                        position={{ lat: focusedTarget.lat, lng: focusedTarget.lng }}
                        title={focusedTarget.label}
                        zIndex={55}
                        onClick={() =>
                          handleFocusCoords(
                            focusedTarget.lat,
                            focusedTarget.lng,
                            { kind: 'pin', target: focusedTarget },
                            16
                          )
                        }
                      >
                        <div className="px-2.5 py-1 rounded-full bg-teal-300 text-[#031820] border-2 border-white shadow-xl flex items-center gap-1 text-[11px] font-bold">
                          <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                          <span className="max-w-[110px] truncate">{focusedTarget.label}</span>
                        </div>
                      </AdvancedMarker>
                    )}

                  {/* User Current Position Marker */}
                  <AdvancedMarker
                    position={{ lat: centerLat, lng: centerLng }}
                    title={usingLiveGps ? 'You (Live GPS)' : 'You'}
                    zIndex={60}
                    onClick={() =>
                      handleFocusCoords(centerLat, centerLng, { kind: 'self' }, 15)
                    }
                  >
                    <div className="relative flex items-center justify-center">
                      {usingLiveGps && (
                        <span
                          className="absolute w-8 h-8 rounded-full bg-teal-400/35 animate-ping"
                          aria-hidden="true"
                        />
                      )}
                      <div className="w-5 h-5 rounded-full bg-[#ECF7FA] border-[3px] border-teal-400 shadow-lg" />
                    </div>
                  </AdvancedMarker>

                  {/* Active InfoWindow */}
                  {selectedPin && infoWindowPos && (
                    <InfoWindow
                      position={infoWindowPos}
                      pixelOffset={[0, -28]}
                      onCloseClick={() => {
                        setSelectedPin(null);
                        if (focusedTarget) onClearFocusedTarget();
                      }}
                    >
                      <div className="bg-[#091826] text-[#ECF7FA] rounded-lg p-2.5 min-w-[210px] max-w-[260px] space-y-2 border border-sky-400/20">
                        {selectedPin.kind === 'self' && (
                          <>
                            <div className="text-xs font-bold text-teal-300">
                              {usingLiveGps ? 'Your Live GPS Position' : 'Your Active Anchor'}
                            </div>
                            <div className="text-[11px] font-mono text-[#CBE4EE]">
                              {formatCoordPair(centerLat, centerLng)}
                            </div>
                            <button
                              type="button"
                              onClick={onToggleLiveGps}
                              className="w-full py-1.5 px-2.5 rounded-lg bg-teal-500/20 border border-teal-400/35 text-xs font-semibold text-teal-200 cursor-pointer"
                            >
                              {usingLiveGps ? 'Switch to Hub Anchor' : 'Enable Live GPS'}
                            </button>
                          </>
                        )}

                        {selectedPin.kind === 'peer' && (() => {
                          const peer = selectedPin.peer;
                          const isFriend = friendUids.has(peer.uid);
                          const isPending = pendingFriendUids.has(peer.uid);
                          const dist = calculateDistanceKm(
                            centerLat,
                            centerLng,
                            peer.lat,
                            peer.lng
                          );
                          return (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-[#ECF7FA] truncate">
                                  {peer.handle}
                                </span>
                                <span
                                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                    isFriend
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : 'bg-sky-500/20 text-sky-300'
                                  }`}
                                >
                                  {isFriend ? 'Friend' : 'Neighbor'}
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-[#9CC0CE] tabular-nums">
                                {formatDistanceLabel(dist)} · {formatCoordPair(peer.lat, peer.lng)}
                              </div>
                              {peer.isLiveLocation && (
                                <div className="text-[11px] text-emerald-300 font-medium flex items-center gap-1">
                                  <Radio className="w-3 h-3" aria-hidden="true" />
                                  <span>
                                    Sharing live GPS
                                    {peer.accuracyMeters ? ` (±${peer.accuracyMeters} m)` : ''}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRouteTo(peer.lat, peer.lng, peer.handle)
                                  }
                                  className="flex-1 py-1 px-2 rounded-lg bg-teal-500/20 border border-teal-400/35 text-[11px] font-semibold text-teal-200 cursor-pointer"
                                >
                                  Directions
                                </button>
                                {isFriend ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenDirectChatByUid(peer.uid)}
                                    className="flex-1 py-1 px-2 rounded-lg bg-emerald-500/20 border border-emerald-400/35 text-[11px] font-semibold text-emerald-200 cursor-pointer"
                                  >
                                    Message
                                  </button>
                                ) : isPending ? (
                                  <span className="px-2 py-1 text-[11px] text-[#8EB3C2]">
                                    Pending
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onQuickAddFriend(peer)}
                                    className="flex-1 py-1 px-2 rounded-lg bg-sky-500/20 border border-sky-400/35 text-[11px] font-semibold text-sky-200 cursor-pointer"
                                  >
                                    Add Friend
                                  </button>
                                )}
                              </div>
                            </>
                          );
                        })()}

                        {selectedPin.kind === 'story' && (() => {
                          const s = selectedPin.story;
                          const dist = calculateDistanceKm(centerLat, centerLng, s.lat, s.lng);
                          return (
                            <>
                              <div className="text-[10px] font-mono text-emerald-300">
                                {s.vibe} · {formatDistanceLabel(dist)} ·{' '}
                                {formatRemainingTime(s.expiresAtMs, now)}
                              </div>
                              <div className="text-xs font-bold text-[#ECF7FA]">{s.headline}</div>
                              <div className="flex items-center gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => onOpenStory(s)}
                                  className="flex-1 py-1 px-2 rounded-lg bg-emerald-500/25 border border-emerald-400/40 text-[11px] font-semibold text-emerald-200 cursor-pointer"
                                >
                                  Open Story
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRouteTo(s.lat, s.lng, s.headline)}
                                  className="flex-1 py-1 px-2 rounded-lg bg-teal-500/20 border border-teal-400/35 text-[11px] font-semibold text-teal-200 cursor-pointer"
                                >
                                  Directions
                                </button>
                              </div>
                            </>
                          );
                        })()}

                        {selectedPin.kind === 'zone' && (() => {
                          const z = selectedPin.zone;
                          return (
                            <>
                              <div className="text-xs font-bold text-[#ECF7FA]">{z.name}</div>
                              <div className="text-[11px] text-[#9CC0CE]">
                                {z.neighborhood} · {z.activeCount} active
                              </div>
                              <div className="flex items-center gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => onSelectZone(z.id)}
                                  className="flex-1 py-1 px-2 rounded-lg bg-teal-500/20 border border-teal-400/35 text-[11px] font-semibold text-teal-200 cursor-pointer"
                                >
                                  Enter Room
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRouteTo(z.lat, z.lng, z.name)}
                                  className="flex-1 py-1 px-2 rounded-lg bg-sky-500/20 border border-sky-400/35 text-[11px] font-semibold text-sky-200 cursor-pointer"
                                >
                                  Directions
                                </button>
                              </div>
                            </>
                          );
                        })()}

                        {selectedPin.kind === 'pin' && (() => {
                          const t = selectedPin.target;
                          const dist = calculateDistanceKm(centerLat, centerLng, t.lat, t.lng);
                          return (
                            <>
                              <div className="text-xs font-bold text-teal-300">{t.label}</div>
                              <div className="text-[11px] font-mono text-[#9CC0CE] tabular-nums">
                                {formatDistanceLabel(dist)} · {formatCoordPair(t.lat, t.lng)}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRouteTo(t.lat, t.lng, t.label)}
                                className="w-full py-1.5 px-2.5 rounded-lg bg-teal-500/20 border border-teal-400/35 text-xs font-semibold text-teal-200 cursor-pointer"
                              >
                                Get Directions
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>
              </MapsStatusBanner>
            </APIProvider>
          </div>
        )}

        {/* Legend Footer */}
        <div className="pt-2 border-t border-sky-400/15 flex flex-wrap items-center justify-between gap-3 text-xs text-[#8EB3C2]">
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" aria-hidden="true" />
              Friend / Story
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" aria-hidden="true" />
              Neighbor Online
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full bg-[#ECF7FA] border border-teal-400"
                aria-hidden="true"
              />
              You
            </span>
          </div>
          <span className="tabular-nums font-mono inline-flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-teal-300" aria-hidden="true" />
            {sortedPeers.length + 1} visible · {stories.length} stories · {radiusKm} km
          </span>
        </div>
      </section>

      {/* Right: Live People, Friends & Story Directory */}
      <aside
        aria-label="Exact locations and hotspots directory"
        className="lg:col-span-5 shader-panel rounded-2xl p-5 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-bold text-[#ECF7FA]">
              Exact Locations &amp; Hotspots
            </h3>
            <p className="text-xs text-[#8EB3C2]">
              Tap any person or story to focus coordinates or preview directions
            </p>
          </div>
          <Navigation className="w-4 h-4 text-teal-300 shrink-0" aria-hidden="true" />
        </div>

        {/* Filter Tabs */}
        <div
          role="group"
          aria-label="Filter radar directory"
          className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#050C14]/85 border border-sky-400/15"
        >
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'friends', label: 'Friends' },
              { id: 'live', label: 'Live GPS' },
              { id: 'stories', label: 'Stories' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`min-h-[32px] px-2 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filter === tab.id
                  ? 'bg-teal-400/20 text-teal-200 border border-teal-400/30'
                  : 'text-[#8EB3C2] hover:text-[#ECF7FA] border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-4 flex-1 overflow-y-auto max-h-[540px] pr-0.5">
          {/* People & Friends Section */}
          {filter !== 'stories' && (
            <div className="space-y-2.5">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#7FA6B7] px-1">
                People Nearby ({filteredPeers.length})
              </div>
              {filteredPeers.length === 0 ? (
                <div className="p-4 rounded-xl shader-surface text-xs text-[#8EB3C2] text-center">
                  {filter === 'friends'
                    ? 'None of your friends are broadcasting on the radar right now.'
                    : filter === 'live'
                      ? 'No one in range has Live GPS toggled on yet.'
                      : `No other neighbors online within ${radiusKm} km yet.`}
                </div>
              ) : (
                filteredPeers.map((peer) => {
                  const isFriend = peer.isFriend;
                  const isPending = pendingFriendUids.has(peer.uid);
                  return (
                    <div
                      key={peer.uid}
                      className="p-3.5 rounded-xl shader-surface space-y-2.5 hover:border-teal-400/35 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <PersonaGlyph hue={peer.hue} size={30} label={peer.handle} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-[#ECF7FA] truncate">
                                {peer.handle}
                              </span>
                              {isFriend && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                                  Friend
                                </span>
                              )}
                              {peer.isLiveLocation && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-200 text-[10px] font-mono">
                                  <Radio className="w-2.5 h-2.5" aria-hidden="true" />
                                  LIVE
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-[#8EB3C2] tabular-nums">
                              {formatDistanceLabel(peer.distanceKm)} ·{' '}
                              {formatCoordPair(peer.lat, peer.lng)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleFocusCoords(
                              peer.lat,
                              peer.lng,
                              { kind: 'peer', peer },
                              16
                            )
                          }
                          className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 rounded-lg bg-[#050C14]/80 border border-sky-400/20 hover:border-teal-400/40 text-xs font-medium text-[#CBE4EE] cursor-pointer"
                        >
                          <Crosshair className="w-3 h-3 text-sky-300" aria-hidden="true" />
                          <span>Locate</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRouteTo(peer.lat, peer.lng, peer.handle)}
                          className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 rounded-lg bg-[#050C14]/80 border border-sky-400/20 hover:border-teal-400/40 text-xs font-medium text-[#CBE4EE] cursor-pointer"
                        >
                          <Navigation className="w-3 h-3 text-teal-300" aria-hidden="true" />
                          <span>Route</span>
                        </button>

                        {isFriend ? (
                          <button
                            type="button"
                            onClick={() => onOpenDirectChatByUid(peer.uid)}
                            className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/35 hover:bg-emerald-500/25 text-xs font-semibold text-emerald-200 cursor-pointer ml-auto"
                          >
                            <MessageCircle className="w-3 h-3" aria-hidden="true" />
                            <span>DM</span>
                          </button>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#8EB3C2] ml-auto px-2">
                            <UserCheck className="w-3 h-3" aria-hidden="true" />
                            <span>Requested</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onQuickAddFriend(peer)}
                            className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 rounded-lg bg-teal-500/15 border border-teal-400/35 hover:bg-teal-500/25 text-xs font-semibold text-teal-200 cursor-pointer ml-auto"
                          >
                            <UserPlus className="w-3 h-3" aria-hidden="true" />
                            <span>Add Friend</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Stories Section */}
          {filter !== 'friends' && filter !== 'live' && (
            <div className="space-y-2.5">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#7FA6B7] px-1">
                Active Story Pins ({filteredStories.length})
              </div>
              {filteredStories.length === 0 ? (
                <p className="p-4 rounded-xl shader-surface text-xs text-[#8EB3C2] text-center">
                  No live stories within {radiusKm} km yet.
                </p>
              ) : (
                filteredStories.map((story) => {
                  const dist = calculateDistanceKm(
                    centerLat,
                    centerLng,
                    story.lat,
                    story.lng
                  );
                  return (
                    <div
                      key={story.id}
                      className="p-3.5 rounded-xl shader-surface space-y-2 hover:border-teal-400/35 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-[#8EB3C2]">
                        <span className="font-medium text-[#CBE4EE]">{story.zoneName}</span>
                        <span className="font-mono tabular-nums text-teal-300">
                          {formatDistanceLabel(dist)} · {formatRemainingTime(story.expiresAtMs, now)}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-[#ECF7FA] line-clamp-1">
                        {story.headline}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <span className="text-[11px] font-mono text-[#7FA6B7] tabular-nums">
                          {formatCoordPair(story.lat, story.lng)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleFocusCoords(
                                story.lat,
                                story.lng,
                                { kind: 'story', story },
                                15
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#050C14]/80 border border-sky-400/20 text-[11px] font-medium text-[#CBE4EE] cursor-pointer"
                          >
                            <Crosshair className="w-3 h-3 text-sky-300" aria-hidden="true" />
                            <span>Locate</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleRouteTo(story.lat, story.lng, story.headline)
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#050C14]/80 border border-sky-400/20 text-[11px] font-medium text-[#CBE4EE] cursor-pointer"
                          >
                            <Navigation className="w-3 h-3 text-teal-300" aria-hidden="true" />
                            <span>Route</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenStory(story)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/35 text-[11px] font-semibold text-emerald-200 cursor-pointer"
                          >
                            <Flame className="w-3 h-3" aria-hidden="true" />
                            <span>Open</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
