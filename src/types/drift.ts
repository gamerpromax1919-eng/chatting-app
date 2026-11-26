export type ZoneId = string;

export type StoryTtlKey = '5m' | '30m' | '2h' | '24h';
export type MessageTtlKey = '30s' | '2m' | '10m' | '1h';
export type PrivateTtlKey = 'forever' | MessageTtlKey;
export type TtlKey = StoryTtlKey | MessageTtlKey;

export type StoryVibe =
  | 'Happening Now'
  | 'Food & Pop-up'
  | 'Street Music'
  | 'Secret Spot'
  | 'Heads Up';

export type NavSection = 'feed' | 'messages' | 'friends' | 'radar' | 'pulse';

export type EmojiKey = 'fire' | 'eyes' | 'hundred' | 'bolt';

export interface ReactionCounts {
  fire: number;
  eyes: number;
  hundred: number;
  bolt: number;
}

export interface LocationZone {
  id: ZoneId;
  name: string;
  neighborhood: string;
  lat: number;
  lng: number;
  activeCount: number;
  isCustom?: boolean;
}

export interface AnonymousIdentity {
  id: string;
  handle: string;
  friendCode: string;
  hue: number;
  glyphIndex: number;
}

export interface PublicDirectoryUser {
  uid: string;
  handle: string;
  friendCode: string;
  hue: number;
  glyphIndex: number;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromHandle: string;
  fromHue: number;
  toUid: string;
  toHandle: string;
  toHue: number;
  participants: string[];
  status: FriendRequestStatus;
  createdAtMs: number;
}

export interface Friendship {
  id: string;
  requestId: string;
  uidA: string;
  handleA: string;
  hueA: number;
  uidB: string;
  handleB: string;
  hueB: number;
  participants: string[];
  acceptedBy: string;
}

export interface FriendSummary {
  friendshipId: string;
  uid: string;
  handle: string;
  hue: number;
}

export type ChatKind = 'dm' | 'group';

export interface UserChatRef {
  chatId: string;
  uid: string;
  kind: ChatKind;
  title: string;
  peerUid?: string;
  peerHandle?: string;
  peerHue?: number;
  lastMessageText?: string;
  lastMessageAtMs: number;
}

export interface ChatRoom {
  id: string;
  kind: ChatKind;
  name: string;
  createdBy: string;
  memberIds: string[];
  lastMessageText?: string;
  lastMessageAtMs: number;
}

export interface ChatMember {
  uid: string;
  chatId: string;
  handle: string;
  hue: number;
  role: 'owner' | 'member';
  visibleTo: string[];
}

export interface PrivateChatMessage {
  id: string;
  chatId: string;
  authorId: string;
  authorHandle: string;
  authorHue: number;
  text: string;
  ttlKey: PrivateTtlKey;
  burnOnRead: boolean;
  memberIds: string[];
  createdAtMs: number;
  expiresAtMs: number;
  reactionCounts: ReactionCounts;
  sharedStoryId?: string;
  sharedStoryHeadline?: string;
  sharedStoryZoneName?: string;
  locationLat?: number;
  locationLng?: number;
  locationLabel?: string;
  locationIsLive?: boolean;
}

export interface PresenceUser {
  uid: string;
  handle: string;
  hue: number;
  zoneId: ZoneId;
  lat: number;
  lng: number;
  isLiveLocation?: boolean;
  accuracyMeters?: number;
  lastSeenMs: number;
}

export interface StoryReply {
  id: string;
  storyId: string;
  authorId: string;
  authorHandle: string;
  authorHue: number;
  text: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface LocationStory {
  id: string;
  zoneId: ZoneId;
  zoneName: string;
  lat: number;
  lng: number;
  authorId: string;
  authorHandle: string;
  authorHue: number;
  headline: string;
  caption: string;
  imageUrl?: string;
  vibe: StoryVibe;
  createdAtMs: number;
  expiresAtMs: number;
  boostCount: number;
  shareCount: number;
  replyCount: number;
}

export interface EphemeralMessage {
  id: string;
  zoneId: ZoneId;
  authorId: string;
  authorHandle: string;
  authorHue: number;
  text: string;
  createdAtMs: number;
  expiresAtMs: number;
  ttlKey: MessageTtlKey;
  burnOnRead: boolean;
  reactionCounts: ReactionCounts;
  replyToStoryId?: string;
  replyToHeadline?: string;
  locationLat?: number;
  locationLng?: number;
  locationLabel?: string;
  locationIsLive?: boolean;
}

export interface FocusedMapTarget {
  lat: number;
  lng: number;
  label: string;
  uid?: string;
  storyId?: string;
  kind: 'person' | 'story' | 'pin';
}

export interface PulseHighlight {
  title: string;
  summary: string;
  relatedStoryId?: string;
}

export interface PulseAnalysisResponse {
  answer: string;
  highlights: PulseHighlight[];
  confidenceNote: string;
  analyzedStoriesCount: number;
  analyzedMessagesCount: number;
}
