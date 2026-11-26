import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDistanceKm,
  filterItemsByRadius,
  formatCoordPair,
  formatDistanceLabel,
  formatRemainingTime,
  generateAnonymousPersona,
  generateFriendCode,
  getDeterministicPairId,
  getExpiryProgress,
  isExpired,
  isValidCoordinates,
  isValidFriendCode,
  normalizeFriendCode,
  sanitizeImageUrl,
  sortStoriesViral,
  validateGroupChatInput,
  validateLocationShareInput,
  validateMessageInput,
  validatePrivateMessageInput,
  validateStoryInput,
  validateZoneInput,
} from './ephemeral.ts';
import type { LocationStory } from '../types/drift.ts';

test('TTL expiration and persistent zero-expiry behave deterministically', () => {
  const created = 1_000_000;
  const expires = created + 60_000;

  assert.equal(isExpired(expires, created + 30_000), false);
  assert.equal(isExpired(expires, expires), true);
  assert.equal(isExpired(0, created + 999_999_999), false);
  assert.equal(getExpiryProgress(created, expires, created + 30_000), 0.5);
  assert.equal(getExpiryProgress(created, 0, created + 30_000), 1);
  assert.equal(formatRemainingTime(0, created), 'Saved');
  assert.equal(formatRemainingTime(expires, created + 15_000), '45s left');
  assert.equal(formatRemainingTime(expires + 120_000, created), '03m 00s');
  assert.equal(formatRemainingTime(expires, expires + 1), 'Expired');
});

test('Haversine distance and radius filtering exclude out-of-range stories', () => {
  const missionLat = 37.7599;
  const missionLng = -122.4214;
  const waterfrontLat = 37.7935;
  const waterfrontLng = -122.3921;

  const dist = calculateDistanceKm(missionLat, missionLng, waterfrontLat, waterfrontLng);
  assert.ok(dist > 4 && dist < 5.5, `Expected ~4.5 km, got ${dist}`);

  const items = [
    { id: 'near', lat: 37.761, lng: -122.42 },
    { id: 'far', lat: waterfrontLat, lng: waterfrontLng },
  ];

  const within2Km = filterItemsByRadius(items, missionLat, missionLng, 2);
  assert.equal(within2Km.length, 1);
  assert.equal(within2Km[0].id, 'near');
});

test('location coordinate validation and formatting handle valid and out-of-range coordinates', () => {
  assert.equal(isValidCoordinates(37.7749, -122.4194), true);
  assert.equal(isValidCoordinates(95, -122.4194), false);
  assert.equal(isValidCoordinates(37.7749, -181), false);
  assert.equal(isValidCoordinates(Number.NaN, 0), false);

  assert.equal(formatCoordPair(37.759912, -122.421488), '37.75991, -122.42149');
  assert.equal(formatDistanceLabel(0.02), 'Right here');
  assert.equal(formatDistanceLabel(0.4), '400 m');
  assert.equal(formatDistanceLabel(2.3), '2.3 km');

  assert.equal(
    validateLocationShareInput({ lat: 37.76, lng: -122.42, label: 'Live GPS Pin' }).valid,
    true
  );
  assert.equal(
    validateLocationShareInput({ lat: 120, lng: -122.42, label: 'Bad Spot' }).valid,
    false
  );
  assert.equal(
    validateLocationShareInput({ lat: 37.76, lng: -122.42, label: 'A' }).valid,
    false
  );
});

test('sortStoriesViral filters expired stories and ranks higher engagement first', () => {
  const now = 2_000_000;
  const baseStory = (overrides: Partial<LocationStory>): LocationStory => ({
    id: 's1',
    zoneId: 'mission',
    zoneName: 'Mission Corridor',
    lat: 37.76,
    lng: -122.42,
    authorId: 'a1',
    authorHandle: 'Amber Lynx #12',
    authorHue: 188,
    headline: 'Headline',
    caption: 'Caption',
    vibe: 'Happening Now',
    createdAtMs: now - 120_000,
    expiresAtMs: now + 600_000,
    boostCount: 0,
    replyCount: 0,
    shareCount: 0,
    ...overrides,
  });

  const sorted = sortStoriesViral(
    [
      baseStory({ id: 'expired', expiresAtMs: now - 10, boostCount: 99 }),
      baseStory({ id: 'quiet', boostCount: 1 }),
      baseStory({ id: 'viral', boostCount: 18, shareCount: 4 }),
    ],
    now
  );

  assert.deepEqual(
    sorted.map((s) => s.id),
    ['viral', 'quiet']
  );
});

test('friend codes, deterministic pair IDs, and group/private chat validation behave reliably', () => {
  const code = generateFriendCode(77);
  assert.equal(isValidFriendCode(code), true);
  assert.equal(normalizeFriendCode('abcd2345'), 'ABCD-2345');
  assert.equal(isValidFriendCode('short'), false);

  assert.equal(
    getDeterministicPairId('uid_z', 'uid_a', 'dm'),
    getDeterministicPairId('uid_a', 'uid_z', 'dm')
  );
  assert.equal(getDeterministicPairId('uid_z', 'uid_a', 'fp'), 'fp_uid_a_uid_z');

  assert.equal(validateGroupChatInput({ name: 'Squad', memberCount: 0 }).valid, false);
  assert.equal(validateGroupChatInput({ name: 'Late Night Tacos', memberCount: 2 }).valid, true);
  assert.equal(validatePrivateMessageInput({ text: 'Yo!', ttlKey: 'forever' }).valid, true);
  assert.equal(validatePrivateMessageInput({ text: '', ttlKey: 'forever' }).valid, false);
});

test('validation and image sanitization reject unsafe or malformed inputs', () => {
  assert.equal(validateStoryInput({ headline: 'Hi', caption: 'valid text', ttlKey: '30m' }).valid, false);
  assert.equal(validateStoryInput({ headline: 'Alley jazz set', caption: 'Live brass trio outside', ttlKey: '30m' }).valid, true);
  assert.equal(validateMessageInput({ text: '   ', ttlKey: '30s' }).valid, false);
  assert.equal(validateMessageInput({ text: 'Heading over now!', ttlKey: '2m' }).valid, true);
  assert.equal(validateZoneInput({ name: 'A', neighborhood: 'Oak' }).valid, false);
  assert.equal(validateZoneInput({ name: 'Brooklyn Pier', neighborhood: 'Dumbo' }).valid, true);

  assert.equal(sanitizeImageUrl('javascript:alert(1)'), undefined);
  assert.equal(sanitizeImageUrl('/src/assets/images/../../etc/passwd'), undefined);
  assert.equal(
    sanitizeImageUrl('/src/assets/images/story_rooftop_espresso_1795624615247.jpg'),
    '/src/assets/images/story_rooftop_espresso_1795624615247.jpg'
  );
});

test('generateAnonymousPersona returns deterministic persona with friend code when seeded', () => {
  const p1 = generateAnonymousPersona(42);
  const p2 = generateAnonymousPersona(42);
  assert.deepEqual(p1, p2);
  assert.match(p1.handle, /^[A-Z][a-z]+ [A-Z][a-z]+ #\d{2}$/);
  assert.equal(isValidFriendCode(p1.friendCode), true);
});
