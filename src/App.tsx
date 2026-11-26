import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Flame,
  Loader2,
  MessageCircle,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase.ts';
import {
  acceptFriendRequest,
  addFriendToGroupChat,
  addStoryReply,
  cleanupExpiredOwnItems,
  createCustomZone,
  createGroupChat,
  declineOrCancelFriendRequest,
  deleteOwnMessage,
  deleteOwnPrivateMessage,
  deleteOwnStory,
  incrementStoryShare,
  leaveGroupChat,
  openOrCreateDirectChat,
  publishStory,
  removeFriendship,
  removePresence,
  revealBurnMessage,
  revealPrivateBurnMessage,
  rotateUserMask,
  sendEphemeralMessage,
  sendFriendRequest,
  sendPrivateChatMessage,
  syncUserProfile,
  toggleMessageReaction,
  togglePrivateMessageReaction,
  toggleStoryBoost,
  upsertPresence,
} from './services/driftFirestore.ts';
import type {
  AnonymousIdentity,
  ChatMember,
  ChatRoom,
  EmojiKey,
  EphemeralMessage,
  FocusedMapTarget,
  FriendRequest,
  FriendSummary,
  LocationStory,
  LocationZone,
  MessageTtlKey,
  NavSection,
  PresenceUser,
  PrivateChatMessage,
  PrivateTtlKey,
  StoryTtlKey,
  StoryVibe,
  UserChatRef,
  ZoneId,
} from './types/drift.ts';
import {
  DEFAULT_ZONES,
  STORY_VIBES,
  calculateDistanceKm,
  filterItemsByRadius,
  isExpired,
  normalizeFriendCode,
  sortStoriesViral,
} from './utils/ephemeral.ts';
import { OperationType, handleFirestoreError } from './utils/firestoreErrors.ts';
import { AuthLanding } from './components/AuthLanding.tsx';
import { CreateGroupModal } from './components/CreateGroupModal.tsx';
import { CreateZoneModal } from './components/CreateZoneModal.tsx';
import { DiscordSidebar } from './components/DiscordSidebar.tsx';
import { DropStoryModal } from './components/DropStoryModal.tsx';
import { FriendsHubView } from './components/FriendsHubView.tsx';
import { LiveChatPanel } from './components/LiveChatPanel.tsx';
import { PrivateChatView } from './components/PrivateChatView.tsx';
import { PulseBriefView } from './components/PulseBriefView.tsx';
import { RadarView } from './components/RadarView.tsx';
import { ShaderBackdrop } from './components/ShaderBackdrop.tsx';
import { ShareStoryToChatModal } from './components/ShareStoryToChatModal.tsx';
import { StoryCard } from './components/StoryCard.tsx';
import { StoryStrip } from './components/StoryStrip.tsx';
import { StoryViewerModal } from './components/StoryViewerModal.tsx';
import { TopNav } from './components/TopNav.tsx';
import { WorkspaceBar } from './components/WorkspaceBar.tsx';

const PRESENCE_STALE_MS = 5 * 60 * 1000;

function readInitialZoneId(): ZoneId {
  try {
    const params = new URLSearchParams(window.location.search);
    const z = params.get('zone')?.trim();
    if (z && /^[a-zA-Z0-9_-]{2,64}$/.test(z)) {
      return z;
    }
  } catch {
    // Ignore URL parsing issues
  }
  return DEFAULT_ZONES[0].id;
}

function readInitialFriendCode(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const add = params.get('add')?.trim();
    if (add && add.length >= 4) {
      return normalizeFriendCode(add);
    }
  } catch {
    // Ignore URL parsing issues
  }
  return '';
}

function readInitialStoryId(): string | null {
  try {
    const hash = window.location.hash;
    if (hash.startsWith('#story=')) {
      const id = hash.slice('#story='.length).trim();
      return id || null;
    }
  } catch {
    // Ignore hash parsing issues
  }
  return null;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<AnonymousIdentity | null>(null);

  const [initialFriendCode] = useState<string>(readInitialFriendCode);
  const [activeSection, setActiveSection] = useState<NavSection>(() =>
    readInitialFriendCode() ? 'friends' : 'feed'
  );
  const [selectedZoneId, setSelectedZoneId] = useState<ZoneId>(readInitialZoneId);
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [vibeFilter, setVibeFilter] = useState<'All' | StoryVibe>('All');
  const [zoneScopeOnly, setZoneScopeOnly] = useState<boolean>(false);

  const [gpsCoords, setGpsCoords] = useState<{
    lat: number;
    lng: number;
    accuracyMeters?: number;
  } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const gpsWatchIdRef = useRef<number | null>(null);
  const lastGpsUpdateMsRef = useRef<number>(0);

  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? ''
  );
  const [mapsKeyLoaded, setMapsKeyLoaded] = useState<boolean>(() =>
    Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
  );
  const [focusedMapTarget, setFocusedMapTarget] = useState<FocusedMapTarget | null>(null);

  const [customZones, setCustomZones] = useState<LocationZone[]>([]);
  const [stories, setStories] = useState<LocationStory[]>([]);
  const [messages, setMessages] = useState<EphemeralMessage[]>([]);
  const [peers, setPeers] = useState<PresenceUser[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [boostedStoryIds, setBoostedStoryIds] = useState<Set<string>>(() => new Set());
  const [userReactionsMap, setUserReactionsMap] = useState<Record<string, EmojiKey[]>>({});
  const [revealedMessageIds, setRevealedMessageIds] = useState<Set<string>>(() => new Set());

  // Friends, DMs & Group Chats State
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [chatRefs, setChatRefs] = useState<UserChatRef[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatRoom, setActiveChatRoom] = useState<ChatRoom | null>(null);
  const [activeChatMembers, setActiveChatMembers] = useState<ChatMember[]>([]);
  const [privateMessages, setPrivateMessages] = useState<PrivateChatMessage[]>([]);
  const [privateReactionsMap, setPrivateReactionsMap] = useState<Record<string, EmojiKey[]>>({});
  const [revealedPrivateIds, setRevealedPrivateIds] = useState<Set<string>>(() => new Set());
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  const [now, setNow] = useState(() => Date.now());
  const [composerOpen, setComposerOpen] = useState(false);
  const [createZoneOpen, setCreateZoneOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [shareModalStory, setShareModalStory] = useState<LocationStory | null>(null);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(readInitialStoryId);
  const [replyContext, setReplyContext] = useState<LocationStory | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastNotice(msg);
    window.setTimeout(() => {
      setToastNotice((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Load runtime Google Maps configuration and attach Case A quota listener
  useEffect(() => {
    let active = true;
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);

    fetch('/api/client-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { mapsApiKey?: string } | null) => {
        if (!active) return;
        if (data && typeof data.mapsApiKey === 'string' && data.mapsApiKey.trim()) {
          setMapsApiKey(data.mapsApiKey.trim());
        }
        setMapsKeyLoaded(true);
      })
      .catch(() => {
        if (active) setMapsKeyLoaded(true);
      });

    return () => {
      active = false;
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  // Clean up any active geolocation watcher on unmount
  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
    };
  }, []);

  // Live 1-second tick for deterministic countdowns
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Firebase Auth listener + anonymous mask sync
  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;
      setUser(nextUser);
      if (!nextUser) {
        setIdentity(null);
        setCustomZones([]);
        setStories([]);
        setMessages([]);
        setPeers([]);
        setBoostedStoryIds(new Set());
        setUserReactionsMap({});
        setRevealedMessageIds(new Set());
        setFriendRequests([]);
        setFriends([]);
        setChatRefs([]);
        setActiveChatId(null);
        setActiveChatRoom(null);
        setActiveChatMembers([]);
        setPrivateMessages([]);
        setPrivateReactionsMap({});
        setRevealedPrivateIds(new Set());
        setDataLoading(false);
        setAuthReady(true);
        return;
      }

      setDataLoading(true);
      try {
        const synced = await syncUserProfile(nextUser);
        if (active) {
          setIdentity(synced);
          setAuthError(null);
        }
      } catch (err) {
        if (active) {
          setAuthError(
            err instanceof Error ? err.message : 'Unable to initialize your anonymous mask.'
          );
        }
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Real-time Firestore collections (only active while signed in)
  useEffect(() => {
    if (!user) return;

    let loadedZones = false;
    let loadedStories = false;
    let loadedMessages = false;
    const checkLoaded = () => {
      if (loadedZones && loadedStories && loadedMessages) {
        setDataLoading(false);
      }
    };

    const unsubZones = onSnapshot(
      query(collection(db, 'zones'), where('visibility', '==', 'public')),
      (snapshot) => {
        const next: LocationZone[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          next.push({
            id: docSnap.id,
            name: String(d.name ?? 'Local Room'),
            neighborhood: String(d.neighborhood ?? 'Nearby'),
            lat: Number(d.lat ?? 37.76),
            lng: Number(d.lng ?? -122.42),
            activeCount: 0,
            isCustom: true,
          });
        });
        setCustomZones(next);
        loadedZones = true;
        checkLoaded();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'zones');
      }
    );

    const unsubPresence = onSnapshot(
      query(collection(db, 'presence'), where('visibility', '==', 'public')),
      (snapshot) => {
        const next: PresenceUser[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          next.push({
            uid: String(d.uid ?? docSnap.id),
            handle: String(d.handle ?? 'Neighbor'),
            hue: Number(d.hue ?? 198),
            zoneId: String(d.zoneId ?? DEFAULT_ZONES[0].id),
            lat: Number(d.lat ?? 37.76),
            lng: Number(d.lng ?? -122.42),
            isLiveLocation: Boolean(d.isLiveLocation),
            accuracyMeters:
              typeof d.accuracyMeters === 'number' ? d.accuracyMeters : undefined,
            lastSeenMs: Number(d.lastSeenMs ?? 0),
          });
        });
        setPeers(next);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'presence');
      }
    );

    const unsubStories = onSnapshot(
      query(collection(db, 'stories'), where('visibility', '==', 'public')),
      (snapshot) => {
        const next: LocationStory[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          next.push({
            id: docSnap.id,
            zoneId: String(d.zoneId ?? DEFAULT_ZONES[0].id),
            zoneName: String(d.zoneName ?? 'Local Spot'),
            lat: Number(d.lat ?? 37.76),
            lng: Number(d.lng ?? -122.42),
            authorId: String(d.authorId ?? ''),
            authorHandle: String(d.authorHandle ?? 'Neighbor'),
            authorHue: Number(d.authorHue ?? 198),
            headline: String(d.headline ?? ''),
            caption: String(d.caption ?? ''),
            imageUrl: typeof d.imageUrl === 'string' ? d.imageUrl : undefined,
            vibe: (d.vibe as StoryVibe) ?? 'Happening Now',
            createdAtMs: Number(d.createdAtMs ?? 0),
            expiresAtMs: Number(d.expiresAtMs ?? 0),
            boostCount: Number(d.boostCount ?? 0),
            shareCount: Number(d.shareCount ?? 0),
            replyCount: Number(d.replyCount ?? 0),
          });
        });
        setStories(next);
        loadedStories = true;
        checkLoaded();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'stories');
      }
    );

    const unsubMessages = onSnapshot(
      query(collection(db, 'messages'), where('visibility', '==', 'zone')),
      (snapshot) => {
        const next: EphemeralMessage[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const rawCounts = (d.reactionCounts ?? {}) as Record<string, unknown>;
          next.push({
            id: docSnap.id,
            zoneId: String(d.zoneId ?? DEFAULT_ZONES[0].id),
            authorId: String(d.authorId ?? ''),
            authorHandle: String(d.authorHandle ?? 'Neighbor'),
            authorHue: Number(d.authorHue ?? 198),
            text: String(d.text ?? ''),
            createdAtMs: Number(d.createdAtMs ?? 0),
            expiresAtMs: Number(d.expiresAtMs ?? 0),
            ttlKey: (d.ttlKey as MessageTtlKey) ?? '2m',
            burnOnRead: Boolean(d.burnOnRead),
            reactionCounts: {
              fire: Number(rawCounts.fire ?? 0),
              eyes: Number(rawCounts.eyes ?? 0),
              hundred: Number(rawCounts.hundred ?? 0),
              bolt: Number(rawCounts.bolt ?? 0),
            },
            replyToStoryId:
              typeof d.replyToStoryId === 'string' ? d.replyToStoryId : undefined,
            replyToHeadline:
              typeof d.replyToHeadline === 'string' ? d.replyToHeadline : undefined,
            locationLat:
              typeof d.locationLat === 'number' ? d.locationLat : undefined,
            locationLng:
              typeof d.locationLng === 'number' ? d.locationLng : undefined,
            locationLabel:
              typeof d.locationLabel === 'string' ? d.locationLabel : undefined,
            locationIsLive:
              typeof d.locationIsLive === 'boolean' ? d.locationIsLive : undefined,
          });
        });
        setMessages(next);
        loadedMessages = true;
        checkLoaded();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'messages');
      }
    );

    const unsubRequests = onSnapshot(
      query(collection(db, 'friendRequests'), where('participants', 'array-contains', user.uid)),
      (snapshot) => {
        const next: FriendRequest[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          next.push({
            id: docSnap.id,
            fromUid: String(d.fromUid ?? ''),
            fromHandle: String(d.fromHandle ?? 'Neighbor'),
            fromHue: Number(d.fromHue ?? 188),
            toUid: String(d.toUid ?? ''),
            toHandle: String(d.toHandle ?? 'Neighbor'),
            toHue: Number(d.toHue ?? 188),
            participants: Array.isArray(d.participants) ? d.participants.map(String) : [],
            status: (d.status as FriendRequest['status']) ?? 'pending',
            createdAtMs: Number(d.createdAtMs ?? 0),
          });
        });
        setFriendRequests(next);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'friendRequests');
      }
    );

    const unsubFriendships = onSnapshot(
      query(collection(db, 'friendships'), where('participants', 'array-contains', user.uid)),
      (snapshot) => {
        const next: FriendSummary[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const uidA = String(d.uidA ?? '');
          const uidB = String(d.uidB ?? '');
          const amA = uidA === user.uid;
          next.push({
            friendshipId: docSnap.id,
            uid: amA ? uidB : uidA,
            handle: String(amA ? d.handleB ?? 'Friend' : d.handleA ?? 'Friend'),
            hue: Number(amA ? d.hueB ?? 188 : d.hueA ?? 188),
          });
        });
        next.sort((a, b) => a.handle.localeCompare(b.handle));
        setFriends(next);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'friendships');
      }
    );

    const unsubChatRefs = onSnapshot(
      query(collection(db, 'users', user.uid, 'chatRefs'), where('uid', '==', user.uid)),
      (snapshot) => {
        const next: UserChatRef[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          next.push({
            chatId: docSnap.id,
            uid: String(d.uid ?? user.uid),
            kind: d.kind === 'group' ? 'group' : 'dm',
            title: String(d.title ?? 'Private Chat'),
            peerUid: typeof d.peerUid === 'string' ? d.peerUid : undefined,
            peerHandle: typeof d.peerHandle === 'string' ? d.peerHandle : undefined,
            peerHue: typeof d.peerHue === 'number' ? d.peerHue : undefined,
            lastMessageText: typeof d.lastMessageText === 'string' ? d.lastMessageText : undefined,
            lastMessageAtMs: Number(d.lastMessageAtMs ?? 0),
          });
        });
        next.sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs);
        setChatRefs(next);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/chatRefs`);
      }
    );

    return () => {
      unsubZones();
      unsubPresence();
      unsubStories();
      unsubMessages();
      unsubRequests();
      unsubFriendships();
      unsubChatRefs();
    };
  }, [user]);

  // Real-time listeners for the currently selected DM or Group Chat
  useEffect(() => {
    if (!user || !activeChatId) {
      setActiveChatRoom(null);
      setActiveChatMembers([]);
      setPrivateMessages([]);
      setPrivateReactionsMap({});
      setRevealedPrivateIds(new Set());
      return;
    }

    const unsubRoom = onSnapshot(
      doc(db, 'chats', activeChatId),
      (snap) => {
        if (!snap.exists()) {
          setActiveChatRoom(null);
          return;
        }
        const d = snap.data();
        setActiveChatRoom({
          id: snap.id,
          kind: d.kind === 'group' ? 'group' : 'dm',
          name: String(d.name ?? 'Chat'),
          createdBy: String(d.createdBy ?? ''),
          memberIds: Array.isArray(d.memberIds) ? d.memberIds.map(String) : [],
          lastMessageText: typeof d.lastMessageText === 'string' ? d.lastMessageText : undefined,
          lastMessageAtMs: Number(d.lastMessageAtMs ?? 0),
        });
      },
      () => {
        // User may have just left this chat
        setActiveChatRoom(null);
      }
    );

    const unsubMembers = onSnapshot(
      query(
        collection(db, 'chats', activeChatId, 'members'),
        where('visibleTo', 'array-contains', user.uid)
      ),
      (snapshot) => {
        const next: ChatMember[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          next.push({
            uid: String(d.uid ?? docSnap.id),
            chatId: String(d.chatId ?? activeChatId),
            handle: String(d.handle ?? 'Member'),
            hue: Number(d.hue ?? 188),
            role: d.role === 'owner' ? 'owner' : 'member',
            visibleTo: Array.isArray(d.visibleTo) ? d.visibleTo.map(String) : [],
          });
        });
        setActiveChatMembers(next);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `chats/${activeChatId}/members`);
      }
    );

    const unsubMsgs = onSnapshot(
      query(
        collection(db, 'chats', activeChatId, 'messages'),
        where('memberIds', 'array-contains', user.uid)
      ),
      (snapshot) => {
        const next: PrivateChatMessage[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const rawCounts = (d.reactionCounts ?? {}) as Record<string, unknown>;
          next.push({
            id: docSnap.id,
            chatId: String(d.chatId ?? activeChatId),
            authorId: String(d.authorId ?? ''),
            authorHandle: String(d.authorHandle ?? 'Friend'),
            authorHue: Number(d.authorHue ?? 188),
            text: String(d.text ?? ''),
            ttlKey: (d.ttlKey as PrivateTtlKey) ?? 'forever',
            burnOnRead: Boolean(d.burnOnRead),
            memberIds: Array.isArray(d.memberIds) ? d.memberIds.map(String) : [],
            createdAtMs: Number(d.createdAtMs ?? 0),
            expiresAtMs: Number(d.expiresAtMs ?? 0),
            reactionCounts: {
              fire: Number(rawCounts.fire ?? 0),
              eyes: Number(rawCounts.eyes ?? 0),
              hundred: Number(rawCounts.hundred ?? 0),
              bolt: Number(rawCounts.bolt ?? 0),
            },
            sharedStoryId:
              typeof d.sharedStoryId === 'string' ? d.sharedStoryId : undefined,
            sharedStoryHeadline:
              typeof d.sharedStoryHeadline === 'string' ? d.sharedStoryHeadline : undefined,
            sharedStoryZoneName:
              typeof d.sharedStoryZoneName === 'string' ? d.sharedStoryZoneName : undefined,
            locationLat:
              typeof d.locationLat === 'number' ? d.locationLat : undefined,
            locationLng:
              typeof d.locationLng === 'number' ? d.locationLng : undefined,
            locationLabel:
              typeof d.locationLabel === 'string' ? d.locationLabel : undefined,
            locationIsLive:
              typeof d.locationIsLive === 'boolean' ? d.locationIsLive : undefined,
          });
        });
        next.sort((a, b) => a.createdAtMs - b.createdAtMs);
        setPrivateMessages(next);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `chats/${activeChatId}/messages`);
      }
    );

    return () => {
      unsubRoom();
      unsubMembers();
      unsubMsgs();
    };
  }, [user, activeChatId]);

  // Select first chat automatically if user navigates to DMs & Groups without one selected
  useEffect(() => {
    if (activeSection === 'messages' && !activeChatId && chatRefs.length > 0) {
      setActiveChatId(chatRefs[0].chatId);
    }
  }, [activeSection, activeChatId, chatRefs]);

  const activePeers = useMemo(
    () => peers.filter((p) => now - p.lastSeenMs <= PRESENCE_STALE_MS),
    [peers, now]
  );

  const incomingRequests = useMemo(
    () =>
      user
        ? friendRequests.filter((r) => r.status === 'pending' && r.toUid === user.uid)
        : [],
    [friendRequests, user]
  );

  const outgoingRequests = useMemo(
    () =>
      user
        ? friendRequests.filter((r) => r.status === 'pending' && r.fromUid === user.uid)
        : [],
    [friendRequests, user]
  );

  const friendUids = useMemo(() => new Set(friends.map((f) => f.uid)), [friends]);
  const pendingFriendUids = useMemo(
    () =>
      new Set([
        ...incomingRequests.map((r) => r.fromUid),
        ...outgoingRequests.map((r) => r.toUid),
      ]),
    [incomingRequests, outgoingRequests]
  );

  const zones = useMemo<LocationZone[]>(() => {
    const merged = new Map<string, LocationZone>();
    for (const z of DEFAULT_ZONES) {
      merged.set(z.id, { ...z, activeCount: 0, isCustom: false });
    }
    for (const cz of customZones) {
      merged.set(cz.id, { ...cz, activeCount: 0, isCustom: true });
    }
    for (const peer of activePeers) {
      const target = merged.get(peer.zoneId);
      if (target) {
        target.activeCount += 1;
      }
    }
    return Array.from(merged.values());
  }, [customZones, activePeers]);

  const selectedZone = useMemo(
    () => zones.find((z) => z.id === selectedZoneId) ?? zones[0],
    [zones, selectedZoneId]
  );

  const anchorCoords = useMemo(() => {
    if (gpsCoords) return gpsCoords;
    return { lat: selectedZone.lat, lng: selectedZone.lng };
  }, [gpsCoords, selectedZone]);

  const peersByUid = useMemo(() => {
    const map: Record<string, PresenceUser> = {};
    for (const peer of activePeers) {
      map[peer.uid] = peer;
    }
    return map;
  }, [activePeers]);

  // Publish & heartbeat live user presence while signed in
  useEffect(() => {
    if (!user || !identity) return;

    const sendHeartbeat = () => {
      void upsertPresence({
        uid: user.uid,
        handle: identity.handle,
        hue: identity.hue,
        zoneId: selectedZone.id,
        lat: anchorCoords.lat,
        lng: anchorCoords.lng,
        isLiveLocation: Boolean(gpsCoords),
        accuracyMeters: gpsCoords?.accuracyMeters,
      });
    };

    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 20_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [
    user,
    identity,
    selectedZone.id,
    anchorCoords.lat,
    anchorCoords.lng,
    gpsCoords,
  ]);

  // Active non-expired stories
  const activeStories = useMemo(
    () => stories.filter((s) => !isExpired(s.expiresAtMs, now)),
    [stories, now]
  );

  const liveStories = useMemo(() => {
    const ranked = sortStoriesViral(activeStories, now);
    const withinRadius = filterItemsByRadius(
      ranked,
      anchorCoords.lat,
      anchorCoords.lng,
      radiusKm
    );
    return withinRadius.filter((s) => {
      if (zoneScopeOnly && s.zoneId !== selectedZone.id) return false;
      if (vibeFilter !== 'All' && s.vibe !== vibeFilter) return false;
      return true;
    });
  }, [activeStories, now, anchorCoords, radiusKm, zoneScopeOnly, selectedZone.id, vibeFilter]);

  const liveZoneMessages = useMemo(
    () =>
      messages
        .filter((m) => m.zoneId === selectedZone.id && !isExpired(m.expiresAtMs, now))
        .slice()
        .sort((a, b) => a.createdAtMs - b.createdAtMs),
    [messages, selectedZone.id, now]
  );

  const livePrivateMessages = useMemo(
    () => privateMessages.filter((m) => !isExpired(m.expiresAtMs, now)),
    [privateMessages, now]
  );

  const activeStoryIdsKey = useMemo(
    () => activeStories.map((s) => s.id).slice(0, 40).join(','),
    [activeStories]
  );

  // Sync user's own boost markers for currently active stories
  useEffect(() => {
    if (!user || !activeStoryIdsKey) {
      setBoostedStoryIds(new Set());
      return;
    }

    const ids = activeStoryIdsKey.split(',').filter(Boolean);
    const unsubs = ids.map((storyId) =>
      onSnapshot(
        doc(db, 'stories', storyId, 'boosts', user.uid),
        (snap) => {
          setBoostedStoryIds((prev) => {
            const has = prev.has(storyId);
            if (snap.exists() === has) return prev;
            const next = new Set(prev);
            if (snap.exists()) next.add(storyId);
            else next.delete(storyId);
            return next;
          });
        },
        (error) => {
          handleFirestoreError(
            error,
            OperationType.GET,
            `stories/${storyId}/boosts/${user.uid}`
          );
        }
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user, activeStoryIdsKey]);

  const liveZoneMessageIdsKey = useMemo(
    () => liveZoneMessages.map((m) => m.id).slice(0, 40).join(','),
    [liveZoneMessages]
  );

  // Sync user's own reaction & burn-reveal markers for active zone messages
  useEffect(() => {
    if (!user || !liveZoneMessageIdsKey) {
      setUserReactionsMap({});
      setRevealedMessageIds(new Set());
      return;
    }

    const ids = liveZoneMessageIdsKey.split(',').filter(Boolean);
    const unsubs: (() => void)[] = [];

    for (const msgId of ids) {
      unsubs.push(
        onSnapshot(
          doc(db, 'messages', msgId, 'reactions', user.uid),
          (snap) => {
            const emojis = snap.exists()
              ? ((snap.data().emojis ?? []) as EmojiKey[])
              : [];
            setUserReactionsMap((prev) => ({ ...prev, [msgId]: emojis }));
          },
          (error) => {
            handleFirestoreError(
              error,
              OperationType.GET,
              `messages/${msgId}/reactions/${user.uid}`
            );
          }
        )
      );
      unsubs.push(
        onSnapshot(
          doc(db, 'messages', msgId, 'reveals', user.uid),
          (snap) => {
            setRevealedMessageIds((prev) => {
              const has = prev.has(msgId);
              if (snap.exists() === has) return prev;
              const next = new Set(prev);
              if (snap.exists()) next.add(msgId);
              else next.delete(msgId);
              return next;
            });
          },
          (error) => {
            handleFirestoreError(
              error,
              OperationType.GET,
              `messages/${msgId}/reveals/${user.uid}`
            );
          }
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user, liveZoneMessageIdsKey]);

  const livePrivateMessageIdsKey = useMemo(
    () => livePrivateMessages.map((m) => m.id).slice(0, 40).join(','),
    [livePrivateMessages]
  );

  // Sync user's own reaction & burn-reveal markers for active DM/Group messages
  useEffect(() => {
    if (!user || !activeChatId || !livePrivateMessageIdsKey) {
      setPrivateReactionsMap({});
      setRevealedPrivateIds(new Set());
      return;
    }

    const ids = livePrivateMessageIdsKey.split(',').filter(Boolean);
    const unsubs: (() => void)[] = [];

    for (const msgId of ids) {
      unsubs.push(
        onSnapshot(
          doc(db, 'chats', activeChatId, 'messages', msgId, 'reactions', user.uid),
          (snap) => {
            const emojis = snap.exists()
              ? ((snap.data().emojis ?? []) as EmojiKey[])
              : [];
            setPrivateReactionsMap((prev) => ({ ...prev, [msgId]: emojis }));
          },
          (error) => {
            handleFirestoreError(
              error,
              OperationType.GET,
              `chats/${activeChatId}/messages/${msgId}/reactions/${user.uid}`
            );
          }
        )
      );
      unsubs.push(
        onSnapshot(
          doc(db, 'chats', activeChatId, 'messages', msgId, 'reveals', user.uid),
          (snap) => {
            setRevealedPrivateIds((prev) => {
              const has = prev.has(msgId);
              if (snap.exists() === has) return prev;
              const next = new Set(prev);
              if (snap.exists()) next.add(msgId);
              else next.delete(msgId);
              return next;
            });
          },
          (error) => {
            handleFirestoreError(
              error,
              OperationType.GET,
              `chats/${activeChatId}/messages/${msgId}/reveals/${user.uid}`
            );
          }
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user, activeChatId, livePrivateMessageIdsKey]);

  // Periodically delete expired stories/messages authored by this user
  useEffect(() => {
    if (!user) return;
    const expiredOwnStories = stories
      .filter((s) => s.authorId === user.uid && isExpired(s.expiresAtMs, now))
      .map((s) => s.id);
    const expiredOwnMessages = messages
      .filter((m) => m.authorId === user.uid && isExpired(m.expiresAtMs, now))
      .map((m) => m.id);

    if (expiredOwnStories.length > 0 || expiredOwnMessages.length > 0) {
      void cleanupExpiredOwnItems(expiredOwnStories, expiredOwnMessages);
    }

    if (activeChatId) {
      const expiredOwnPrivate = privateMessages
        .filter(
          (m) =>
            m.authorId === user.uid &&
            m.expiresAtMs > 0 &&
            isExpired(m.expiresAtMs, now)
        )
        .slice(0, 5);
      for (const m of expiredOwnPrivate) {
        void deleteOwnPrivateMessage(activeChatId, m.id);
      }
    }
  }, [user, stories, messages, privateMessages, activeChatId, now]);

  // Close active story modal if it expires while open
  useEffect(() => {
    if (!activeStoryId) return;
    const found = stories.find((s) => s.id === activeStoryId);
    if (found && isExpired(found.expiresAtMs, now)) {
      setActiveStoryId(null);
    }
  }, [activeStoryId, stories, now]);

  const handleSignInWithGoogle = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Google sign-in window was closed before finishing.');
      } else if (msg.includes('popup-blocked')) {
        setAuthError('Please allow popups for this preview to sign in with Google.');
      } else {
        setAuthError(msg);
      }
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const stopLiveGps = useCallback(() => {
    if (gpsWatchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setGpsCoords(null);
    setGpsLoading(false);
    setGpsError(null);
  }, []);

  const startLiveGps = useCallback((): Promise<{
    lat: number;
    lng: number;
    accuracyMeters?: number;
  }> => {
    if (!navigator.geolocation) {
      const msg = 'Geolocation is not supported in this browser.';
      setGpsError(msg);
      return Promise.reject(new Error(msg));
    }
    setGpsLoading(true);
    setGpsError(null);

    return new Promise((resolve, reject) => {
      let settled = false;
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const nextCoords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyMeters: Number.isFinite(pos.coords.accuracy)
              ? Math.round(pos.coords.accuracy)
              : undefined,
          };
          const nowTs = Date.now();
          if (!settled || nowTs - lastGpsUpdateMsRef.current >= 5000) {
            lastGpsUpdateMsRef.current = nowTs;
            setGpsCoords(nextCoords);
          }
          setGpsLoading(false);
          setGpsError(null);
          if (!settled) {
            settled = true;
            resolve(nextCoords);
          }
        },
        () => {
          setGpsLoading(false);
          const msg =
            'Location permission denied — allow browser location access for real-time GPS.';
          setGpsError(msg);
          if (gpsWatchIdRef.current !== null) {
            navigator.geolocation.clearWatch(gpsWatchIdRef.current);
            gpsWatchIdRef.current = null;
          }
          if (!settled) {
            settled = true;
            reject(new Error(msg));
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
      gpsWatchIdRef.current = watchId;
    });
  }, []);

  const handleSignOut = useCallback(async () => {
    stopLiveGps();
    if (user) {
      await removePresence(user.uid);
    }
    await signOut(auth);
  }, [stopLiveGps, user]);

  const handleSelectZone = (zoneId: ZoneId) => {
    setSelectedZoneId(zoneId);
    setActiveChatId(null);
    setActiveSection('feed');
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setActiveSection('messages');
  };

  const handleToggleLiveGps = () => {
    if (gpsCoords || gpsWatchIdRef.current !== null) {
      stopLiveGps();
      showToast('Paused Live GPS broadcast');
      return;
    }
    void startLiveGps()
      .then(() => {
        showToast('Live GPS enabled on Radar');
      })
      .catch(() => {
        // Error surfaced in gpsError banner
      });
  };

  const handleRotateIdentity = async () => {
    if (!user || !identity) return;
    const next = await rotateUserMask(user.uid, identity.friendCode);
    setIdentity(next);
    showToast(`Switched mask to ${next.handle}`);
  };

  const handleCreateZone = async (payload: {
    name: string;
    neighborhood: string;
    lat: number;
    lng: number;
  }) => {
    if (!user) return;
    const created = await createCustomZone({
      ...payload,
      createdBy: user.uid,
    });
    setSelectedZoneId(created.id);
    setActiveChatId(null);
    setActiveSection('feed');
  };

  const handlePublishStory = async (payload: {
    zoneId: ZoneId;
    headline: string;
    caption: string;
    vibe: StoryVibe;
    ttlKey: StoryTtlKey;
    imageUrl?: string;
  }) => {
    if (!user || !identity) return;
    const targetZone = zones.find((z) => z.id === payload.zoneId) ?? selectedZone;
    const storyLat =
      gpsCoords && payload.zoneId === selectedZone.id ? gpsCoords.lat : targetZone.lat;
    const storyLng =
      gpsCoords && payload.zoneId === selectedZone.id ? gpsCoords.lng : targetZone.lng;

    await publishStory({
      zoneId: targetZone.id,
      zoneName: targetZone.name,
      lat: storyLat,
      lng: storyLng,
      authorId: user.uid,
      authorHandle: identity.handle,
      authorHue: identity.hue,
      headline: payload.headline,
      caption: payload.caption,
      vibe: payload.vibe,
      ttlKey: payload.ttlKey,
      imageUrl: payload.imageUrl,
    });
    setSelectedZoneId(targetZone.id);
    setActiveSection('feed');
  };

  const handleBoostStory = (storyId: string) => {
    if (!user) return;
    void toggleStoryBoost(storyId, user.uid);
  };

  const handleCopyStoryLink = (story: LocationStory) => {
    const shareUrl = `${window.location.origin}/?zone=${encodeURIComponent(
      story.zoneId
    )}#story=${encodeURIComponent(story.id)}`;
    try {
      void navigator.clipboard.writeText(shareUrl);
    } catch {
      window.history.replaceState(null, '', `#story=${encodeURIComponent(story.id)}`);
    }
    void incrementStoryShare(story.id);
  };

  const handleForwardStoryToChat = async (
    story: LocationStory,
    chatId: string,
    note: string
  ) => {
    if (!identity) return;
    const refSnap = chatRefs.find((c) => c.chatId === chatId);
    const roomMembers = refSnap?.peerUid ? [identity.id, refSnap.peerUid] : [identity.id];
    const roomStub: ChatRoom =
      activeChatRoom && activeChatRoom.id === chatId
        ? activeChatRoom
        : {
            id: chatId,
            kind: refSnap?.kind ?? 'dm',
            name: refSnap?.title ?? 'Private Chat',
            createdBy: identity.id,
            memberIds: roomMembers,
            lastMessageAtMs: Date.now(),
          };

    // If forwarding to a group that isn't currently loaded, use getDoc inside a minimal lookup via members or read chats doc
    if (!activeChatRoom || activeChatRoom.id !== chatId) {
      const { getDoc: getFirestoreDoc } = await import('firebase/firestore');
      const snap = await getFirestoreDoc(doc(db, 'chats', chatId));
      if (snap.exists()) {
        const d = snap.data();
        roomStub.kind = d.kind === 'group' ? 'group' : 'dm';
        roomStub.name = String(d.name ?? roomStub.name);
        roomStub.createdBy = String(d.createdBy ?? roomStub.createdBy);
        roomStub.memberIds = Array.isArray(d.memberIds)
          ? d.memberIds.map(String)
          : roomStub.memberIds;
      }
    }

    await sendPrivateChatMessage({
      chatRoom: roomStub,
      author: identity,
      text: note,
      ttlKey: 'forever',
      burnOnRead: false,
      sharedStoryId: story.id,
      sharedStoryHeadline: story.headline,
      sharedStoryZoneName: story.zoneName,
    });
    void incrementStoryShare(story.id);
    showToast(`Sent story to ${roomStub.name}`);
  };

  const handleReplyToStory = async (story: LocationStory, text: string) => {
    if (!user || !identity) return;
    await addStoryReply({
      storyId: story.id,
      authorId: user.uid,
      authorHandle: identity.handle,
      authorHue: identity.hue,
      text,
      storyExpiresAtMs: story.expiresAtMs,
    });
  };

  const handleDeleteStory = (storyId: string) => {
    void deleteOwnStory(storyId);
    if (activeStoryId === storyId) {
      setActiveStoryId(null);
    }
  };

  const handleSendMessage = async (payload: {
    text: string;
    ttlKey: MessageTtlKey;
    burnOnRead: boolean;
    replyToStoryId?: string;
    replyToHeadline?: string;
  }) => {
    if (!user || !identity) return;
    await sendEphemeralMessage({
      zoneId: selectedZone.id,
      authorId: user.uid,
      authorHandle: identity.handle,
      authorHue: identity.hue,
      text: payload.text,
      ttlKey: payload.ttlKey,
      burnOnRead: payload.burnOnRead,
      replyToStoryId: payload.replyToStoryId,
      replyToHeadline: payload.replyToHeadline,
    });
  };

  const handleSendZoneLocation = async (payload: {
    ttlKey: MessageTtlKey;
    burnOnRead: boolean;
    liveMode: boolean;
  }) => {
    if (!user || !identity) return;
    const coords = payload.liveMode
      ? await startLiveGps()
      : gpsCoords ?? { lat: selectedZone.lat, lng: selectedZone.lng };
    const isRealGps = Boolean(payload.liveMode || gpsCoords);
    const label = isRealGps
      ? `${selectedZone.name} · Exact GPS`
      : `${selectedZone.name} Hub`;

    await sendEphemeralMessage({
      zoneId: selectedZone.id,
      authorId: user.uid,
      authorHandle: identity.handle,
      authorHue: identity.hue,
      text: payload.liveMode
        ? 'Sharing my real-time location in this room.'
        : isRealGps
          ? 'Dropped my exact location pin.'
          : `Pinned ${selectedZone.name} hub coordinates.`,
      ttlKey: payload.ttlKey,
      burnOnRead: payload.burnOnRead,
      location: {
        lat: coords.lat,
        lng: coords.lng,
        label,
        isLive: payload.liveMode,
      },
    });
    showToast('Location pin dropped in room');
  };

  const handleReactMessage = (messageId: string, emojiKey: EmojiKey) => {
    if (!user) return;
    void toggleMessageReaction(messageId, user.uid, emojiKey);
  };

  const handleRevealMessage = (messageId: string) => {
    if (!user) return;
    void revealBurnMessage(messageId, user.uid);
  };

  const handleDeleteMessage = (messageId: string) => {
    void deleteOwnMessage(messageId);
  };

  // Friend & Private Chat Handlers
  const handleSendFriendRequest = async (target: {
    uid: string;
    handle: string;
    hue: number;
  }) => {
    if (!identity) return;
    await sendFriendRequest(identity, target);
    showToast(`Friend request sent to ${target.handle}`);
  };

  const handleAcceptRequest = async (req: FriendRequest) => {
    await acceptFriendRequest(req);
    showToast(`You and ${req.fromHandle} are now friends`);
  };

  const handleDeclineOrCancelRequest = async (requestId: string) => {
    await declineOrCancelFriendRequest(requestId);
  };

  const handleRemoveFriend = async (friendshipId: string) => {
    await removeFriendship(friendshipId);
    showToast('Friend removed');
  };

  const handleOpenDirectChat = async (friend: FriendSummary) => {
    if (!identity) return;
    const chatId = await openOrCreateDirectChat(identity, friend);
    setActiveChatId(chatId);
    setActiveSection('messages');
  };

  const handleOpenDirectChatByUid = async (uid: string) => {
    const found = friends.find((f) => f.uid === uid);
    if (!found) {
      showToast('Accept a friend request first to open a private DM.');
      return;
    }
    await handleOpenDirectChat(found);
  };

  const handleViewLocationOnRadar = (target: FocusedMapTarget) => {
    setFocusedMapTarget(target);
    setActiveSection('radar');
  };

  const handleCreateGroupChat = async (name: string, selectedFriends: FriendSummary[]) => {
    if (!identity) return;
    const chatId = await createGroupChat(identity, name, selectedFriends);
    setActiveChatId(chatId);
    setActiveSection('messages');
    showToast(`Created group "${name}"`);
  };

  const handleSendPrivateMessage = async (payload: {
    text: string;
    ttlKey: PrivateTtlKey;
    burnOnRead: boolean;
  }) => {
    if (!identity || !activeChatRoom) return;
    await sendPrivateChatMessage({
      chatRoom: activeChatRoom,
      author: identity,
      text: payload.text,
      ttlKey: payload.ttlKey,
      burnOnRead: payload.burnOnRead,
    });
  };

  const handleSendPrivateLocation = async (payload: {
    ttlKey: PrivateTtlKey;
    burnOnRead: boolean;
    liveMode: boolean;
  }) => {
    if (!identity || !activeChatRoom) return;
    const coords = payload.liveMode
      ? await startLiveGps()
      : gpsCoords ?? { lat: selectedZone.lat, lng: selectedZone.lng };
    const isRealGps = Boolean(payload.liveMode || gpsCoords);
    const label = payload.liveMode
      ? `${identity.handle} · Live GPS`
      : isRealGps
        ? `${selectedZone.name} · Exact Pin`
        : `${selectedZone.name} Hub`;

    await sendPrivateChatMessage({
      chatRoom: activeChatRoom,
      author: identity,
      text: payload.liveMode
        ? 'Sharing my real-time GPS location with you.'
        : isRealGps
          ? 'Shared my current GPS pin.'
          : `Pinned ${selectedZone.name} hub coordinates.`,
      ttlKey: payload.ttlKey,
      burnOnRead: payload.burnOnRead,
      location: {
        lat: coords.lat,
        lng: coords.lng,
        label,
        isLive: payload.liveMode,
      },
    });
    showToast(
      payload.liveMode ? 'Live real-time location shared in chat' : 'Location pin sent'
    );
  };

  const handleReactPrivateMessage = (messageId: string, emojiKey: EmojiKey) => {
    if (!user || !activeChatRoom) return;
    void togglePrivateMessageReaction(activeChatRoom.id, messageId, user.uid, emojiKey);
  };

  const handleRevealPrivateMessage = (messageId: string) => {
    if (!user || !activeChatRoom) return;
    void revealPrivateBurnMessage(activeChatRoom.id, messageId, user.uid);
  };

  const handleDeletePrivateMessage = (messageId: string) => {
    if (!activeChatRoom) return;
    void deleteOwnPrivateMessage(activeChatRoom.id, messageId);
  };

  const handleAddFriendToGroup = async (friend: FriendSummary) => {
    if (!activeChatRoom) return;
    await addFriendToGroupChat(activeChatRoom, activeChatMembers, friend);
    showToast(`Added ${friend.handle} to ${activeChatRoom.name}`);
  };

  const handleLeaveGroup = async () => {
    if (!user || !activeChatRoom) return;
    const leftName = activeChatRoom.name;
    await leaveGroupChat(activeChatRoom, user.uid);
    setActiveChatId(null);
    setActiveChatRoom(null);
    showToast(`Left ${leftName}`);
  };

  const roomPeers = useMemo(
    () => activePeers.filter((p) => p.zoneId === selectedZone.id),
    [activePeers, selectedZone.id]
  );

  const activeStory = useMemo(
    () => activeStories.find((s) => s.id === activeStoryId) ?? null,
    [activeStories, activeStoryId]
  );

  const activeChatRef = useMemo(
    () => chatRefs.find((c) => c.chatId === activeChatId) ?? null,
    [chatRefs, activeChatId]
  );

  const quotaBanner = mapsQuotaExceeded ? (
    <div
      role="alert"
      data-testid="maps-quota-banner"
      className="sticky top-0 z-50 w-full bg-amber-950/95 border-b border-amber-400/50 px-4 py-2.5 text-xs text-amber-100 flex flex-wrap items-center justify-center gap-2 backdrop-blur-md"
    >
      <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
      <span>
        Google Maps demo quota exceeded for today. Upgrade or supply your own project API key to
        restore full map tiles.
      </span>
      <a
        href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
        target="_blank"
        rel="noreferrer"
        className="font-semibold underline text-amber-300 hover:text-amber-200"
      >
        Resolve Quota Issue
      </a>
    </div>
  ) : null;

  if (!authReady) {
    return (
      <div className="min-h-screen relative isolate bg-[#050C14] flex flex-col text-[#ECF7FA]">
        {quotaBanner}
        <ShaderBackdrop />
        <div className="relative z-10 flex-1 flex items-center justify-center gap-2.5 text-sm font-medium text-[#CBE4EE]">
          <Loader2 className="w-4 h-4 animate-spin text-teal-300" aria-hidden="true" />
          <span>Connecting to Drift...</span>
        </div>
      </div>
    );
  }

  if (!user || !identity) {
    return (
      <div className="min-h-screen flex flex-col">
        {quotaBanner}
        <AuthLanding
          loading={authLoading}
          error={authError}
          onSignInWithGoogle={() => void handleSignInWithGoogle()}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative isolate flex flex-col pb-20 md:pb-10 text-[#ECF7FA]">
      <ShaderBackdrop />
      <div className="relative z-10 flex flex-col flex-1">
      {quotaBanner}
      <TopNav
        activeSection={activeSection}
        onSelectSection={(sec) => {
          setActiveSection(sec);
          if (sec !== 'messages') {
            setActiveChatId(null);
          }
        }}
        onOpenComposer={() => setComposerOpen(true)}
        pendingRequestCount={incomingRequests.length}
      />

      <WorkspaceBar
        zones={zones}
        selectedZoneId={selectedZone.id}
        onSelectZone={handleSelectZone}
        radiusKm={radiusKm}
        onSelectRadius={setRadiusKm}
        usingGps={Boolean(gpsCoords)}
        gpsLoading={gpsLoading}
        gpsError={gpsError}
        onRequestGps={handleToggleLiveGps}
        onOpenCreateZone={() => setCreateZoneOpen(true)}
        identity={identity}
        onRotateIdentity={() => void handleRotateIdentity()}
        onSignOut={() => void handleSignOut()}
        onlineCount={Math.max(1, activePeers.length)}
      />

      {toastNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-40 px-4 py-2.5 rounded-xl shader-panel border-teal-400/35 text-xs font-semibold text-teal-200 shadow-lg"
        >
          {toastNotice}
        </div>
      )}

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Discord-Style Navigation Rail */}
        <div className="hidden lg:block lg:col-span-3">
          <DiscordSidebar
            identity={identity}
            zones={zones}
            selectedZoneId={selectedZone.id}
            chatRefs={chatRefs}
            activeChatId={activeSection === 'messages' ? activeChatId : null}
            pendingRequestCount={incomingRequests.length}
            onSelectZone={handleSelectZone}
            onSelectChat={handleSelectChat}
            onOpenCreateZone={() => setCreateZoneOpen(true)}
            onOpenCreateGroup={() => setCreateGroupOpen(true)}
            onOpenFriends={() => setActiveSection('friends')}
            onRotateIdentity={() => void handleRotateIdentity()}
            onSignOut={() => void handleSignOut()}
          />
        </div>

        {/* Center/Right Hybrid Workspace */}
        <div className="lg:col-span-9 min-w-0">
          {activeSection === 'feed' && (
            <>
              <StoryStrip
                stories={liveStories}
                now={now}
                onSelectStory={(story) => setActiveStoryId(story.id)}
              />

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* Viral Location Story Feed */}
                <div className="xl:col-span-7 space-y-5">
                  <div className="flex items-center justify-between gap-2.5">
                    <div
                      role="group"
                      aria-label="Filter stories by vibe"
                      className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 min-w-0 py-0.5"
                    >
                      <button
                        type="button"
                        onClick={() => setVibeFilter('All')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          vibeFilter === 'All'
                            ? 'bg-teal-400/20 text-teal-200 border border-teal-400/35 font-semibold'
                            : 'bg-[#081522]/80 border border-sky-400/15 text-[#8EB3C2] hover:text-[#ECF7FA]'
                        }`}
                      >
                        All Vibes
                      </button>
                      {STORY_VIBES.map((vibe) => (
                        <button
                          key={vibe}
                          type="button"
                          onClick={() => setVibeFilter(vibe)}
                          className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                            vibeFilter === vibe
                              ? 'bg-teal-400/20 text-teal-200 border border-teal-400/35 font-semibold'
                              : 'bg-[#081522]/80 border border-sky-400/15 text-[#8EB3C2] hover:text-[#ECF7FA]'
                          }`}
                        >
                          {vibe}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setZoneScopeOnly((prev) => !prev)}
                      aria-pressed={zoneScopeOnly}
                      className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        zoneScopeOnly
                          ? 'border-teal-400/35 bg-teal-400/20 text-teal-200'
                          : 'border-sky-400/15 bg-[#081522]/80 text-[#8EB3C2] hover:text-[#ECF7FA]'
                      }`}
                    >
                      {zoneScopeOnly ? `${selectedZone.name} Only` : `Within ${radiusKm} km`}
                    </button>
                  </div>

                  {dataLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {[1, 2, 3, 4].map((idx) => (
                        <div
                          key={idx}
                          className="h-72 rounded-2xl shader-panel animate-pulse"
                        />
                      ))}
                    </div>
                  ) : liveStories.length === 0 ? (
                    <div className="shader-panel rounded-2xl p-10 text-center">
                      <Flame className="w-8 h-8 text-teal-300/70 mx-auto mb-3" aria-hidden="true" />
                      <h3 className="font-display text-lg font-bold text-[#ECF7FA]">
                        No active stories nearby yet
                      </h3>
                      <p className="text-sm text-[#8EB3C2] mt-1 max-w-md mx-auto">
                        Be the first person in {selectedZone.name} to drop a live story, or expand
                        your discovery radius.
                      </p>
                      <button
                        type="button"
                        onClick={() => setComposerOpen(true)}
                        className="mt-5 inline-flex items-center gap-1.5 min-h-[42px] px-5 py-2 rounded-xl shader-btn-primary text-sm font-semibold cursor-pointer"
                      >
                        <Plus className="w-4 h-4" aria-hidden="true" />
                        <span>Drop First Story</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      data-testid="stories-grid"
                      className="grid grid-cols-1 md:grid-cols-2 gap-5"
                    >
                      {liveStories.map((story) => (
                        <StoryCard
                          key={story.id}
                          story={story}
                          distanceKm={story.distanceKm}
                          now={now}
                          currentUid={user.uid}
                          isBoosted={boostedStoryIds.has(story.id)}
                          onOpenStory={(s) => setActiveStoryId(s.id)}
                          onBoost={handleBoostStory}
                          onShare={(s) => setShareModalStory(s)}
                          onReplyInChat={(s) => {
                            setSelectedZoneId(s.zoneId);
                            setReplyContext(s);
                            document
                              .getElementById('chat-input-rail')
                              ?.focus({ preventScroll: false });
                          }}
                          onDeleteStory={handleDeleteStory}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Real-Time #Neighborhood Channel */}
                <div className="xl:col-span-5">
                  <LiveChatPanel
                    zone={selectedZone}
                    messages={liveZoneMessages}
                    roomPeers={roomPeers}
                    peersByUid={peersByUid}
                    now={now}
                    identity={identity}
                    userReactionsMap={userReactionsMap}
                    revealedMessageIds={revealedMessageIds}
                    replyContext={replyContext}
                    friendUids={friendUids}
                    pendingFriendUids={pendingFriendUids}
                    onQuickAddFriend={(peer) => void handleSendFriendRequest(peer)}
                    onClearReplyContext={() => setReplyContext(null)}
                    onSendMessage={handleSendMessage}
                    onSendLocation={handleSendZoneLocation}
                    onViewLocationOnRadar={handleViewLocationOnRadar}
                    onReact={handleReactMessage}
                    onReveal={handleRevealMessage}
                    onDeleteMessage={handleDeleteMessage}
                  />
                </div>
              </div>
            </>
          )}

          {activeSection === 'messages' && (
            <div className="space-y-4">
              {/* Mobile & Quick Thread Switcher */}
              <div className="shader-panel rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 min-w-0">
                  {chatRefs.map((chat) => {
                    const isActive = activeChatId === chat.chatId;
                    return (
                      <button
                        key={chat.chatId}
                        type="button"
                        onClick={() => setActiveChatId(chat.chatId)}
                        className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-teal-400/20 text-teal-200 border border-teal-400/35'
                            : 'bg-[#050C14]/75 border border-sky-400/15 text-[#8EB3C2] hover:text-[#ECF7FA]'
                        }`}
                      >
                        {chat.kind === 'group' ? (
                          <Users className="w-3.5 h-3.5 text-teal-300" aria-hidden="true" />
                        ) : (
                          <MessageCircle className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
                        )}
                        <span>{chat.title}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveSection('friends')}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border border-sky-400/20 text-xs font-medium text-[#CBE4EE] hover:bg-sky-400/10 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-teal-300" aria-hidden="true" />
                    <span>Friends</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateGroupOpen(true)}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl shader-btn-primary text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>New Group</span>
                  </button>
                </div>
              </div>

              {activeChatRoom ? (
                <PrivateChatView
                  chatRoom={activeChatRoom}
                  displayTitle={activeChatRef?.title ?? activeChatRoom.name}
                  members={activeChatMembers}
                  friends={friends}
                  messages={livePrivateMessages}
                  peersByUid={peersByUid}
                  usingLiveGps={Boolean(gpsCoords)}
                  now={now}
                  identity={identity}
                  userReactionsMap={privateReactionsMap}
                  revealedMessageIds={revealedPrivateIds}
                  onSendMessage={handleSendPrivateMessage}
                  onSendLocation={handleSendPrivateLocation}
                  onViewLocationOnRadar={handleViewLocationOnRadar}
                  onReact={handleReactPrivateMessage}
                  onReveal={handleRevealPrivateMessage}
                  onDeleteMessage={handleDeletePrivateMessage}
                  onAddFriendToGroup={handleAddFriendToGroup}
                  onLeaveGroup={handleLeaveGroup}
                  onOpenStoryById={(storyId) => {
                    const found = activeStories.find((s) => s.id === storyId);
                    if (found) setActiveStoryId(found.id);
                    else showToast('That neighborhood story has already expired.');
                  }}
                />
              ) : (
                <div className="shader-panel rounded-2xl p-10 text-center space-y-3">
                  <MessageCircle className="w-9 h-9 text-teal-300/75 mx-auto" aria-hidden="true" />
                  <h2 className="font-display text-xl font-bold text-[#ECF7FA]">
                    Private 1-on-1 DMs & Group Chats
                  </h2>
                  <p className="text-sm text-[#8EB3C2] max-w-md mx-auto">
                    Add real-life friends with your Friend Code in the Friends tab, then start a
                    private DM or build a group chat with your crew.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveSection('friends')}
                      className="inline-flex items-center gap-1.5 min-h-[42px] px-5 py-2 rounded-xl shader-btn-primary text-sm font-semibold cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" aria-hidden="true" />
                      <span>Open Friends Hub</span>
                    </button>
                    {friends.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCreateGroupOpen(true)}
                        className="inline-flex items-center gap-1.5 min-h-[42px] px-5 py-2 rounded-xl border border-sky-400/25 text-sm font-semibold text-[#ECF7FA] hover:bg-sky-400/10 cursor-pointer"
                      >
                        <Users className="w-4 h-4 text-teal-300" aria-hidden="true" />
                        <span>New Group Chat</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === 'friends' && (
            <FriendsHubView
              identity={identity}
              initialFriendCode={initialFriendCode}
              friends={friends}
              incomingRequests={incomingRequests}
              outgoingRequests={outgoingRequests}
              nearbyPeers={activePeers}
              onSendFriendRequest={handleSendFriendRequest}
              onAcceptRequest={handleAcceptRequest}
              onDeclineOrCancelRequest={handleDeclineOrCancelRequest}
              onRemoveFriend={handleRemoveFriend}
              onOpenDirectChat={handleOpenDirectChat}
              onOpenCreateGroup={() => setCreateGroupOpen(true)}
            />
          )}

          {activeSection === 'radar' && (
            <RadarView
              mapsApiKey={mapsApiKey}
              mapsKeyLoaded={mapsKeyLoaded}
              centerLat={anchorCoords.lat}
              centerLng={anchorCoords.lng}
              radiusKm={radiusKm}
              zones={zones}
              selectedZoneId={selectedZone.id}
              stories={liveStories}
              peers={activePeers}
              currentUid={user.uid}
              friendUids={friendUids}
              pendingFriendUids={pendingFriendUids}
              usingLiveGps={Boolean(gpsCoords)}
              gpsLoading={gpsLoading}
              gpsError={gpsError}
              focusedTarget={focusedMapTarget}
              now={now}
              onSelectZone={(zId) => handleSelectZone(zId)}
              onOpenStory={(story) => setActiveStoryId(story.id)}
              onToggleLiveGps={handleToggleLiveGps}
              onQuickAddFriend={(peer) => void handleSendFriendRequest(peer)}
              onOpenDirectChatByUid={(uid) => void handleOpenDirectChatByUid(uid)}
              onClearFocusedTarget={() => setFocusedMapTarget(null)}
            />
          )}

          {activeSection === 'pulse' && (
            <PulseBriefView
              zones={zones}
              selectedZoneId={selectedZone.id}
              stories={activeStories}
              messages={messages.filter((m) => !isExpired(m.expiresAtMs, now))}
              onOpenStoryById={(storyId) => {
                const found = activeStories.find((s) => s.id === storyId);
                if (found) setActiveStoryId(found.id);
              }}
            />
          )}
        </div>
      </main>

      <DropStoryModal
        open={composerOpen}
        zones={zones}
        defaultZoneId={selectedZone.id}
        onClose={() => setComposerOpen(false)}
        onPublish={handlePublishStory}
      />

      <CreateZoneModal
        open={createZoneOpen}
        defaultLat={anchorCoords.lat}
        defaultLng={anchorCoords.lng}
        usingGps={Boolean(gpsCoords)}
        onClose={() => setCreateZoneOpen(false)}
        onCreate={handleCreateZone}
      />

      <CreateGroupModal
        open={createGroupOpen}
        friends={friends}
        onClose={() => setCreateGroupOpen(false)}
        onCreateGroup={handleCreateGroupChat}
      />

      <ShareStoryToChatModal
        story={shareModalStory}
        chatRefs={chatRefs}
        onClose={() => setShareModalStory(null)}
        onCopyLink={handleCopyStoryLink}
        onSendToChat={handleForwardStoryToChat}
      />

      <StoryViewerModal
        story={activeStory}
        distanceKm={
          activeStory
            ? calculateDistanceKm(
                anchorCoords.lat,
                anchorCoords.lng,
                activeStory.lat,
                activeStory.lng
              )
            : 0
        }
        now={now}
        currentUid={user.uid}
        isBoosted={activeStory ? boostedStoryIds.has(activeStory.id) : false}
        onClose={() => setActiveStoryId(null)}
        onBoost={handleBoostStory}
        onShare={(s) => setShareModalStory(s)}
        onReply={handleReplyToStory}
        onJumpToZoneChat={(story) => {
          setSelectedZoneId(story.zoneId);
          setReplyContext(story);
          setActiveStoryId(null);
          setActiveSection('feed');
        }}
      />
      </div>
    </div>
  );
}
