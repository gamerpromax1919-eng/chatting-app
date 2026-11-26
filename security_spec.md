# Drift Firestore Security Specification

## 1. Data Invariants
1. All public story, presence, zone, directory, and whisper documents must never contain PII (`email`, `displayName`, `phone`). Real user PII lives strictly inside `users/{userId}/private/info`, readable and writable only by `request.auth.uid == userId`.
2. Every write operation requires an authenticated, email-verified user (`request.auth != null && request.auth.token.email_verified == true`), and any author/owner UID field (`uid`, `authorId`, `fromUid`, `createdBy`) must match `request.auth.uid`.
3. Server timestamps (`request.time`) are enforced on `createdAt`, `updatedAt`, `joinedAt`, `lastSeenAt`, and `revealedAt`.
4. Friendships (`friendships/{pairId}`) can only be created atomically alongside accepting the matching `friendRequests/{requestId}` document by the recipient (`toUid == request.auth.uid`).
5. Private DMs and Group Chats (`chats/{chatId}`) enforce a Master Gate subcollection (`chats/{chatId}/members/{userId}`). Non-members cannot read or write chat metadata, members, or messages; users can only add confirmed friends (`areFriends(request.auth.uid, userId)`) to a DM or group.
6. Every `allow list` rule evaluates `resource.data` directly (e.g., `request.auth.uid in resource.data.participants`, `request.auth.uid in resource.data.memberIds`, or `resource.data.visibility == 'public'`) without calling `get()` or `exists()`.
7. Real-time presence and shared location cards enforce bounded WGS84 coordinates (`lat` in `[-90, 90]`, `lng` in `[-180, 180]`), bounded GPS `accuracyMeters` (`0..50000`), and `locationLabel` (`2..80` chars).

## 2. Dirty Dozen Attack Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Story Create**: Anonymous caller attempts `create` on `/stories/st_1`.
2. **Unverified Email Spoof**: Caller with `email_verified: false` attempts `create` on `/friendRequests/fr_1`.
3. **Friend Request Impersonation**: User A attempts to send a friend request with `fromUid: "user_b"`.
4. **Self-Acceptance Spoof**: Sender User A attempts to `update` their own pending friend request to `status: 'accepted'`.
5. **Fake Friendship Bypass**: User A creates `/friendships/fp_user_a_user_b` directly without an accepted `friendRequests` document.
6. **Private Chat Stranger Intrusion**: Non-member User C attempts `get` or `list` on `/chats/dm_a_b/messages`.
7. **Forcing Strangers Into Group Chat**: User A creates a group chat adding User C without an existing confirmed friendship (`areFriends(A, C)` false).
8. **Shadow Field Injection**: Authenticated User A creates a private message with an extra ghost key `isAdmin: true`.
9. **PII Leak Read**: Authenticated User B attempts `get` on `/users/user_a/private/info`.
10. **Friend Code Hijack**: User A updates their `users/{uid}` document attempting to overwrite an immutable `friendCode` or `uid`.
11. **Oversized Member Array**: User A attempts to create a group chat with 25 members (`memberIds.size() > 20`).
12. **Blanket Private Message Deletion**: Non-author User B attempts `delete` on User A's private chat message.
