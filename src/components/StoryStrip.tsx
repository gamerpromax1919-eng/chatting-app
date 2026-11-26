import { Flame } from 'lucide-react';
import type { LocationStory } from '../types/drift.ts';
import { formatRemainingTime, getExpiryProgress } from '../utils/ephemeral.ts';
import { PersonaGlyph } from './PersonaGlyph.tsx';

interface StoryStripProps {
  stories: readonly LocationStory[];
  now: number;
  onSelectStory: (story: LocationStory) => void;
}

export function StoryStrip({ stories, now, onSelectStory }: StoryStripProps) {
  if (stories.length === 0) return null;

  return (
    <section aria-label="Quick story highlights" className="mb-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-base font-bold text-[#ECF7FA]">
          Expiring Stories Near You
        </h2>
        <span className="text-xs text-[#8EB3C2] font-mono tabular-nums">
          {stories.length} active
        </span>
      </div>

      <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-1">
        {stories.map((story) => {
          const progress = getExpiryProgress(story.createdAtMs, story.expiresAtMs, now);
          const circumference = 2 * Math.PI * 26;
          const strokeDashoffset = circumference * (1 - progress);

          const diffMin = Math.max(1, Math.ceil((story.expiresAtMs - now) / 60000));
          const compactTime =
            story.expiresAtMs - now < 60_000
              ? formatRemainingTime(story.expiresAtMs, now).replace(' left', '')
              : diffMin >= 60
                ? `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`
                : `${diffMin}m`;

          return (
            <button
              key={story.id}
              type="button"
              onClick={() => onSelectStory(story)}
              aria-label={`Open story: ${story.headline}`}
              className="group flex flex-col items-center w-24 shrink-0 text-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400"
            >
              <div className="relative w-16 h-16 flex items-center justify-center mb-1.5">
                <svg
                  className="absolute inset-0 w-16 h-16 -rotate-90"
                  viewBox="0 0 60 60"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id={`ring-${story.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38BDF8" />
                      <stop offset="50%" stopColor="#2DD4BF" />
                      <stop offset="100%" stopColor="#34D399" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="30"
                    cy="30"
                    r="26"
                    fill="none"
                    stroke="rgba(56, 189, 248, 0.16)"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="30"
                    cy="30"
                    r="26"
                    fill="none"
                    stroke={`url(#ring-${story.id})`}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                  />
                </svg>

                <div className="w-12 h-12 rounded-full overflow-hidden bg-[#091826] flex items-center justify-center border border-sky-400/25">
                  {story.imageUrl ? (
                    <img
                      src={story.imageUrl}
                      alt={story.headline}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <PersonaGlyph hue={story.authorHue} size={44} />
                  )}
                </div>
              </div>

              <span className="text-xs font-medium text-[#D9F0F6] line-clamp-1 w-full group-hover:text-teal-300 transition-colors">
                {story.vibe}
              </span>
              <span className="inline-flex items-center justify-center gap-1 text-[11px] text-[#8EB3C2] font-mono tabular-nums whitespace-nowrap mt-0.5">
                <Flame className="w-3 h-3 text-teal-300 shrink-0" aria-hidden="true" />
                <span>{story.boostCount}</span>
                <span aria-hidden="true">·</span>
                <span>{compactTime}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
