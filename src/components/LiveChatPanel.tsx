import { useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  Hash,
  MapPin,
  Radio,
  Send,
  Timer,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  AnonymousIdentity,
  EmojiKey,
  EphemeralMessage,
  FocusedMapTarget,
  LocationStory,
  LocationZone,
  MessageTtlKey,
  PresenceUser,
} from '../types/drift.ts';
import {
  MESSAGE_TTL_OPTIONS,
  REACTION_OPTIONS,
  formatCoordPair,
  formatRemainingTime,
  getExpiryProgress,
  isValidCoordinates,
  validateMessageInput,
} from '../utils/ephemeral.ts';
import { PersonaGlyph } from './PersonaGlyph.tsx';

interface LiveChatPanelProps {
  zone: LocationZone;
  messages: readonly EphemeralMessage[];
  roomPeers: readonly PresenceUser[];
  peersByUid?: Record<string, PresenceUser>;
  now: number;
  identity: AnonymousIdentity;
  userReactionsMap: Record<string, EmojiKey[]>;
  revealedMessageIds: Set<string>;
  replyContext: LocationStory | null;
  friendUids?: Set<string>;
  pendingFriendUids?: Set<string>;
  onQuickAddFriend?: (peer: PresenceUser) => void;
  onClearReplyContext: () => void;
  onSendMessage: (payload: {
    text: string;
    ttlKey: MessageTtlKey;
    burnOnRead: boolean;
    replyToStoryId?: string;
    replyToHeadline?: string;
  }) => Promise<void>;
  onSendLocation?: (payload: {
    ttlKey: MessageTtlKey;
    burnOnRead: boolean;
    liveMode: boolean;
  }) => Promise<void>;
  onViewLocationOnRadar?: (target: FocusedMapTarget) => void;
  onReact: (messageId: string, emojiKey: EmojiKey) => void;
  onReveal: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  expanded?: boolean;
}

export function LiveChatPanel({
  zone,
  messages,
  roomPeers,
  peersByUid = {},
  now,
  identity,
  userReactionsMap,
  revealedMessageIds,
  replyContext,
  friendUids,
  pendingFriendUids,
  onQuickAddFriend,
  onClearReplyContext,
  onSendMessage,
  onSendLocation,
  onViewLocationOnRadar,
  onReact,
  onReveal,
  onDeleteMessage,
  expanded = false,
}: LiveChatPanelProps) {
  const [text, setText] = useState('');
  const [ttlKey, setTtlKey] = useState<MessageTtlKey>('2m');
  const [burnOnRead, setBurnOnRead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const check = validateMessageInput({ text, ttlKey });
    if (!check.valid) {
      setError(check.error ?? 'Invalid message.');
      return;
    }

    setError(null);
    setSending(true);
    try {
      await onSendMessage({
        text: text.trim(),
        ttlKey,
        burnOnRead,
        replyToStoryId: replyContext?.id,
        replyToHeadline: replyContext?.headline,
      });
      setText('');
      if (replyContext) onClearReplyContext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      aria-label={`Ephemeral chat in ${zone.name}`}
      className={`shader-panel rounded-2xl flex flex-col overflow-hidden ${
        expanded
          ? 'min-h-[580px] max-h-[78vh]'
          : 'h-[calc(100vh-11.5rem)] min-h-[480px] max-h-[640px] sticky top-20'
      }`}
    >
      {/* Discord-style Channel Header */}
      <div className="px-5 py-3.5 border-b border-sky-400/15 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-[#ECF7FA] truncate flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-teal-300 shrink-0" aria-hidden="true" />
              <span className="truncate">{zone.name}</span>
            </h2>
            <p className="text-xs text-[#8EB3C2] mt-0.5 truncate">
              {zone.neighborhood} ·{' '}
              <span className="tabular-nums">
                {Math.max(1, roomPeers.length)} {roomPeers.length === 1 ? 'person' : 'people'} here
              </span>
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-teal-300 shrink-0">
            Auto-burns
          </span>
        </div>

        {/* Live active people masks in this room with quick Add Friend */}
        {roomPeers.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5">
            {roomPeers.map((peer) => {
              const isMe = peer.uid === identity.id;
              const isFriend = friendUids?.has(peer.uid) ?? false;
              const isPending = pendingFriendUids?.has(peer.uid) ?? false;
              return (
                <div
                  key={peer.uid}
                  className="inline-flex items-center gap-1.5 text-[11px] text-[#9CC0CE] shrink-0 pr-1.5"
                >
                  <PersonaGlyph hue={peer.hue} size={18} />
                  <span className="truncate max-w-[105px]">
                    {isMe ? `${peer.handle} (You)` : peer.handle}
                  </span>
                  {!isMe && onQuickAddFriend && !isFriend && !isPending && (
                    <button
                      type="button"
                      onClick={() => onQuickAddFriend(peer)}
                      aria-label={`Add ${peer.handle} as friend`}
                      title={`Add ${peer.handle} as friend`}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-teal-400/15 hover:bg-teal-400/30 text-teal-300 cursor-pointer"
                    >
                      <UserPlus className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Messages Feed */}
      <div
        data-testid="chat-messages-list"
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#050C14]/55"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
            <Timer className="w-7 h-7 text-[#5F8496] mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#ECF7FA]">
              No live whispers in #{zone.name} yet
            </p>
            <p className="text-xs text-[#8EB3C2] mt-1 max-w-xs">
              Drop a self-destructing message or invite someone nearby to join {zone.name}.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.authorId === identity.id;
            const isHiddenBurn =
              msg.burnOnRead && !isOwn && !revealedMessageIds.has(msg.id);
            const progress = getExpiryProgress(msg.createdAtMs, msg.expiresAtMs, now);
            const myReactions = userReactionsMap[msg.id] ?? [];

            return (
              <article
                key={msg.id}
                data-testid={`chat-message-${msg.id}`}
                className={`rounded-xl border p-3.5 relative overflow-hidden transition-colors ${
                  isOwn
                    ? 'bg-[#0D2132]/90 border-teal-400/25 ml-4'
                    : 'bg-[#091623]/90 border-sky-400/15 mr-4'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <PersonaGlyph hue={msg.authorHue} size={22} />
                    <span className="text-xs font-semibold text-[#ECF7FA] truncate">
                      {isOwn ? `${msg.authorHandle} (You)` : msg.authorHandle}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-[#8EB3C2] shrink-0">
                    {msg.burnOnRead && (
                      <EyeOff className="w-3 h-3 text-teal-300" aria-hidden="true" />
                    )}
                    <span
                      className={
                        msg.expiresAtMs - now < 25_000
                          ? 'text-teal-300 font-semibold'
                          : ''
                      }
                    >
                      {formatRemainingTime(msg.expiresAtMs, now)}
                    </span>
                    {isOwn && (
                      <button
                        type="button"
                        onClick={() => onDeleteMessage(msg.id)}
                        aria-label="Delete your whisper"
                        className="p-0.5 text-[#6B90A0] hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                {msg.replyToHeadline && (
                  <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-[#050C14]/70 border border-sky-400/15 text-[11px] text-[#9CC0CE] truncate">
                    Re: {msg.replyToHeadline}
                  </div>
                )}

                {isHiddenBurn ? (
                  <div className="py-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-[#8EB3C2] italic">
                      Burn-on-read whisper hidden
                    </span>
                    <button
                      type="button"
                      onClick={() => onReveal(msg.id)}
                      className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-lg shader-btn-primary text-xs font-semibold whitespace-nowrap cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Reveal (15s burn)</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-[#E2F3F8] leading-relaxed break-words">
                      {msg.text}
                    </p>
                    {typeof msg.locationLat === 'number' &&
                      typeof msg.locationLng === 'number' &&
                      isValidCoordinates(msg.locationLat, msg.locationLng) && (() => {
                        const livePeer = msg.locationIsLive
                          ? peersByUid[msg.authorId]
                          : undefined;
                        const activeLat =
                          livePeer && livePeer.isLiveLocation
                            ? livePeer.lat
                            : msg.locationLat!;
                        const activeLng =
                          livePeer && livePeer.isLiveLocation
                            ? livePeer.lng
                            : msg.locationLng!;
                        const isLiveActive = Boolean(
                          msg.locationIsLive && livePeer?.isLiveLocation
                        );

                        return (
                          <button
                            type="button"
                            onClick={() =>
                              onViewLocationOnRadar?.({
                                lat: activeLat,
                                lng: activeLng,
                                label:
                                  msg.locationLabel ??
                                  `${msg.authorHandle}'s location`,
                                uid: isLiveActive ? msg.authorId : undefined,
                                kind: isLiveActive ? 'person' : 'pin',
                              })
                            }
                            className="w-full text-left px-3 py-2 rounded-lg bg-[#050C14]/85 border border-teal-400/25 hover:border-teal-300/55 flex items-center justify-between gap-2.5 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[11px] font-mono text-teal-300">
                                {isLiveActive ? (
                                  <>
                                    <Radio
                                      className="w-3 h-3 text-emerald-400 animate-pulse"
                                      aria-hidden="true"
                                    />
                                    <span className="text-emerald-300 font-semibold">
                                      LIVE GPS
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <MapPin className="w-3 h-3" aria-hidden="true" />
                                    <span>Pinned Spot</span>
                                  </>
                                )}
                              </div>
                              <div className="text-xs font-semibold text-[#ECF7FA] truncate">
                                {msg.locationLabel ?? `${msg.authorHandle}'s spot`}
                              </div>
                              <div className="text-[11px] font-mono text-[#8EB3C2] tabular-nums">
                                {formatCoordPair(activeLat, activeLng)}
                              </div>
                            </div>
                            <ArrowUpRight className="w-4 h-4 text-teal-300 shrink-0" aria-hidden="true" />
                          </button>
                        );
                      })()}
                  </div>
                )}

                {/* Reaction Bar */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1">
                  {REACTION_OPTIONS.map((opt) => {
                    const count = msg.reactionCounts[opt.key] ?? 0;
                    const reacted = myReactions.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => onReact(msg.id, opt.key)}
                        aria-label={`React ${opt.symbol} (${count})`}
                        aria-pressed={reacted}
                        className={`inline-flex items-center gap-1 min-h-[28px] px-2 py-0.5 rounded-lg text-xs tabular-nums transition-colors cursor-pointer ${
                          reacted
                            ? 'bg-teal-400/20 text-teal-200 font-semibold border border-teal-400/30'
                            : 'bg-[#050C14]/65 hover:bg-sky-400/15 text-[#9CC0CE]'
                        }`}
                      >
                        <span>{opt.symbol}</span>
                        {count > 0 && <span>{count}</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Hairline burn indicator */}
                <div
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-800"
                  aria-hidden="true"
                >
                  <div
                    className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-500"
                    style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
                  />
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Composer Controls */}
      <form
        onSubmit={handleSubmit}
        className="p-3.5 border-t border-sky-400/15 bg-[#07131E]/95 space-y-2.5"
      >
        {replyContext && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#050C14] border border-sky-400/20 text-xs text-[#CBE4EE]">
            <span className="truncate">
              Replying to: <strong>{replyContext.headline}</strong>
            </span>
            <button
              type="button"
              onClick={onClearReplyContext}
              aria-label="Clear story reply context"
              className="p-1 text-[#8EB3C2] hover:text-[#ECF7FA] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Message burn timer"
            className="flex items-center gap-1 p-0.5 bg-[#050C14] border border-sky-400/15 rounded-lg"
          >
            {MESSAGE_TTL_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setTtlKey(opt.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                  ttlKey === opt.key
                    ? 'bg-teal-400/20 text-teal-200 font-semibold'
                    : 'text-[#8EB3C2] hover:text-[#ECF7FA]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {onSendLocation && (
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setError(null);
                  setSending(true);
                  void onSendLocation({
                    ttlKey,
                    burnOnRead,
                    liveMode: false,
                  })
                    .catch((err) => {
                      setError(err instanceof Error ? err.message : 'Could not share location.');
                    })
                    .finally(() => setSending(false));
                }}
                title="Drop your current location pin in this room"
                className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 rounded-lg border border-sky-400/20 text-xs font-medium text-[#8EB3C2] hover:text-teal-200 hover:bg-sky-400/10 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-teal-300" aria-hidden="true" />
                <span>Pin Spot</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setBurnOnRead((prev) => !prev)}
              aria-pressed={burnOnRead}
              className={`inline-flex items-center gap-1.5 min-h-[30px] px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                burnOnRead
                  ? 'border-teal-400/40 bg-teal-400/15 text-teal-200'
                  : 'border-sky-400/20 text-[#8EB3C2] hover:bg-sky-400/10'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Burn on Read</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={`chat-input-${expanded ? 'full' : 'rail'}`} className="sr-only">
            Ephemeral message
          </label>
          <input
            id={`chat-input-${expanded ? 'full' : 'rail'}`}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Whisper in #${zone.name}...`}
            maxLength={280}
            className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-sky-400/20 bg-[#050C14]/90 text-sm text-[#ECF7FA] placeholder:text-[#5F8496] focus:outline-none focus:border-teal-400"
          />
          <button
            type="submit"
            disabled={sending}
            aria-label="Send ephemeral message"
            className="min-h-[44px] min-w-[44px] px-4 rounded-xl shader-btn-primary disabled:opacity-50 inline-flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>

        {error && (
          <p role="alert" className="text-xs text-rose-400 font-medium">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
