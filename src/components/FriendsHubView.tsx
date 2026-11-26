import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  MessageCircle,
  Search,
  Share2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  AnonymousIdentity,
  FriendRequest,
  FriendSummary,
  PresenceUser,
  PublicDirectoryUser,
} from '../types/drift.ts';
import { findUsersByQuery } from '../services/driftFirestore.ts';
import { PersonaGlyph } from './PersonaGlyph.tsx';

interface FriendsHubViewProps {
  identity: AnonymousIdentity;
  initialFriendCode?: string;
  friends: readonly FriendSummary[];
  incomingRequests: readonly FriendRequest[];
  outgoingRequests: readonly FriendRequest[];
  nearbyPeers: readonly PresenceUser[];
  onSendFriendRequest: (target: {
    uid: string;
    handle: string;
    hue: number;
  }) => Promise<void>;
  onAcceptRequest: (req: FriendRequest) => Promise<void>;
  onDeclineOrCancelRequest: (requestId: string) => Promise<void>;
  onRemoveFriend: (friendshipId: string) => Promise<void>;
  onOpenDirectChat: (friend: FriendSummary) => Promise<void>;
  onOpenCreateGroup: () => void;
}

export function FriendsHubView({
  identity,
  initialFriendCode,
  friends,
  incomingRequests,
  outgoingRequests,
  nearbyPeers,
  onSendFriendRequest,
  onAcceptRequest,
  onDeclineOrCancelRequest,
  onRemoveFriend,
  onOpenDirectChat,
  onOpenCreateGroup,
}: FriendsHubViewProps) {
  const [searchInput, setSearchInput] = useState(initialFriendCode ?? '');
  const [searchResults, setSearchResults] = useState<PublicDirectoryUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  useEffect(() => {
    if (initialFriendCode) {
      setSearchInput(initialFriendCode);
    }
  }, [initialFriendCode]);

  const friendUidSet = new Set(friends.map((f) => f.uid));
  const pendingUidSet = new Set([
    ...incomingRequests.map((r) => r.fromUid),
    ...outgoingRequests.map((r) => r.toUid),
  ]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed.length < 2) {
      setError('Enter a friend code (like ABCD-2345) or anonymous handle.');
      return;
    }
    setError(null);
    setStatusMessage(null);
    setSearching(true);
    try {
      const results = await findUsersByQuery(trimmed, identity.id);
      setSearchResults(results);
      if (results.length === 0) {
        setStatusMessage('No matching Drift users found yet. Double-check the friend code.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleAddTarget = async (target: {
    uid: string;
    handle: string;
    hue: number;
  }) => {
    setError(null);
    setStatusMessage(null);
    try {
      await onSendFriendRequest(target);
      setStatusMessage(`Friend request sent to ${target.handle}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send friend request.');
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(identity.friendCode);
    } catch {
      // Ignore
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleCopyInviteLink = async () => {
    const url = `${window.location.origin}/?add=${encodeURIComponent(identity.friendCode)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.history.replaceState(null, '', `?add=${encodeURIComponent(identity.friendCode)}`);
    }
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 1800);
  };

  const discoverablePeers = nearbyPeers.filter((p) => p.uid !== identity.id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 5 cols: Share Code + Find Friends */}
      <div className="lg:col-span-5 space-y-5">
        <section className="shader-panel rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#ECF7FA]">
              Your Friend Code
            </h2>
            <p className="text-xs text-[#8EB3C2] mt-1">
              Share this code or invite link with real-life friends to unlock private DMs and
              group chats without revealing your email.
            </p>
          </div>

          <div className="shader-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <span className="font-mono text-lg font-semibold tracking-wider text-teal-300 tabular-nums">
              {identity.friendCode}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg border border-sky-400/20 hover:bg-sky-400/10 text-xs font-semibold text-[#ECF7FA] cursor-pointer"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleCopyInviteLink()}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg shader-btn-primary text-xs font-semibold cursor-pointer"
              >
                {copiedInvite ? (
                  <>
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Link Copied</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Invite Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        <section className="shader-panel rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#ECF7FA]">
              Add a Friend
            </h2>
            <p className="text-xs text-[#8EB3C2] mt-1">
              Look up someone by their 8-character Friend Code or anonymous handle.
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <label htmlFor="friend-search-input" className="sr-only">
              Friend code or handle
            </label>
            <input
              id="friend-search-input"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Enter friend code (e.g. ABCD-2345) or handle..."
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-sky-400/20 bg-[#050C14]/80 text-sm text-[#ECF7FA] placeholder:text-[#5F8496] focus:outline-none focus:border-teal-400"
            />
            <button
              type="submit"
              disabled={searching}
              aria-label="Search for friend"
              className="min-h-[44px] px-4 rounded-xl shader-btn-primary disabled:opacity-60 inline-flex items-center gap-1.5 text-sm font-semibold cursor-pointer shrink-0"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
              <span>{searching ? 'Finding...' : 'Find'}</span>
            </button>
          </form>

          {error && (
            <p role="alert" className="text-xs text-rose-400 font-medium">
              {error}
            </p>
          )}
          {statusMessage && (
            <p className="text-xs text-teal-300 font-medium">{statusMessage}</p>
          )}

          {searchResults.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-sky-400/15">
              {searchResults.map((person) => {
                const isFriend = friendUidSet.has(person.uid);
                const isPending = pendingUidSet.has(person.uid);
                return (
                  <div
                    key={person.uid}
                    className="shader-surface rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PersonaGlyph hue={person.hue} size={32} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#ECF7FA] truncate">
                          {person.handle}
                        </div>
                        <div className="text-[11px] font-mono text-[#7FA6B7]">
                          {person.friendCode}
                        </div>
                      </div>
                    </div>

                    {isFriend ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                        <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Friends</span>
                      </span>
                    ) : isPending ? (
                      <span className="text-xs font-medium text-[#8EB3C2]">Pending</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleAddTarget(person)}
                        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg shader-btn-primary text-xs font-semibold cursor-pointer shrink-0"
                      >
                        <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Add</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {discoverablePeers.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-sky-400/15">
              <div className="text-xs font-semibold text-[#8EB3C2]">
                People Active Nearby
              </div>
              <div className="space-y-2">
                {discoverablePeers.slice(0, 6).map((peer) => {
                  const isFriend = friendUidSet.has(peer.uid);
                  const isPending = pendingUidSet.has(peer.uid);
                  return (
                    <div
                      key={peer.uid}
                      className="shader-surface rounded-xl px-3.5 py-2 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PersonaGlyph hue={peer.hue} size={28} />
                        <span className="text-xs font-semibold text-[#ECF7FA] truncate">
                          {peer.handle}
                        </span>
                      </div>
                      {isFriend ? (
                        <span className="text-xs text-emerald-300">Friend</span>
                      ) : isPending ? (
                        <span className="text-xs text-[#8EB3C2]">Pending</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleAddTarget(peer)}
                          className="inline-flex items-center gap-1 min-h-[32px] px-2.5 py-1 rounded-lg border border-teal-400/30 text-teal-300 hover:bg-teal-400/10 text-xs font-semibold cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Add Friend</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Right 7 cols: Friend Requests + Friends List + Group Chat Action */}
      <div className="lg:col-span-7 space-y-5">
        {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
          <section className="shader-panel rounded-2xl p-5 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#ECF7FA]">
              Pending Requests ({incomingRequests.length + outgoingRequests.length})
            </h2>

            <div className="space-y-2.5">
              {incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="shader-surface rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PersonaGlyph hue={req.fromHue} size={34} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#ECF7FA] truncate">
                        {req.fromHandle}
                      </div>
                      <div className="text-xs text-[#8EB3C2]">
                        Wants to connect on Drift
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void onAcceptRequest(req)}
                      className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 rounded-lg shader-btn-primary text-xs font-semibold cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Accept</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeclineOrCancelRequest(req.id)}
                      className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg border border-sky-400/20 text-[#8EB3C2] hover:text-rose-300 hover:bg-rose-500/10 text-xs font-medium cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              ))}

              {outgoingRequests.map((req) => (
                <div
                  key={req.id}
                  className="shader-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PersonaGlyph hue={req.toHue} size={32} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#ECF7FA] truncate">
                        {req.toHandle}
                      </div>
                      <div className="text-xs text-[#8EB3C2]">Request sent · Waiting</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onDeclineOrCancelRequest(req.id)}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-sky-400/20 text-xs text-[#8EB3C2] hover:text-rose-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="shader-panel rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#ECF7FA]">
                Your Friends ({friends.length})
              </h2>
              <p className="text-xs text-[#8EB3C2] mt-0.5">
                Start a 1-on-1 private chat or combine friends into a group chat.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenCreateGroup}
              disabled={friends.length === 0}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 rounded-xl shader-btn-primary disabled:opacity-45 text-xs font-semibold cursor-pointer"
            >
              <Users className="w-4 h-4" aria-hidden="true" />
              <span>New Group Chat</span>
            </button>
          </div>

          {friends.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Users className="w-8 h-8 text-[#5F8496] mx-auto" aria-hidden="true" />
              <p className="text-sm font-semibold text-[#ECF7FA]">No friends added yet</p>
              <p className="text-xs text-[#8EB3C2] max-w-sm mx-auto">
                Copy your Friend Code or invite link on the left and send it to a friend to
                start private DMs and group chats.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {friends.map((friend) => (
                <div
                  key={friend.uid}
                  className="shader-surface rounded-xl p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PersonaGlyph hue={friend.hue} size={34} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#ECF7FA] truncate">
                        {friend.handle}
                      </div>
                      <div className="text-[11px] text-[#7FA6B7]">Verified friend</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void onOpenDirectChat(friend)}
                      aria-label={`Private chat with ${friend.handle}`}
                      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/25 text-xs font-semibold text-sky-200 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>DM</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onRemoveFriend(friend.friendshipId)}
                      aria-label={`Remove ${friend.handle} from friends`}
                      title="Remove friend"
                      className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-[#7FA6B7] hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <UserMinus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
