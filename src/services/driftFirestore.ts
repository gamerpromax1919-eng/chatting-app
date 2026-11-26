import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.ts';
import type {
  AnonymousIdentity,
  ChatMember,
  ChatRoom,
  EmojiKey,
  FriendRequest,
  FriendSummary,
  LocationZone,
  MessageTtlKey,
  PrivateTtlKey,
  PublicDirectoryUser,
  StoryTtlKey,
  StoryVibe,
  ZoneId,
} from '../types/drift.ts';
import {
  TTL_MS_MAP,
  generateAnonymousPersona,
  generateFriendCode,
  getDeterministicPairId,
  normalizeFriendCode,
  sanitizeImageUrl,
  validateGroupChatInput,
  validateLocationShareInput,
  validateMessageInput,
  validatePrivateMessageInput,
  validateStoryInput,
  validateZoneInput,
} from '../utils/ephemeral.ts';
import { OperationType, handleFirestoreError } from '../utils/firestoreErrors.ts';

function makeRandomId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${raw}`;
}

export async function syncUserProfile(user: User): Promise<AnonymousIdentity> {
  const publicPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;

  let identity: AnonymousIdentity | null = null;

  try {
    const userRef = doc(db, 'users', user.uid);
    const existingSnap = await getDoc(userRef);
    if (existingSnap.exists()) {
      const data = existingSnap.data();
      const existingCode =
        typeof data.friendCode === 'string' && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(data.friendCode)
          ? data.friendCode
          : generateFriendCode();

      identity = {
        id: user.uid,
        handle: String(data.handle ?? 'Harbor Lynx #10').slice(0, 32),
        friendCode: existingCode,
        hue: Number(data.hue ?? 188),
        glyphIndex: Number(data.glyphIndex ?? 0),
      };

      if (data.friendCode !== existingCode || data.isPublicDirectory !== true) {
        await updateDoc(userRef, {
          friendCode: existingCode,
          isPublicDirectory: true,
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      const generated = generateAnonymousPersona();
      identity = {
        id: user.uid,
        handle: generated.handle,
        friendCode: generated.friendCode,
        hue: generated.hue,
        glyphIndex: generated.glyphIndex,
      };
      await setDoc(userRef, {
        uid: user.uid,
        handle: identity.handle,
        friendCode: identity.friendCode,
        hue: identity.hue,
        glyphIndex: identity.glyphIndex,
        isPublicDirectory: true,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
  }

  // Keep PII strictly inside split private doc
  try {
    const privateRef = doc(db, 'users', user.uid, 'private', 'info');
    const privateSnap = await getDoc(privateRef);
    const email = (user.email ?? 'unknown@example.com').slice(0, 200);
    const displayName = (user.displayName ?? 'Drift Member').slice(0, 120);

    if (!privateSnap.exists()) {
      await setDoc(privateRef, {
        uid: user.uid,
        email,
        displayName,
        createdAt: serverTimestamp(),
      });
    } else {
      const prev = privateSnap.data();
      if (prev.email !== email || prev.displayName !== displayName) {
        await updateDoc(privateRef, { email, displayName });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }

  return identity!;
}

export async function rotateUserMask(
  uid: string,
  friendCode: string
): Promise<AnonymousIdentity> {
  const generated = generateAnonymousPersona();
  const next: AnonymousIdentity = {
    id: uid,
    handle: generated.handle,
    friendCode,
    hue: generated.hue,
    glyphIndex: generated.glyphIndex,
  };
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      handle: next.handle,
      hue: next.hue,
      glyphIndex: next.glyphIndex,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
  return next;
}

export async function findUsersByQuery(
  rawQuery: string,
  myUid: string
): Promise<PublicDirectoryUser[]> {
  const qText = rawQuery.trim();
  if (qText.length < 2) return [];

  const normalizedCode = normalizeFriendCode(qText);
  const lowerQuery = qText.toLowerCase();

  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('isPublicDirectory', '==', true))
    );
    const matches: PublicDirectoryUser[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const uid = String(d.uid ?? docSnap.id);
      if (uid === myUid) return;
      const handle = String(d.handle ?? '');
      const friendCode = String(d.friendCode ?? '');
      if (
        friendCode.toUpperCase() === normalizedCode ||
        handle.toLowerCase().includes(lowerQuery) ||
        uid === qText
      ) {
        matches.push({
          uid,
          handle,
          friendCode,
          hue: Number(d.hue ?? 188),
          glyphIndex: Number(d.glyphIndex ?? 0),
        });
      }
    });
    return matches.slice(0, 12);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
    return [];
  }
}

export async function sendFriendRequest(
  me: AnonymousIdentity,
  target: { uid: string; handle: string; hue: number }
): Promise<void> {
  if (me.id === target.uid) {
    throw new Error('You cannot add yourself as a friend.');
  }

  const pairId = getDeterministicPairId(me.id, target.uid, 'fp');
  const existingFriendSnap = await getDoc(doc(db, 'friendships', pairId));
  if (existingFriendSnap.exists()) {
    throw new Error(`You are already friends with ${target.handle}.`);
  }

  const reqId = getDeterministicPairId(me.id, target.uid, 'fr');
  const reqRef = doc(db, 'friendRequests', reqId);
  const existingReq = await getDoc(reqRef);
  if (existingReq.exists()) {
    const status = String(existingReq.data().status ?? '');
    if (status === 'pending') {
      throw new Error('A friend request is already pending between you.');
    }
    if (status === 'declined') {
      await deleteDoc(reqRef);
    }
  }

  const path = `friendRequests/${reqId}`;
  try {
    await setDoc(reqRef, {
      id: reqId,
      fromUid: me.id,
      fromHandle: me.handle.slice(0, 32),
      fromHue: Math.max(0, Math.min(360, Math.round(me.hue))),
      toUid: target.uid,
      toHandle: target.handle.slice(0, 32),
      toHue: Math.max(0, Math.min(360, Math.round(target.hue))),
      participants: [me.id, target.uid],
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function acceptFriendRequest(req: FriendRequest): Promise<void> {
  const pairId = getDeterministicPairId(req.fromUid, req.toUid, 'fp');
  const reqRef = doc(db, 'friendRequests', req.id);
  const friendshipRef = doc(db, 'friendships', pairId);

  const [firstIsFrom] = req.fromUid < req.toUid ? [true] : [false];
  const uidA = firstIsFrom ? req.fromUid : req.toUid;
  const handleA = firstIsFrom ? req.fromHandle : req.toHandle;
  const hueA = firstIsFrom ? req.fromHue : req.toHue;
  const uidB = firstIsFrom ? req.toUid : req.fromUid;
  const handleB = firstIsFrom ? req.toHandle : req.fromHandle;
  const hueB = firstIsFrom ? req.toHue : req.fromHue;

  const batch = writeBatch(db);
  batch.update(reqRef, {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
  batch.set(friendshipRef, {
    id: pairId,
    requestId: req.id,
    uidA,
    handleA: handleA.slice(0, 32),
    hueA: Math.max(0, Math.min(360, Math.round(hueA))),
    uidB,
    handleB: handleB.slice(0, 32),
    hueB: Math.max(0, Math.min(360, Math.round(hueB))),
    participants: [uidA, uidB],
    acceptedBy: req.toUid,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `friendships/${pairId}`);
  }
}

export async function declineOrCancelFriendRequest(requestId: string): Promise<void> {
  const path = `friendRequests/${requestId}`;
  try {
    await deleteDoc(doc(db, 'friendRequests', requestId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function removeFriendship(pairId: string): Promise<void> {
  const path = `friendships/${pairId}`;
  try {
    await deleteDoc(doc(db, 'friendships', pairId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function openOrCreateDirectChat(
  me: AnonymousIdentity,
  friend: FriendSummary
): Promise<string> {
  const chatId = getDeterministicPairId(me.id, friend.uid, 'dm');
  const myRefSnap = await getDoc(doc(db, 'users', me.id, 'chatRefs', chatId));
  if (myRefSnap.exists()) {
    return chatId;
  }

  const memberIds = [me.id, friend.uid];
  const nowMs = Date.now();
  const batch = writeBatch(db);

  batch.set(doc(db, 'chats', chatId), {
    id: chatId,
    kind: 'dm',
    name: `${me.handle} & ${friend.handle}`.slice(0, 48),
    createdBy: me.id,
    memberIds,
    lastMessageText: 'Private chat started',
    lastMessageAtMs: nowMs,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'chats', chatId, 'members', me.id), {
    uid: me.id,
    chatId,
    handle: me.handle.slice(0, 32),
    hue: Math.max(0, Math.min(360, Math.round(me.hue))),
    role: 'owner',
    visibleTo: memberIds,
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'chats', chatId, 'members', friend.uid), {
    uid: friend.uid,
    chatId,
    handle: friend.handle.slice(0, 32),
    hue: Math.max(0, Math.min(360, Math.round(friend.hue))),
    role: 'member',
    visibleTo: memberIds,
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', me.id, 'chatRefs', chatId), {
    chatId,
    uid: me.id,
    kind: 'dm',
    title: friend.handle.slice(0, 48),
    peerUid: friend.uid,
    peerHandle: friend.handle.slice(0, 32),
    peerHue: Math.max(0, Math.min(360, Math.round(friend.hue))),
    lastMessageText: 'Private chat started',
    lastMessageAtMs: nowMs,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', friend.uid, 'chatRefs', chatId), {
    chatId,
    uid: friend.uid,
    kind: 'dm',
    title: me.handle.slice(0, 48),
    peerUid: me.id,
    peerHandle: me.handle.slice(0, 32),
    peerHue: Math.max(0, Math.min(360, Math.round(me.hue))),
    lastMessageText: 'Private chat started',
    lastMessageAtMs: nowMs,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${chatId}`);
  }

  return chatId;
}

export async function createGroupChat(
  me: AnonymousIdentity,
  groupName: string,
  friends: readonly FriendSummary[]
): Promise<string> {
  const check = validateGroupChatInput({
    name: groupName,
    memberCount: friends.length,
  });
  if (!check.valid) {
    throw new Error(check.error ?? 'Invalid group chat details.');
  }

  const chatId = makeRandomId('grp');
  const cleanName = groupName.trim().slice(0, 48);
  const uniqueFriends = friends.filter(
    (f, idx) => f.uid !== me.id && friends.findIndex((o) => o.uid === f.uid) === idx
  );
  const memberIds = [me.id, ...uniqueFriends.map((f) => f.uid)].slice(0, 20);
  const nowMs = Date.now();
  const batch = writeBatch(db);

  batch.set(doc(db, 'chats', chatId), {
    id: chatId,
    kind: 'group',
    name: cleanName,
    createdBy: me.id,
    memberIds,
    lastMessageText: `${me.handle} created ${cleanName}`.slice(0, 280),
    lastMessageAtMs: nowMs,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'chats', chatId, 'members', me.id), {
    uid: me.id,
    chatId,
    handle: me.handle.slice(0, 32),
    hue: Math.max(0, Math.min(360, Math.round(me.hue))),
    role: 'owner',
    visibleTo: memberIds,
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', me.id, 'chatRefs', chatId), {
    chatId,
    uid: me.id,
    kind: 'group',
    title: cleanName,
    lastMessageText: `${me.handle} created ${cleanName}`.slice(0, 280),
    lastMessageAtMs: nowMs,
    updatedAt: serverTimestamp(),
  });

  for (const friend of uniqueFriends.slice(0, 19)) {
    batch.set(doc(db, 'chats', chatId, 'members', friend.uid), {
      uid: friend.uid,
      chatId,
      handle: friend.handle.slice(0, 32),
      hue: Math.max(0, Math.min(360, Math.round(friend.hue))),
      role: 'member',
      visibleTo: memberIds,
      joinedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', friend.uid, 'chatRefs', chatId), {
      chatId,
      uid: friend.uid,
      kind: 'group',
      title: cleanName,
      lastMessageText: `${me.handle} added you to ${cleanName}`.slice(0, 280),
      lastMessageAtMs: nowMs,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${chatId}`);
  }

  return chatId;
}

export async function addFriendToGroupChat(
  chatRoom: ChatRoom,
  existingMembers: readonly ChatMember[],
  friend: FriendSummary
): Promise<void> {
  if (chatRoom.kind !== 'group') {
    throw new Error('You can only add extra members to group chats.');
  }
  if (chatRoom.memberIds.includes(friend.uid)) {
    throw new Error(`${friend.handle} is already in this group.`);
  }
  if (chatRoom.memberIds.length >= 20) {
    throw new Error('This group has reached the 20-member limit.');
  }

  const nextMemberIds = [...chatRoom.memberIds, friend.uid];
  const nowMs = Date.now();
  const batch = writeBatch(db);

  batch.update(doc(db, 'chats', chatRoom.id), {
    memberIds: nextMemberIds,
    updatedAt: serverTimestamp(),
  });

  for (const m of existingMembers) {
    batch.update(doc(db, 'chats', chatRoom.id, 'members', m.uid), {
      visibleTo: nextMemberIds,
    });
  }

  batch.set(doc(db, 'chats', chatRoom.id, 'members', friend.uid), {
    uid: friend.uid,
    chatId: chatRoom.id,
    handle: friend.handle.slice(0, 32),
    hue: Math.max(0, Math.min(360, Math.round(friend.hue))),
    role: 'member',
    visibleTo: nextMemberIds,
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', friend.uid, 'chatRefs', chatRoom.id), {
    chatId: chatRoom.id,
    uid: friend.uid,
    kind: 'group',
    title: chatRoom.name,
    lastMessageText: `Added to ${chatRoom.name}`.slice(0, 280),
    lastMessageAtMs: nowMs,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatRoom.id}`);
  }
}

export async function leaveGroupChat(
  chatRoom: ChatRoom,
  myUid: string
): Promise<void> {
  const nextMemberIds = chatRoom.memberIds.filter((id) => id !== myUid);
  const batch = writeBatch(db);

  if (nextMemberIds.length > 0) {
    batch.update(doc(db, 'chats', chatRoom.id), {
      memberIds: nextMemberIds,
      updatedAt: serverTimestamp(),
    });
  }
  batch.delete(doc(db, 'chats', chatRoom.id, 'members', myUid));
  batch.delete(doc(db, 'users', myUid, 'chatRefs', chatRoom.id));

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chatRoom.id}/members/${myUid}`);
  }
}

export async function sendPrivateChatMessage(params: {
  chatRoom: ChatRoom;
  author: AnonymousIdentity;
  text: string;
  ttlKey: PrivateTtlKey;
  burnOnRead: boolean;
  sharedStoryId?: string;
  sharedStoryHeadline?: string;
  sharedStoryZoneName?: string;
  location?: {
    lat: number;
    lng: number;
    label: string;
    isLive: boolean;
  };
}): Promise<string> {
  const check = validatePrivateMessageInput({
    text: params.text,
    ttlKey: params.ttlKey,
  });
  if (!check.valid) {
    throw new Error(check.error ?? 'Invalid message.');
  }

  if (params.location) {
    const locCheck = validateLocationShareInput({
      lat: params.location.lat,
      lng: params.location.lng,
      label: params.location.label,
    });
    if (!locCheck.valid) {
      throw new Error(locCheck.error ?? 'Invalid shared location.');
    }
  }

  const msgId = makeRandomId('pm');
  const nowMs = Date.now();
  const expiresAtMs =
    params.ttlKey === 'forever'
      ? 0
      : nowMs + (TTL_MS_MAP[params.ttlKey] ?? TTL_MS_MAP['2m']);
  const cleanText = params.text.trim().slice(0, 400);
  const previewText = params.burnOnRead
    ? 'Sent a burn-on-read whisper'
    : params.location
      ? params.location.isLive
        ? `Shared live location: ${params.location.label.trim().slice(0, 80)}`
        : `Pinned location: ${params.location.label.trim().slice(0, 80)}`
      : cleanText.slice(0, 120);

  const msgPayload: Record<string, unknown> = {
    id: msgId,
    chatId: params.chatRoom.id,
    authorId: params.author.id,
    authorHandle: params.author.handle.slice(0, 32),
    authorHue: Math.max(0, Math.min(360, Math.round(params.author.hue))),
    text: cleanText,
    ttlKey: params.ttlKey,
    burnOnRead: params.burnOnRead,
    memberIds: params.chatRoom.memberIds,
    createdAt: serverTimestamp(),
    createdAtMs: nowMs,
    expiresAtMs,
    reactionCounts: { fire: 0, eyes: 0, hundred: 0, bolt: 0 },
  };

  if (params.sharedStoryId) {
    msgPayload.sharedStoryId = params.sharedStoryId.slice(0, 128);
  }
  if (params.sharedStoryHeadline) {
    msgPayload.sharedStoryHeadline = params.sharedStoryHeadline.trim().slice(0, 90);
  }
  if (params.sharedStoryZoneName) {
    msgPayload.sharedStoryZoneName = params.sharedStoryZoneName.trim().slice(0, 48);
  }
  if (params.location) {
    msgPayload.locationLat = params.location.lat;
    msgPayload.locationLng = params.location.lng;
    msgPayload.locationLabel = params.location.label.trim().slice(0, 80);
    msgPayload.locationIsLive = Boolean(params.location.isLive);
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'chats', params.chatRoom.id, 'messages', msgId), msgPayload);
  batch.update(doc(db, 'chats', params.chatRoom.id), {
    lastMessageText: previewText.slice(0, 280),
    lastMessageAtMs: nowMs,
    updatedAt: serverTimestamp(),
  });

  for (const uid of params.chatRoom.memberIds) {
    batch.update(doc(db, 'users', uid, 'chatRefs', params.chatRoom.id), {
      lastMessageText: previewText.slice(0, 280),
      lastMessageAtMs: nowMs,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `chats/${params.chatRoom.id}/messages/${msgId}`
    );
  }

  return msgId;
}

export async function togglePrivateMessageReaction(
  chatId: string,
  messageId: string,
  uid: string,
  emojiKey: EmojiKey
): Promise<void> {
  const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
  const reactRef = doc(db, 'chats', chatId, 'messages', messageId, 'reactions', uid);
  const path = `chats/${chatId}/messages/${messageId}`;

  try {
    await runTransaction(db, async (tx) => {
      const [msgSnap, reactSnap] = await Promise.all([tx.get(msgRef), tx.get(reactRef)]);
      if (!msgSnap.exists()) return;

      const counts = (msgSnap.data().reactionCounts ?? {
        fire: 0,
        eyes: 0,
        hundred: 0,
        bolt: 0,
      }) as Record<EmojiKey, number>;

      const currentList: EmojiKey[] = reactSnap.exists()
        ? ((reactSnap.data().emojis ?? []) as EmojiKey[])
        : [];
      const hasEmoji = currentList.includes(emojiKey);
      const nextList: EmojiKey[] = hasEmoji
        ? currentList.filter((e) => e !== emojiKey)
        : [...currentList, emojiKey].slice(0, 4);

      const nextCounts = {
        fire: Number(counts.fire ?? 0),
        eyes: Number(counts.eyes ?? 0),
        hundred: Number(counts.hundred ?? 0),
        bolt: Number(counts.bolt ?? 0),
      };
      nextCounts[emojiKey] = hasEmoji
        ? Math.max(0, nextCounts[emojiKey] - 1)
        : nextCounts[emojiKey] + 1;

      tx.set(reactRef, {
        uid,
        messageId,
        emojis: nextList,
        updatedAt: serverTimestamp(),
      });
      tx.update(msgRef, { reactionCounts: nextCounts });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function revealPrivateBurnMessage(
  chatId: string,
  messageId: string,
  uid: string
): Promise<void> {
  const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
  const revealRef = doc(db, 'chats', chatId, 'messages', messageId, 'reveals', uid);
  const path = `chats/${chatId}/messages/${messageId}`;

  try {
    await runTransaction(db, async (tx) => {
      const [msgSnap, revealSnap] = await Promise.all([
        tx.get(msgRef),
        tx.get(revealRef),
      ]);
      if (!msgSnap.exists()) return;
      const data = msgSnap.data();
      const authorId = String(data.authorId ?? '');
      const createdAtMs = Number(data.createdAtMs ?? 0);
      const currentExpiresAtMs = Number(data.expiresAtMs ?? 0);

      if (!revealSnap.exists()) {
        tx.set(revealRef, {
          uid,
          messageId,
          revealedAt: serverTimestamp(),
        });
      }

      if (Boolean(data.burnOnRead) && uid !== authorId) {
        const targetBurnMs = Math.max(createdAtMs + 1000, Date.now() + 15000);
        const tightened =
          currentExpiresAtMs === 0
            ? targetBurnMs
            : Math.min(currentExpiresAtMs, targetBurnMs);
        if (currentExpiresAtMs === 0 || tightened < currentExpiresAtMs) {
          tx.update(msgRef, { expiresAtMs: tightened });
        }
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteOwnPrivateMessage(
  chatId: string,
  messageId: string
): Promise<void> {
  const path = `chats/${chatId}/messages/${messageId}`;
  try {
    await deleteDoc(doc(db, 'chats', chatId, 'messages', messageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Neighborhood Rooms, Stories & Public Whispers ---

export async function upsertPresence(params: {
  uid: string;
  handle: string;
  hue: number;
  zoneId: ZoneId;
  lat: number;
  lng: number;
  isLiveLocation?: boolean;
  accuracyMeters?: number;
}): Promise<void> {
  const path = `presence/${params.uid}`;
  const payload: Record<string, unknown> = {
    uid: params.uid,
    handle: params.handle.slice(0, 32),
    hue: Math.max(0, Math.min(360, Math.round(params.hue))),
    zoneId: params.zoneId.slice(0, 64),
    lat: params.lat,
    lng: params.lng,
    isLiveLocation: Boolean(params.isLiveLocation),
    visibility: 'public',
    lastSeenAt: serverTimestamp(),
    lastSeenMs: Date.now(),
  };

  if (typeof params.accuracyMeters === 'number' && Number.isFinite(params.accuracyMeters)) {
    payload.accuracyMeters = Math.max(0, Math.min(50000, Math.round(params.accuracyMeters)));
  }

  try {
    await setDoc(doc(db, 'presence', params.uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removePresence(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'presence', uid));
  } catch {
    // Best-effort cleanup on sign-out/unload
  }
}

export async function createCustomZone(params: {
  name: string;
  neighborhood: string;
  lat: number;
  lng: number;
  createdBy: string;
}): Promise<LocationZone> {
  const check = validateZoneInput({
    name: params.name,
    neighborhood: params.neighborhood,
  });
  if (!check.valid) {
    throw new Error(check.error ?? 'Invalid room details.');
  }

  const zoneId = makeRandomId('zn');
  const zonePath = `zones/${zoneId}`;
  const cleanName = params.name.trim().slice(0, 48);
  const cleanNeighborhood = params.neighborhood.trim().slice(0, 64);

  try {
    await setDoc(doc(db, 'zones', zoneId), {
      id: zoneId,
      name: cleanName,
      neighborhood: cleanNeighborhood,
      lat: params.lat,
      lng: params.lng,
      createdBy: params.createdBy,
      visibility: 'public',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, zonePath);
  }

  return {
    id: zoneId,
    name: cleanName,
    neighborhood: cleanNeighborhood,
    lat: params.lat,
    lng: params.lng,
    activeCount: 0,
    isCustom: true,
  };
}

export async function publishStory(params: {
  zoneId: ZoneId;
  zoneName: string;
  lat: number;
  lng: number;
  authorId: string;
  authorHandle: string;
  authorHue: number;
  headline: string;
  caption: string;
  vibe: StoryVibe;
  ttlKey: StoryTtlKey;
  imageUrl?: string;
}): Promise<string> {
  const check = validateStoryInput({
    headline: params.headline,
    caption: params.caption,
    ttlKey: params.ttlKey,
  });
  if (!check.valid) {
    throw new Error(check.error ?? 'Invalid story input.');
  }

  const storyId = makeRandomId('st');
  const nowMs = Date.now();
  const ttlMs = TTL_MS_MAP[params.ttlKey] ?? TTL_MS_MAP['30m'];
  const cleanImage = sanitizeImageUrl(params.imageUrl);

  const payload: Record<string, unknown> = {
    id: storyId,
    zoneId: params.zoneId.slice(0, 64),
    zoneName: params.zoneName.slice(0, 48),
    lat: params.lat,
    lng: params.lng,
    authorId: params.authorId,
    authorHandle: params.authorHandle.slice(0, 32),
    authorHue: Math.max(0, Math.min(360, Math.round(params.authorHue))),
    headline: params.headline.trim().slice(0, 90),
    caption: params.caption.trim().slice(0, 400),
    vibe: params.vibe,
    visibility: 'public',
    createdAt: serverTimestamp(),
    createdAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
    boostCount: 0,
    shareCount: 0,
    replyCount: 0,
  };

  if (cleanImage) {
    payload.imageUrl = cleanImage;
  }

  const path = `stories/${storyId}`;
  try {
    await setDoc(doc(db, 'stories', storyId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
  return storyId;
}

export async function toggleStoryBoost(storyId: string, uid: string): Promise<void> {
  const storyRef = doc(db, 'stories', storyId);
  const boostRef = doc(db, 'stories', storyId, 'boosts', uid);
  const path = `stories/${storyId}`;

  try {
    await runTransaction(db, async (tx) => {
      const [storySnap, boostSnap] = await Promise.all([
        tx.get(storyRef),
        tx.get(boostRef),
      ]);
      if (!storySnap.exists()) {
        throw new Error('Story no longer exists.');
      }
      const prevCount = Number(storySnap.data().boostCount ?? 0);
      if (boostSnap.exists()) {
        tx.delete(boostRef);
        tx.update(storyRef, { boostCount: Math.max(0, prevCount - 1) });
      } else {
        tx.set(boostRef, {
          uid,
          storyId,
          createdAt: serverTimestamp(),
        });
        tx.update(storyRef, { boostCount: prevCount + 1 });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function incrementStoryShare(storyId: string): Promise<void> {
  const storyRef = doc(db, 'stories', storyId);
  const path = `stories/${storyId}`;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(storyRef);
      if (!snap.exists()) return;
      const prev = Number(snap.data().shareCount ?? 0);
      tx.update(storyRef, { shareCount: prev + 1 });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function addStoryReply(params: {
  storyId: string;
  authorId: string;
  authorHandle: string;
  authorHue: number;
  text: string;
  storyExpiresAtMs: number;
}): Promise<void> {
  const trimmed = params.text.trim();
  if (trimmed.length < 1 || trimmed.length > 220) {
    throw new Error('Reply must be 1 to 220 characters.');
  }

  const replyId = makeRandomId('rep');
  const storyRef = doc(db, 'stories', params.storyId);
  const replyRef = doc(collection(db, 'stories', params.storyId, 'replies'), replyId);
  const nowMs = Date.now();
  const expiresAtMs = Math.min(params.storyExpiresAtMs, nowMs + 30 * 60 * 1000);
  const path = `stories/${params.storyId}/replies/${replyId}`;

  try {
    await runTransaction(db, async (tx) => {
      const storySnap = await tx.get(storyRef);
      if (!storySnap.exists()) {
        throw new Error('Story has expired.');
      }
      const prevReplies = Number(storySnap.data().replyCount ?? 0);
      tx.set(replyRef, {
        id: replyId,
        storyId: params.storyId,
        authorId: params.authorId,
        authorHandle: params.authorHandle.slice(0, 32),
        authorHue: Math.max(0, Math.min(360, Math.round(params.authorHue))),
        text: trimmed,
        createdAt: serverTimestamp(),
        createdAtMs: nowMs,
        expiresAtMs: Math.max(nowMs, expiresAtMs),
      });
      tx.update(storyRef, { replyCount: prevReplies + 1 });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteOwnStory(storyId: string): Promise<void> {
  const path = `stories/${storyId}`;
  try {
    await deleteDoc(doc(db, 'stories', storyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function sendEphemeralMessage(params: {
  zoneId: ZoneId;
  authorId: string;
  authorHandle: string;
  authorHue: number;
  text: string;
  ttlKey: MessageTtlKey;
  burnOnRead: boolean;
  replyToStoryId?: string;
  replyToHeadline?: string;
  location?: {
    lat: number;
    lng: number;
    label: string;
    isLive: boolean;
  };
}): Promise<string> {
  const check = validateMessageInput({ text: params.text, ttlKey: params.ttlKey });
  if (!check.valid) {
    throw new Error(check.error ?? 'Invalid message.');
  }

  if (params.location) {
    const locCheck = validateLocationShareInput({
      lat: params.location.lat,
      lng: params.location.lng,
      label: params.location.label,
    });
    if (!locCheck.valid) {
      throw new Error(locCheck.error ?? 'Invalid shared location.');
    }
  }

  const msgId = makeRandomId('msg');
  const nowMs = Date.now();
  const ttlMs = TTL_MS_MAP[params.ttlKey] ?? TTL_MS_MAP['2m'];
  const payload: Record<string, unknown> = {
    id: msgId,
    zoneId: params.zoneId.slice(0, 64),
    authorId: params.authorId,
    authorHandle: params.authorHandle.slice(0, 32),
    authorHue: Math.max(0, Math.min(360, Math.round(params.authorHue))),
    text: params.text.trim().slice(0, 280),
    ttlKey: params.ttlKey,
    burnOnRead: params.burnOnRead,
    visibility: 'zone',
    createdAt: serverTimestamp(),
    createdAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
    reactionCounts: { fire: 0, eyes: 0, hundred: 0, bolt: 0 },
  };

  if (params.replyToStoryId) {
    payload.replyToStoryId = params.replyToStoryId.slice(0, 128);
  }
  if (params.replyToHeadline) {
    payload.replyToHeadline = params.replyToHeadline.trim().slice(0, 90);
  }
  if (params.location) {
    payload.locationLat = params.location.lat;
    payload.locationLng = params.location.lng;
    payload.locationLabel = params.location.label.trim().slice(0, 80);
    payload.locationIsLive = Boolean(params.location.isLive);
  }

  const path = `messages/${msgId}`;
  try {
    await setDoc(doc(db, 'messages', msgId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
  return msgId;
}

export async function toggleMessageReaction(
  messageId: string,
  uid: string,
  emojiKey: EmojiKey
): Promise<void> {
  const msgRef = doc(db, 'messages', messageId);
  const reactRef = doc(db, 'messages', messageId, 'reactions', uid);
  const path = `messages/${messageId}`;

  try {
    await runTransaction(db, async (tx) => {
      const [msgSnap, reactSnap] = await Promise.all([tx.get(msgRef), tx.get(reactRef)]);
      if (!msgSnap.exists()) return;

      const counts = (msgSnap.data().reactionCounts ?? {
        fire: 0,
        eyes: 0,
        hundred: 0,
        bolt: 0,
      }) as Record<EmojiKey, number>;

      const currentList: EmojiKey[] = reactSnap.exists()
        ? ((reactSnap.data().emojis ?? []) as EmojiKey[])
        : [];
      const hasEmoji = currentList.includes(emojiKey);
      const nextList: EmojiKey[] = hasEmoji
        ? currentList.filter((e) => e !== emojiKey)
        : [...currentList, emojiKey].slice(0, 4);

      const nextCounts = {
        fire: Number(counts.fire ?? 0),
        eyes: Number(counts.eyes ?? 0),
        hundred: Number(counts.hundred ?? 0),
        bolt: Number(counts.bolt ?? 0),
      };
      nextCounts[emojiKey] = hasEmoji
        ? Math.max(0, nextCounts[emojiKey] - 1)
        : nextCounts[emojiKey] + 1;

      tx.set(reactRef, {
        uid,
        messageId,
        emojis: nextList,
        updatedAt: serverTimestamp(),
      });
      tx.update(msgRef, { reactionCounts: nextCounts });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function revealBurnMessage(messageId: string, uid: string): Promise<void> {
  const msgRef = doc(db, 'messages', messageId);
  const revealRef = doc(db, 'messages', messageId, 'reveals', uid);
  const path = `messages/${messageId}`;

  try {
    await runTransaction(db, async (tx) => {
      const [msgSnap, revealSnap] = await Promise.all([
        tx.get(msgRef),
        tx.get(revealRef),
      ]);
      if (!msgSnap.exists()) return;
      const data = msgSnap.data();
      const authorId = String(data.authorId ?? '');
      const createdAtMs = Number(data.createdAtMs ?? 0);
      const currentExpiresAtMs = Number(data.expiresAtMs ?? 0);

      if (!revealSnap.exists()) {
        tx.set(revealRef, {
          uid,
          messageId,
          revealedAt: serverTimestamp(),
        });
      }

      if (Boolean(data.burnOnRead) && uid !== authorId) {
        const targetBurnMs = Math.max(createdAtMs + 1000, Date.now() + 15000);
        const tightened = Math.min(currentExpiresAtMs, targetBurnMs);
        if (tightened < currentExpiresAtMs) {
          tx.update(msgRef, { expiresAtMs: tightened });
        }
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteOwnMessage(messageId: string): Promise<void> {
  const path = `messages/${messageId}`;
  try {
    await deleteDoc(doc(db, 'messages', messageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cleanupExpiredOwnItems(
  storyIds: readonly string[],
  messageIds: readonly string[]
): Promise<void> {
  if (storyIds.length === 0 && messageIds.length === 0) return;
  const batch = writeBatch(db);
  for (const id of storyIds.slice(0, 10)) {
    batch.delete(doc(db, 'stories', id));
  }
  for (const id of messageIds.slice(0, 10)) {
    batch.delete(doc(db, 'messages', id));
  }
  try {
    await batch.commit();
  } catch {
    // Ignore background cleanup errors
  }
}
