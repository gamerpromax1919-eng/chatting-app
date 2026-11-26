import type {
  AnonymousIdentity,
  EmojiKey,
  LocationStory,
  LocationZone,
  MessageTtlKey,
  PrivateTtlKey,
  StoryTtlKey,
  StoryVibe,
  TtlKey,
} from '../types/drift.ts';

export const TTL_MS_MAP: Record<TtlKey, number> = {
  '30s': 30 * 1000,
  '2m': 2 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

export const STORY_TTL_OPTIONS: readonly { key: StoryTtlKey; label: string }[] = [
  { key: '5m', label: '5 min' },
  { key: '30m', label: '30 min' },
  { key: '2h', label: '2 hrs' },
  { key: '24h', label: '24 hrs' },
];

export const MESSAGE_TTL_OPTIONS: readonly { key: MessageTtlKey; label: string }[] = [
  { key: '30s', label: '30s' },
  { key: '2m', label: '2m' },
  { key: '10m', label: '10m' },
  { key: '1h', label: '1h' },
];

export const PRIVATE_TTL_OPTIONS: readonly { key: PrivateTtlKey; label: string }[] = [
  { key: 'forever', label: 'Keep' },
  { key: '30s', label: '30s' },
  { key: '2m', label: '2m' },
  { key: '10m', label: '10m' },
  { key: '1h', label: '1h' },
];

export const STORY_VIBES: readonly StoryVibe[] = [
  'Happening Now',
  'Food & Pop-up',
  'Street Music',
  'Secret Spot',
  'Heads Up',
];

export const REACTION_OPTIONS: readonly { key: EmojiKey; symbol: string }[] = [
  { key: 'fire', symbol: '🔥' },
  { key: 'eyes', symbol: '👀' },
  { key: 'hundred', symbol: '💯' },
  { key: 'bolt', symbol: '⚡' },
];

export const PRESET_BACKDROPS: readonly { label: string; url: string }[] = [
  {
    label: 'Rooftop Espresso',
    url: '/src/assets/images/story_rooftop_espresso_1795624615247.jpg',
  },
  {
    label: 'Alley Vinyl Stall',
    url: '/src/assets/images/story_alley_vinyl_1795624616848.jpg',
  },
  {
    label: 'Night Taco Corner',
    url: '/src/assets/images/story_night_tacos_1795624617282.jpg',
  },
  {
    label: 'Dawn Pier Mist',
    url: '/src/assets/images/story_pier_fog_1795624618216.jpg',
  },
];

export const DEFAULT_ZONES: readonly Omit<LocationZone, 'activeCount'>[] = [
  {
    id: 'mission',
    name: 'Mission Corridor',
    neighborhood: 'Valencia & 20th',
    lat: 37.7599,
    lng: -122.4214,
  },
  {
    id: 'soma',
    name: 'SoMa Loft Strip',
    neighborhood: 'Folsom & 7th',
    lat: 37.7755,
    lng: -122.4084,
  },
  {
    id: 'waterfront',
    name: 'Embarcadero Pier',
    neighborhood: 'Pier 14 Promenade',
    lat: 37.7935,
    lng: -122.3921,
  },
  {
    id: 'commons',
    name: 'Civic Commons',
    neighborhood: 'Hayes & Gough',
    lat: 37.7768,
    lng: -122.4232,
  },
];

const ADJECTIVES = [
  'Amber',
  'Cobalt',
  'Silver',
  'Cedar',
  'Crisp',
  'Velvet',
  'Harbor',
  'Solar',
  'Slate',
  'Copper',
  'Nordic',
  'Signal',
];

const ANIMALS = [
  'Lynx',
  'Heron',
  'Finch',
  'Fox',
  'Swift',
  'Otter',
  'Kestrel',
  'Badger',
  'Moth',
  'Puffin',
  'Wren',
  'Ocelot',
];

const PERSONA_HUES = [188, 172, 198, 212, 162, 152, 204, 178];
const FRIEND_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function isExpired(expiresAtMs: number, now: number = Date.now()): boolean {
  if (expiresAtMs === 0) return false;
  return expiresAtMs <= now;
}

export function getExpiryProgress(
  createdAtMs: number,
  expiresAtMs: number,
  now: number = Date.now()
): number {
  if (expiresAtMs === 0) return 1;
  const total = expiresAtMs - createdAtMs;
  if (total <= 0) return 0;
  const remaining = expiresAtMs - now;
  if (remaining <= 0) return 0;
  if (remaining >= total) return 1;
  return remaining / total;
}

export function formatRemainingTime(expiresAtMs: number, now: number = Date.now()): string {
  if (expiresAtMs === 0) return 'Saved';
  const diffMs = expiresAtMs - now;
  if (diffMs <= 0) return 'Expired';

  const totalSec = Math.ceil(diffMs / 1000);
  if (totalSec < 60) {
    return `${String(totalSec).padStart(2, '0')}s left`;
  }

  const totalMin = Math.floor(totalSec / 60);
  const remSec = totalSec % 60;
  if (totalMin < 60) {
    return `${String(totalMin).padStart(2, '0')}m ${String(remSec).padStart(2, '0')}s`;
  }

  const hours = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;
  return `${hours}h ${String(remMin).padStart(2, '0')}m`;
}

export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c * 10) / 10;
}

export function formatDistanceLabel(km: number): string {
  if (km < 0.05) return 'Right here';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function isValidCoordinates(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function formatCoordPair(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function validateLocationShareInput(input: {
  lat: number;
  lng: number;
  label: string;
}): { valid: boolean; error?: string } {
  if (!isValidCoordinates(input.lat, input.lng)) {
    return { valid: false, error: 'Coordinates must be valid latitude/longitude values.' };
  }
  const cleanLabel = input.label.trim();
  if (cleanLabel.length < 2 || cleanLabel.length > 80) {
    return { valid: false, error: 'Location label must be between 2 and 80 characters.' };
  }
  return { valid: true };
}

export function filterItemsByRadius<T extends { lat: number; lng: number }>(
  items: readonly T[],
  centerLat: number,
  centerLng: number,
  radiusKm: number
): (T & { distanceKm: number })[] {
  return items
    .map((item) => ({
      ...item,
      distanceKm: calculateDistanceKm(centerLat, centerLng, item.lat, item.lng),
    }))
    .filter((item) => item.distanceKm <= radiusKm);
}

export function computeViralScore(story: LocationStory, now: number = Date.now()): number {
  const ageMinutes = Math.max(0, (now - story.createdAtMs) / 60000);
  const engagement =
    story.boostCount * 3 + story.replyCount * 4 + story.shareCount * 3;
  return engagement + Math.max(0, 12 - ageMinutes * 0.2);
}

export function sortStoriesViral(
  stories: readonly LocationStory[],
  now: number = Date.now()
): LocationStory[] {
  return stories
    .filter((s) => !isExpired(s.expiresAtMs, now))
    .slice()
    .sort((a, b) => computeViralScore(b, now) - computeViralScore(a, now));
}

export function generateFriendCode(seedInput?: number): string {
  const chars: string[] = [];
  for (let i = 0; i < 8; i++) {
    const idx =
      typeof seedInput === 'number'
        ? Math.abs((seedInput * 37 + i * 19 + 7) % FRIEND_CODE_CHARS.length)
        : Math.floor(Math.random() * FRIEND_CODE_CHARS.length);
    chars.push(FRIEND_CODE_CHARS[idx]);
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`;
}

export function normalizeFriendCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  }
  return raw.trim().toUpperCase();
}

export function isValidFriendCode(raw: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizeFriendCode(raw));
}

export function getDeterministicPairId(
  uidA: string,
  uidB: string,
  prefix: 'fr' | 'fp' | 'dm'
): string {
  const [first, second] = uidA < uidB ? [uidA, uidB] : [uidB, uidA];
  return `${prefix}_${first}_${second}`;
}

export function generateAnonymousPersona(seedInput?: number): AnonymousIdentity {
  const rand = (max: number, offset: number) => {
    if (typeof seedInput === 'number') {
      return Math.abs((seedInput * 31 + offset * 17) % max);
    }
    return Math.floor(Math.random() * max);
  };

  const adj = ADJECTIVES[rand(ADJECTIVES.length, 1)];
  const animal = ANIMALS[rand(ANIMALS.length, 3)];
  const num = 10 + rand(89, 7);
  const hue = PERSONA_HUES[rand(PERSONA_HUES.length, 5)];
  const glyphIndex = rand(6, 11);
  const idSuffix =
    typeof seedInput === 'number'
      ? String(seedInput)
      : Math.random().toString(36).slice(2, 10);

  return {
    id: `anon_${idSuffix}`,
    handle: `${adj} ${animal} #${num}`,
    friendCode: generateFriendCode(seedInput),
    hue,
    glyphIndex,
  };
}

export function validateStoryInput(input: {
  headline: string;
  caption: string;
  ttlKey: string;
}): { valid: boolean; error?: string } {
  const headline = input.headline.trim();
  const caption = input.caption.trim();

  if (headline.length < 3) {
    return { valid: false, error: 'Add a short headline (at least 3 characters).' };
  }
  if (headline.length > 90) {
    return { valid: false, error: 'Keep the headline under 90 characters.' };
  }
  if (caption.length < 4) {
    return { valid: false, error: 'Share a quick note about what is happening here.' };
  }
  if (caption.length > 400) {
    return { valid: false, error: 'Story note must be 400 characters or fewer.' };
  }
  if (!(['5m', '30m', '2h', '24h'] as readonly string[]).includes(input.ttlKey)) {
    return { valid: false, error: 'Choose a valid expiration timer.' };
  }
  return { valid: true };
}

export function validateMessageInput(input: {
  text: string;
  ttlKey: string;
}): { valid: boolean; error?: string } {
  const text = input.text.trim();
  if (!text) {
    return { valid: false, error: 'Write a message before sending.' };
  }
  if (text.length > 280) {
    return { valid: false, error: 'Ephemeral messages are capped at 280 characters.' };
  }
  if (!(['30s', '2m', '10m', '1h'] as readonly string[]).includes(input.ttlKey)) {
    return { valid: false, error: 'Select a valid burn timer.' };
  }
  return { valid: true };
}

export function validatePrivateMessageInput(input: {
  text: string;
  ttlKey: string;
}): { valid: boolean; error?: string } {
  const text = input.text.trim();
  if (!text) {
    return { valid: false, error: 'Write a message before sending.' };
  }
  if (text.length > 400) {
    return { valid: false, error: 'Messages are capped at 400 characters.' };
  }
  if (!(['forever', '30s', '2m', '10m', '1h'] as readonly string[]).includes(input.ttlKey)) {
    return { valid: false, error: 'Select a valid timer option.' };
  }
  return { valid: true };
}

export function validateGroupChatInput(input: {
  name: string;
  memberCount: number;
}): { valid: boolean; error?: string } {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 48) {
    return { valid: false, error: 'Group name must be 2 to 48 characters.' };
  }
  if (input.memberCount < 1) {
    return { valid: false, error: 'Select at least 1 friend to start a group chat.' };
  }
  if (input.memberCount > 19) {
    return { valid: false, error: 'Group chats support up to 20 total members.' };
  }
  return { valid: true };
}

export function validateZoneInput(input: {
  name: string;
  neighborhood: string;
}): { valid: boolean; error?: string } {
  const name = input.name.trim();
  const neighborhood = input.neighborhood.trim();
  if (name.length < 2 || name.length > 48) {
    return { valid: false, error: 'Room name must be 2 to 48 characters.' };
  }
  if (neighborhood.length < 2 || neighborhood.length > 64) {
    return { valid: false, error: 'Neighborhood label must be 2 to 64 characters.' };
  }
  return { valid: true };
}

export function sanitizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('/src/assets/images/') && !trimmed.includes('..')) {
    return trimmed;
  }
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    if (trimmed.length <= 500_000) {
      return trimmed;
    }
  }
  return undefined;
}
