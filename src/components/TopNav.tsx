import {
  Activity,
  Compass,
  Flame,
  MessageSquare,
  Plus,
  UserPlus,
} from 'lucide-react';
import type { NavSection } from '../types/drift.ts';

interface TopNavProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onOpenComposer: () => void;
  pendingRequestCount: number;
}

const NAV_ITEMS: readonly { id: NavSection; label: string; icon: typeof Flame }[] = [
  { id: 'feed', label: 'Feed & Rooms', icon: Flame },
  { id: 'messages', label: 'DMs & Groups', icon: MessageSquare },
  { id: 'friends', label: 'Friends', icon: UserPlus },
  { id: 'radar', label: 'Radar', icon: Compass },
  { id: 'pulse', label: 'Pulse Brief', icon: Activity },
];

const MOBILE_NAV_ITEMS = NAV_ITEMS.slice(0, 4);

export function TopNav({
  activeSection,
  onSelectSection,
  onOpenComposer,
  pendingRequestCount,
}: TopNavProps) {
  return (
    <>
      <header className="sticky top-0 z-30 bg-[#06111B]/85 backdrop-blur-xl border-b border-sky-400/15">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <button
            type="button"
            onClick={() => onSelectSection('feed')}
            className="font-display text-2xl font-bold tracking-tight shader-accent-text whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-400"
          >
            Drift
          </button>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              const suffix =
                item.id === 'friends' && pendingRequestCount > 0
                  ? ` (${pendingRequestCount})`
                  : '';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectSection(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-400 ${
                    isActive
                      ? 'text-[#ECF7FA] font-semibold'
                      : 'text-[#8EB3C2] hover:text-[#ECF7FA]'
                  }`}
                >
                  {item.label}
                  {suffix}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-[1px] h-0.5 bg-gradient-to-r from-sky-400 to-emerald-400 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single primary action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={onOpenComposer}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl shader-btn-primary active:scale-[0.98] text-sm font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Drop Story</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Thumb Navigation (<= 15% aggregate sticky height with top header) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#06111B]/95 backdrop-blur-xl border-t border-sky-400/15 grid grid-cols-4 items-center"
      >
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                isActive ? 'text-teal-300' : 'text-[#8EB3C2] hover:text-[#ECF7FA]'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                {item.id === 'friends' && pendingRequestCount > 0
                  ? `Friends (${pendingRequestCount})`
                  : item.label.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
