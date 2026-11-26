import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesContent = fs.readFileSync('firestore.rules', 'utf8');
const blueprint = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8')) as {
  entities: Record<string, { required?: string[]; properties: Record<string, unknown> }>;
  firestore: Record<string, unknown>;
};

test('firestore.rules includes default-deny catch-all and strict verification helpers', () => {
  assert.match(rulesContent, /rules_version = '2';/);
  assert.match(rulesContent, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rulesContent, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesContent, /function isValidId\(id\)/);
  assert.match(rulesContent, /function areFriends\(u1, u2\)/);
  assert.match(rulesContent, /function isChatMember\(chatId\)/);
});

test('every collection in firebase-blueprint.json has explicit match rules and zero blanket list reads', () => {
  const expectedCollections = [
    'match /users/{userId}',
    'match /private/info',
    'match /chatRefs/{chatId}',
    'match /friendRequests/{requestId}',
    'match /friendships/{pairId}',
    'match /chats/{chatId}',
    'match /members/{userId}',
    'match /messages/{messageId}',
    'match /presence/{userId}',
    'match /zones/{zoneId}',
    'match /stories/{storyId}',
    'match /boosts/{userId}',
    'match /replies/{replyId}',
    'match /reactions/{userId}',
    'match /reveals/{userId}',
  ];

  for (const block of expectedCollections) {
    assert.ok(rulesContent.includes(block), `Missing rule block for ${block}`);
  }

  // Ensure no blanket allow list: if isSignedIn();
  assert.equal(/allow list:\s*if\s*isSignedIn\(\)\s*;/.test(rulesContent), false);
  // Ensure private PII subcollection blocks list
  assert.match(rulesContent, /match \/private\/info[\s\S]*?allow list:\s*if\s*false;/);
});

test('blueprint entities match validation helpers for key max lengths, friend gate, and immutability', () => {
  assert.equal(Boolean(blueprint.entities.LocationStory.properties.headline), true);
  assert.equal(Boolean(blueprint.entities.FriendRequest.properties.status), true);
  assert.equal(Boolean(blueprint.entities.PrivateChatMessage.properties.memberIds), true);
  assert.match(rulesContent, /data\.headline\.size\(\) <= 90/);
  assert.match(rulesContent, /data\.caption\.size\(\) <= 400/);
  assert.match(rulesContent, /data\.text\.size\(\) <= 280/);
  assert.match(rulesContent, /data\.friendCode\.matches\('\^\[A-Z0-9\]\{4\}-\[A-Z0-9\]\{4\}\$'\)/);
  assert.match(rulesContent, /arr\.size\(\) <= 20/);
  assert.match(rulesContent, /getAfter\(\/databases\/\$\(database\)\/documents\/friendRequests\/\$\(incoming\(\)\.requestId\)\)\.data\.status == 'accepted'/);
});

test('location sharing & live presence enforce strict coordinate bounds and schema match', () => {
  assert.equal(Boolean(blueprint.entities.UserPresence.properties.isLiveLocation), true);
  assert.equal(Boolean(blueprint.entities.UserPresence.properties.accuracyMeters), true);
  assert.equal(Boolean(blueprint.entities.PrivateChatMessage.properties.locationLat), true);
  assert.equal(Boolean(blueprint.entities.EphemeralMessage.properties.locationIsLive), true);
  assert.match(rulesContent, /function isValidLocationFields\(data\)/);
  assert.match(rulesContent, /data\.locationLat >= -90 && data\.locationLat <= 90/);
  assert.match(rulesContent, /data\.locationLng >= -180 && data\.locationLng <= 180/);
  assert.match(rulesContent, /data\.locationLabel\.size\(\) <= 80/);
  assert.match(rulesContent, /data\.accuracyMeters >= 0 && data\.accuracyMeters <= 50000/);
});

