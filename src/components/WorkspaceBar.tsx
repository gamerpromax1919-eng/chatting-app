import { useState } from 'react';
import {
  Check,
  Copy,
  LocateFixed,
  LogOut,
  MapPinPlus,
  RefreshCw,
  Share2,
  Users,
} from 'lucide-react';
import type { AnonymousIdentity, LocationZone, ZoneId } from '../types/drift.ts';
import { PersonaGlyph } from './PersonaGlyph.tsx';

interface WorkspaceBarProps {
  zones: readonly LocationZone[];
  selectedZoneId: ZoneId;
  onSelectZone: (zoneId: ZoneId) => void;
  radiusKm: number;
  onSelectRadius: (km: number) => void;
  usingGps: boolean;
  gpsLoading: boolean;
  gpsError: string | null;
  onRequestGps: () => void;
  onOpenCreateZone: () => void;
  identity: AnonymousIdentity;
  onRotateIdentity: () => void;
  onSignOut: () => void;
  onlineCount: number;
}

const RADIUS_OPTIONS = [1, 3, 10, 25] as const;

export function WorkspaceBar({
  zones,
  selectedZoneId,
  onSelectZone,
  radiusKm,
  onSelectRadius,
  usingGps,
  gpsLoading,
  gpsError,
  onRequestGps,
  onOpenCreateZone,
  identity,
  onRotateIdentity,
  onSignOut,
  onlineCount,
}: WorkspaceBarProps) {
  const [roomCopied, setRoomCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const handleShareRoom = async () => {
    const url = `${window.location.origin}/?zone=${encodeURIComponent(selectedZoneId)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.history.replaceState(null, '', `?zone=${encodeURIComponent(selectedZoneId)}`);
    }
    setRoomCopied(true);
    setTimeout(() => setRoomCopied(false), 1800);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(identity.friendCode);
    } catch {
      // Ignore clipboard restriction
    }
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1800);
  };

  return (
    <section
      aria-label="Neighborhood and discovery controls"
      className="bg-[#06111B]/70 backdrop-blur-md border-b border-sky-400/15"
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2.5">
        {/* Left: Neighborhood Zone Selector + GPS + Create Room + Radius */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Neighborhood zones"
            className="flex items-center gap-1 p-1 bg-[#050C14]/85 border border-sky-400/15 rounded-xl overflow-x-auto no-scrollbar max-w-full"
          >
            {zones.map((zone) => {
              const active = selectedZoneId === zone.id;
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => onSelectZone(zone.id)}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    active
                      ? 'bg-gradient-to-r from-sky-500/25 to-teal-500/25 text-[#ECF7FA] border border-teal-400/30 font-semibold'
                      : 'text-[#8EB3C2] hover:text-[#ECF7FA] border border-transparent'
                  }`}
                >
                  {zone.name}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenCreateZone}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border border-sky-400/20 bg-[#091826]/80 hover:bg-sky-400/10 text-xs font-medium text-[#CBE4EE] whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <MapPinPlus className="w-3.5 h-3.5 text-teal-300" aria-hidden="true" />
            <span>New Room</span>
          </button>

          <button
            type="button"
            onClick={onRequestGps}
            disabled={gpsLoading}
            className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              usingGps
                ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
                : 'border-sky-400/20 bg-[#091826]/80 text-[#CBE4EE] hover:bg-sky-400/10'
            }`}
          >
            <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{gpsLoading ? 'Locking GPS...' : usingGps ? 'Live GPS On' : 'Live GPS'}</span>
          </button>

          <div
            role="group"
            aria-label="Discovery radius"
            className="flex items-center gap-1 p-1 bg-[#050C14]/85 border border-sky-400/15 rounded-xl"
          >
            {RADIUS_OPTIONS.map((km) => {
              const active = radiusKm === km;
              return (
                <button
                  key={km}
                  type="button"
                  onClick={() => onSelectRadius(km)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    active
                      ? 'bg-teal-400/20 text-teal-200 font-semibold'
                      : 'text-[#8EB3C2] hover:text-[#ECF7FA]'
                  }`}
                >
                  {km} km
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Invite Room Link, Live People Count, Mobile Mask Controls */}
        <div className="flex flex-wrap items-center justify-between xl:justify-end gap-3">
          <button
            type="button"
            onClick={() => void handleShareRoom()}
            className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-xl border border-sky-400/20 bg-[#091826]/80 hover:bg-sky-400/10 text-xs font-medium text-[#CBE4EE] whitespace-nowrap shrink-0 cursor-pointer"
          >
            {roomCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
                <span className="text-emerald-300">Room link copied</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
                <span>Invite Room</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-1.5 text-xs text-[#8EB3C2] tabular-nums whitespace-nowrap">
            <Users className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            <span>
              {onlineCount} {onlineCount === 1 ? 'person' : 'people'} active
            </span>
          </div>

          {/* Mobile/Tablet Identity & Friend Code Controls (Desktop uses DiscordSidebar dock) */}
          <div className="flex lg:hidden items-center gap-2 pl-2 border-l border-sky-400/15">
            <PersonaGlyph hue={identity.hue} size={26} label={identity.handle} />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#ECF7FA] truncate max-w-[110px]">
                {identity.handle}
              </div>
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="inline-flex items-center gap-1 text-[10px] font-mono text-teal-300 cursor-pointer"
              >
                <span>{codeCopied ? 'Copied' : identity.friendCode}</span>
                {codeCopied ? (
                  <Check className="w-2.5 h-2.5" aria-hidden="true" />
                ) : (
                  <Copy className="w-2.5 h-2.5" aria-hidden="true" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={onRotateIdentity}
              aria-label="Switch anonymous mask"
              className="inline-flex items-center justify-center min-h-[32px] min-w-[32px] p-1.5 rounded-lg border border-sky-400/20 bg-[#091826]/80 text-[#8EB3C2] hover:text-[#ECF7FA] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className="inline-flex items-center justify-center min-h-[32px] min-w-[32px] p-1.5 rounded-lg border border-sky-400/20 bg-[#091826]/80 text-[#8EB3C2] hover:text-rose-300 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {gpsError && (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pb-2.5">
          <p className="text-xs text-amber-300">{gpsError}</p>
        </div>
      )}
    </section>
  );
}
