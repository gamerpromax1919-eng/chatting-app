import { useEffect, useState, type FormEvent } from 'react';
import { Flame, MessageSquare, Send, Share2, X } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase.ts';
import type { LocationStory, StoryReply } from '../types/drift.ts';
import {
  formatDistanceLabel,
  formatRemainingTime,
  getExpiryProgress,
  isExpired,
} from '../utils/ephemeral.ts';
import { OperationType, handleFirestoreError } from '../utils/firestoreErrors.ts';
import { PersonaGlyph } from './PersonaGlyph.tsx';

interface StoryViewerModalProps {
  story: LocationStory | null;
  distanceKm: number;
  now: number;
  currentUid: string;
  isBoosted: boolean;
  onClose: () => void;
  onBoost: (storyId: string) => void;
  onShare: (story: LocationStory) => void;
  onReply: (story: LocationStory, text: string) => Promise<void>;
  onJumpToZoneChat: (story: LocationStory) => void;
}

export function StoryViewerModal({
  story,
  distanceKm,
  now,
  currentUid,
  isBoosted,
  onClose,
  onBoost,
  onShare,
  onReply,
  onJumpToZoneChat,
}: StoryViewerModalProps) {
  const [replies, setReplies] = useState<StoryReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!story) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [story, onClose]);

  useEffect(() => {
    if (!story || !auth.currentUser) {
      setReplies([]);
      return;
    }

    const repliesPath = `stories/${story.id}/replies`;
    const q = query(
      collection(db, 'stories', story.id, 'replies'),
      where('storyId', '==', story.id)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const next: StoryReply[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          next.push({
            id: docSnap.id,
            storyId: String(data.storyId ?? story.id),
            authorId: String(data.authorId ?? ''),
            authorHandle: String(data.authorHandle ?? 'Neighbor'),
            authorHue: Number(data.authorHue ?? 198),
            text: String(data.text ?? ''),
            createdAtMs: Number(data.createdAtMs ?? 0),
            expiresAtMs: Number(data.expiresAtMs ?? 0),
          });
        });
        next.sort((a, b) => a.createdAtMs - b.createdAtMs);
        setReplies(next);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, repliesPath);
      }
    );

    return () => unsub();
  }, [story]);

  if (!story) return null;

  const activeReplies = replies.filter((r) => !isExpired(r.expiresAtMs, now));
  const progress = getExpiryProgress(story.createdAtMs, story.expiresAtMs, now);
  const isOwn = story.authorId === currentUid;

  const handleReplySubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = replyText.trim();
    if (!trimmed) {
      setReplyError('Write a quick reply first.');
      return;
    }
    setReplyError(null);
    setSending(true);
    try {
      await onReply(story, trimmed);
      setReplyText('');
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to post reply.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-viewer-title"
        className="w-full sm:max-w-2xl shader-panel rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Top live burn progress bar */}
        <div className="h-1.5 w-full bg-[#050C14]" aria-hidden="true">
          <div
            className="h-full bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400 transition-all duration-500"
            style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
          />
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-sky-400/15 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-[2px] rounded-full shader-ring-gradient shrink-0">
              <div className="rounded-full bg-[#07131E] p-[1px]">
                <PersonaGlyph hue={story.authorHue} size={32} label={story.authorHandle} />
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#ECF7FA] truncate">
                {isOwn ? `${story.authorHandle} (You)` : story.authorHandle}
              </div>
              <div className="text-xs text-[#8EB3C2] truncate">
                {story.zoneName} · {formatDistanceLabel(distanceKm)} ·{' '}
                <span className="font-mono tabular-nums text-teal-300">
                  {formatRemainingTime(story.expiresAtMs, now)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close story viewer"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#8EB3C2] hover:bg-sky-400/10 hover:text-[#ECF7FA] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {story.imageUrl && (
            <div className="w-full aspect-[16/10] rounded-xl overflow-hidden bg-[#050C14] border border-sky-400/15">
              <img
                src={story.imageUrl}
                alt={story.headline}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-teal-300 mb-1">
              {story.vibe}
            </div>
            <h2
              id="story-viewer-title"
              className="font-display text-2xl font-bold text-[#ECF7FA] text-balance leading-snug"
            >
              {story.headline}
            </h2>
            <p className="mt-2.5 text-sm sm:text-base text-[#CBE4EE] leading-relaxed">
              {story.caption}
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => onBoost(story.id)}
              aria-pressed={isBoosted}
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                isBoosted
                  ? 'shader-btn-primary'
                  : 'bg-[#050C14]/75 border border-sky-400/20 hover:bg-sky-400/15 text-[#ECF7FA]'
              }`}
            >
              <Flame className="w-4 h-4" aria-hidden="true" />
              <span>Boost ({story.boostCount})</span>
            </button>

            <button
              type="button"
              onClick={() => onShare(story)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[#050C14]/75 border border-sky-400/20 hover:bg-sky-400/15 text-[#ECF7FA] text-xs font-semibold transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-sky-300" aria-hidden="true" />
              <span>Send to Friend / Share ({story.shareCount})</span>
            </button>

            <button
              type="button"
              onClick={() => onJumpToZoneChat(story)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-sky-400/20 hover:bg-sky-400/10 text-[#CBE4EE] text-xs font-semibold transition-colors cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" aria-hidden="true" />
              <span>Discuss in Room</span>
            </button>
          </div>

          {/* Ephemeral Replies */}
          <div className="pt-4 border-t border-sky-400/15 space-y-3">
            <h3 className="text-xs font-semibold text-[#8EB3C2]">
              Expiring Replies ({activeReplies.length})
            </h3>

            {activeReplies.length === 0 ? (
              <p className="text-xs text-[#7FA6B7]">
                No replies yet—leave a quick update for neighbors nearby.
              </p>
            ) : (
              <div className="space-y-2.5">
                {activeReplies.map((reply) => (
                  <div
                    key={reply.id}
                    className="p-3 rounded-xl shader-surface"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <PersonaGlyph hue={reply.authorHue} size={20} />
                        <span className="text-xs font-semibold text-[#ECF7FA]">
                          {reply.authorId === currentUid
                            ? `${reply.authorHandle} (You)`
                            : reply.authorHandle}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-teal-300">
                        {formatRemainingTime(reply.expiresAtMs, now)}
                      </span>
                    </div>
                    <p className="text-sm text-[#CBE4EE]">{reply.text}</p>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleReplySubmit} className="flex items-center gap-2 pt-1">
              <label htmlFor="story-reply-input" className="sr-only">
                Add an expiring reply
              </label>
              <input
                id="story-reply-input"
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                maxLength={220}
                placeholder="Add an anonymous update (burns with story)..."
                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl border border-sky-400/20 bg-[#050C14]/85 text-sm text-[#ECF7FA] placeholder:text-[#5F8496] focus:outline-none focus:border-teal-400"
              />
              <button
                type="submit"
                disabled={sending}
                aria-label="Send story reply"
                className="min-h-[42px] px-4 rounded-xl shader-btn-primary disabled:opacity-50 inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reply</span>
              </button>
            </form>
            {replyError && (
              <p role="alert" className="text-xs text-rose-400">
                {replyError}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
