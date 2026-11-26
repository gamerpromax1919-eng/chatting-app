import { useState } from 'react';
import { Flame, MapPin, MessageCircle, Send, Trash2 } from 'lucide-react';
import type { LocationStory } from '../types/drift.ts';
import {
  formatDistanceLabel,
  formatRemainingTime,
  getExpiryProgress,
} from '../utils/ephemeral.ts';
import { PersonaGlyph } from './PersonaGlyph.tsx';

interface StoryCardProps {
  story: LocationStory;
  distanceKm: number;
  now: number;
  currentUid: string;
  isBoosted: boolean;
  onOpenStory: (story: LocationStory) => void;
  onBoost: (storyId: string) => void;
  onShare: (story: LocationStory) => void;
  onReplyInChat: (story: LocationStory) => void;
  onDeleteStory: (storyId: string) => void;
}

export function StoryCard({
  story,
  distanceKm,
  now,
  currentUid,
  isBoosted,
  onOpenStory,
  onBoost,
  onShare,
  onReplyInChat,
  onDeleteStory,
}: StoryCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const isOwn = story.authorId === currentUid;
  const progress = getExpiryProgress(story.createdAtMs, story.expiresAtMs, now);

  return (
    <article
      data-testid={`story-card-${story.id}`}
      className="shader-panel rounded-2xl overflow-hidden transition-all hover:border-teal-400/35 flex flex-col"
    >
      {/* Top burn progress hairline */}
      <div className="h-1 w-full bg-[#050C14]" aria-hidden="true">
        <div
          className="h-full bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400 transition-all duration-500"
          style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
        />
      </div>

      <div className="p-5 flex-1 flex flex-col gap-3.5">
        {/* Clean unboxed metadata header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-[1.5px] rounded-full shader-ring-gradient shrink-0">
              <div className="rounded-full bg-[#07131E] p-[1px]">
                <PersonaGlyph hue={story.authorHue} size={28} label={story.authorHandle} />
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#ECF7FA] truncate">
                {isOwn ? `${story.authorHandle} (You)` : story.authorHandle}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#8EB3C2] truncate">
                <span>{story.vibe}</span>
                <span aria-hidden="true">·</span>
                <span>{story.zoneName}</span>
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-xs font-mono tabular-nums font-medium text-teal-300">
              {formatRemainingTime(story.expiresAtMs, now)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-[#7FA6B7]">
              {formatDistanceLabel(distanceKm)} away
            </div>
          </div>
        </div>

        {/* Clickable headline + caption */}
        <button
          type="button"
          onClick={() => onOpenStory(story)}
          className="text-left group cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400 rounded-lg"
        >
          <h3 className="font-display text-lg font-bold leading-snug text-[#ECF7FA] text-balance group-hover:text-teal-300 transition-colors">
            {story.headline}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-[#A7CBD8] line-clamp-3">
            {story.caption}
          </p>
        </button>

        {/* Optional Story Media with Zero-Broken-Image fallback */}
        {story.imageUrl && (
          <button
            type="button"
            onClick={() => onOpenStory(story)}
            aria-label={`View photo for ${story.headline}`}
            className="relative w-full aspect-[16/10] rounded-xl overflow-hidden bg-[#050C14] border border-sky-400/15 cursor-pointer block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400"
          >
            {!imgFailed ? (
              <img
                src={story.imageUrl}
                alt={story.headline}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#0B2235] via-[#071825] to-[#082B2B] flex flex-col items-center justify-center p-4 text-[#8EB3C2]">
                <MapPin className="w-6 h-6 mb-1.5 text-teal-300" aria-hidden="true" />
                <span className="text-xs font-medium text-center">{story.zoneName}</span>
              </div>
            )}
          </button>
        )}

        {/* Action Row */}
        <div className="pt-2.5 mt-auto border-t border-sky-400/15 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onBoost(story.id)}
              aria-pressed={isBoosted}
              aria-label={`Boost story "${story.headline}" (${story.boostCount} boosts)`}
              className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                isBoosted
                  ? 'bg-teal-400/20 text-teal-200 border border-teal-400/30'
                  : 'text-[#8EB3C2] hover:bg-sky-400/10 hover:text-[#ECF7FA]'
              }`}
            >
              <Flame className="w-4 h-4" aria-hidden="true" />
              <span>{story.boostCount}</span>
            </button>

            <button
              type="button"
              onClick={() => onReplyInChat(story)}
              aria-label={`Whisper in room about "${story.headline}"`}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium text-[#8EB3C2] hover:bg-sky-400/10 hover:text-[#ECF7FA] tabular-nums transition-colors cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
              <span>{story.replyCount}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {isOwn && (
              <button
                type="button"
                onClick={() => onDeleteStory(story.id)}
                aria-label={`Delete your story "${story.headline}"`}
                title="Delete your story"
                className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-xl text-[#7FA6B7] hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onShare(story)}
              aria-label={`Send or share "${story.headline}"`}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium text-[#A7CBD8] hover:bg-sky-400/10 hover:text-[#ECF7FA] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
              <span>Share</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenStory(story)}
              className="inline-flex items-center min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold text-[#ECF7FA] bg-sky-400/15 hover:bg-sky-400/25 border border-sky-400/20 transition-colors cursor-pointer whitespace-nowrap"
            >
              Open
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
