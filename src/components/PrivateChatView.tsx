import { useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  LogOut,
  MapPin,
  MessageCircle,
  Radio,
  Send,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  AnonymousIdentity,
  ChatMember,
  ChatRoom,
  EmojiKey,
  FocusedMapTarget,
  FriendSummary,
  PresenceUser,
  PrivateChatMessage,
  PrivateTtlKey,
} from '../types/drift.ts';
import {
  PRIVATE_TTL_OPTIONS,
  REACTION_OPTIONS,
  formatCoordPair,
  formatRemainingTime,
  getExpiryProgress,
  isValidCoordinates,
  validatePrivateMessageInput,
} from '../utils/ephemeral.ts';
import { PersonaGlyph } from './PersonaGlyph.tsx';

interface PrivateChatViewProps {
  chatRoom: ChatRoom;
  displayTitle: string;
  members: readonly ChatMember[];
  friends: readonly FriendSummary[];
  messages: readonly PrivateChatMessage[];
  peersByUid: Record<string, PresenceUser>;
  usingLiveGps: boolean;
  now: number;
  identity: AnonymousIdentity;
  userReactionsMap: Record<string, EmojiKey[]>;
  revealedMessageIds: Set<string>;
  onSendMessage: (payload: {
    text: string;
    ttlKey: PrivateTtlKey;
    burnOnRead: boolean;
  }) => Promise<void>;
  onSendLocation: (payload: {
    ttlKey: PrivateTtlKey;
    burnOnRead: boolean;
    liveMode: boolean;
  }) => Promise<void>;
  onViewLocationOnRadar: (target: FocusedMapTarget) => void;
  onReact: (messageId: string, emojiKey: EmojiKey) => void;
  onReveal: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onAddFriendToGroup: (friend: FriendSummary) => Promise<void>;
  onLeaveGroup: () => Promise<void>;
  onOpenStoryById: (storyId: string) => void;
}

export function PrivateChatView({
  chatRoom,
  displayTitle,
  members,
  friends,
  messages,
  peersByUid,
  usingLiveGps,
  now,
  identity,
  userReactionsMap,
  revealedMessageIds,
  onSendMessage,
  onSendLocation,
  onViewLocationOnRadar,
  onReact,
  onReveal,
  onDeleteMessage,
  onAddFriendToGroup,
  onLeaveGroup,
  onOpenStoryById,
}: PrivateChatViewProps) {
  const [text, setText] = useState('');
  const [ttlKey, setTtlKey] = useState<PrivateTtlKey>('forever');
  const [burnOnRead, setBurnOnRead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);

  const inviteableFriends = friends.filter(
    (f) => !chatRoom.memberIds.includes(f.uid)
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const check = validatePrivateMessageInput({ text, ttlKey });
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
      });
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const handleShareLocation = async (liveMode: boolean) => {
    setError(null);
    setSending(true);
    try {
      await onSendLocation({ ttlKey, burnOnRead, liveMode });
      setLocationMenuOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share location.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      aria-label={`Private conversation ${displayTitle}`}
      className="shader-panel rounded-2xl flex flex-col overflow-hidden h-[calc(100vh-11.5rem)] min-h-[500px]"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-sky-400/15 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500/25 to-emerald-500/25 border border-teal-400/30 flex items-center justify-center shrink-0">
              {chatRoom.kind === 'group' ? (
                <Users className="w-4 h-4 text-teal-300" aria-hidden="true" />
              ) : (
                <MessageCircle className="w-4 h-4 text-sky-300" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-[#ECF7FA] truncate">
                {displayTitle}
              </h2>
              <p className="text-xs text-[#8EB3C2] tabular-nums">
                {chatRoom.kind === 'group'
                  ? `Group chat · ${chatRoom.memberIds.length} members`
                  : 'Private 1-on-1 DM · End-to-rule protected'}
              </p>
            </div>
          </div>

          {chatRoom.kind === 'group' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInviteOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-lg border border-teal-400/25 bg-teal-400/10 hover:bg-teal-400/20 text-xs font-semibold text-teal-200 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Friend</span>
              </button>
              <button
                type="button"
                onClick={() => void onLeaveGroup()}
                aria-label="Leave group chat"
                className="inline-flex items-center gap-1 min-h-[34px] px-3 py-1 rounded-lg border border-sky-400/20 text-xs font-medium text-[#8EB3C2] hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Leave</span>
              </button>
            </div>
          )}
        </div>

        {/* Member avatars strip */}
        {members.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {members.map((m) => (
              <span
                key={m.uid}
                className="inline-flex items-center gap-1.5 text-[11px] text-[#9CC0CE] shrink-0 pr-2"
              >
                <PersonaGlyph hue={m.hue} size={18} />
                <span className="truncate max-w-[110px]">
                  {m.uid === identity.id ? `${m.handle} (You)` : m.handle}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Quick add friend to group drawer */}
        {inviteOpen && chatRoom.kind === 'group' && (
          <div className="shader-surface rounded-xl p-3 space-y-2">
            <div className="text-xs font-semibold text-[#ECF7FA]">
              Invite a friend into {displayTitle}
            </div>
            {inviteableFriends.length === 0 ? (
              <p className="text-xs text-[#8EB3C2]">
                All of your current friends are already in this group.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {inviteableFriends.map((f) => (
                  <button
                    key={f.uid}
                    type="button"
                    onClick={() => void onAddFriendToGroup(f)}
                    className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 py-1 rounded-lg border border-teal-400/30 bg-teal-500/10 hover:bg-teal-500/20 text-xs font-medium text-teal-200 cursor-pointer"
                  >
                    <PersonaGlyph hue={f.hue} size={18} />
                    <span>+ {f.handle}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#050C14]/55">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
            <MessageCircle className="w-8 h-8 text-[#5F8496] mb-2.5" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#ECF7FA]">
              Start chatting in {displayTitle}
            </p>
            <p className="text-xs text-[#8EB3C2] mt-1 max-w-xs">
              Send persistent messages or turn on a burn timer and Burn on Read for private
              ephemeral drops.
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
                className={`rounded-xl border p-3.5 relative overflow-hidden transition-colors ${
                  isOwn
                    ? 'bg-[#0D2132]/90 border-teal-400/25 ml-6'
                    : 'bg-[#091623]/90 border-sky-400/15 mr-6'
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
                        msg.expiresAtMs > 0 && msg.expiresAtMs - now < 25_000
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
                        aria-label="Delete your message"
                        className="p-0.5 text-[#6B90A0] hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                {msg.sharedStoryHeadline && msg.sharedStoryId && (
                  <button
                    type="button"
                    onClick={() => onOpenStoryById(msg.sharedStoryId!)}
                    className="mb-2 w-full text-left px-3 py-2 rounded-lg bg-[#050C14]/75 border border-sky-400/20 hover:border-teal-400/40 flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-teal-300">
                        Shared Story · {msg.sharedStoryZoneName ?? 'Nearby'}
                      </div>
                      <div className="text-xs font-semibold text-[#ECF7FA] truncate">
                        {msg.sharedStoryHeadline}
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-teal-300 shrink-0" aria-hidden="true" />
                  </button>
                )}

                {isHiddenBurn ? (
                  <div className="py-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-[#8EB3C2] italic">
                      Burn-on-read message hidden
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
                              onViewLocationOnRadar({
                                lat: activeLat,
                                lng: activeLng,
                                label:
                                  msg.locationLabel ??
                                  `${msg.authorHandle}'s location`,
                                uid: isLiveActive ? msg.authorId : undefined,
                                kind: isLiveActive ? 'person' : 'pin',
                              })
                            }
                            className="w-full text-left px-3 py-2.5 rounded-lg bg-[#050C14]/85 border border-teal-400/30 hover:border-teal-300/60 flex items-center justify-between gap-3 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[11px] font-mono text-teal-300">
                                {isLiveActive ? (
                                  <>
                                    <Radio
                                      className="w-3.5 h-3.5 text-emerald-400 animate-pulse"
                                      aria-hidden="true"
                                    />
                                    <span className="text-emerald-300 font-semibold">
                                      LIVE REAL-TIME LOCATION
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>
                                      {msg.locationIsLive
                                        ? 'Shared Live Pin'
                                        : 'Pinned Location'}
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="text-xs font-semibold text-[#ECF7FA] truncate mt-0.5">
                                {msg.locationLabel ?? `${msg.authorHandle}'s spot`}
                              </div>
                              <div className="text-[11px] font-mono text-[#8EB3C2] tabular-nums">
                                {formatCoordPair(activeLat, activeLng)}
                              </div>
                            </div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-400/15 text-teal-200 text-[11px] font-semibold shrink-0">
                              <span>Open Radar</span>
                              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                            </span>
                          </button>
                        );
                      })()}
                  </div>
                )}

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

                {msg.expiresAtMs > 0 && (
                  <div className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-800" aria-hidden="true">
                    <div
                      className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-500"
                      style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
                    />
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-3.5 border-t border-sky-400/15 bg-[#07131E]/95 space-y-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Private message timer"
            className="flex items-center gap-1 p-0.5 bg-[#050C14] rounded-lg border border-sky-400/15"
          >
            {PRIVATE_TTL_OPTIONS.map((opt) => (
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocationMenuOpen((prev) => !prev)}
              aria-expanded={locationMenuOpen}
              className={`inline-flex items-center gap-1.5 min-h-[30px] px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                locationMenuOpen || usingLiveGps
                  ? 'border-teal-400/40 bg-teal-400/15 text-teal-200'
                  : 'border-sky-400/20 text-[#8EB3C2] hover:bg-sky-400/10'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Share Location</span>
            </button>

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

        {locationMenuOpen && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#050C14]/90 border border-teal-400/25">
            <span className="text-xs text-[#9CC0CE]">
              Send your exact spot or stream live GPS updates to {displayTitle}:
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => void handleShareLocation(false)}
                className="inline-flex items-center gap-1.5 min-h-[30px] px-2.5 py-1 rounded-lg border border-sky-400/30 bg-sky-500/15 hover:bg-sky-500/25 text-xs font-semibold text-sky-200 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Send Current Pin</span>
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void handleShareLocation(true)}
                className="inline-flex items-center gap-1.5 min-h-[30px] px-2.5 py-1 rounded-lg border border-emerald-400/40 bg-emerald-500/20 hover:bg-emerald-500/30 text-xs font-semibold text-emerald-200 cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Share Live GPS</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <label htmlFor="private-chat-input" className="sr-only">
            Message {displayTitle}
          </label>
          <input
            id="private-chat-input"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Message ${displayTitle}...`}
            maxLength={400}
            className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-sky-400/20 bg-[#050C14]/90 text-sm text-[#ECF7FA] placeholder:text-[#5F8496] focus:outline-none focus:border-teal-400"
          />
          <button
            type="submit"
            disabled={sending}
            aria-label="Send private message"
            className="min-h-[44px] min-w-[44px] px-4 rounded-xl shader-btn-primary disabled:opacity-50 inline-flex items-center justify-center gap-1.5 text-sm font-semibold cursor-pointer shrink-0"
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
