import { useState } from 'react';
import {
  Check,
  Copy,
  Hash,
  LogOut,
  MapPinPlus,
  MessageCircle,
  Plus,
  RefreshCw,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  AnonymousIdentity,
  LocationZone,
  UserChatRef,
  ZoneId,
} from '../types/drift.ts';
import { PersonaGlyph } from './PersonaGlyph.tsx';

interface DiscordSidebarProps {
  identity: AnonymousIdentity;
  zones: readonly LocationZone[];
  selectedZoneId: ZoneId;
  chatRefs: readonly UserChatRef[];
  activeChatId: string | null;
  pendingRequestCount: number;
  onSelectZone: (zoneId: ZoneId) => void;
  onSelectChat: (chatId: string) => void;
  onOpenCreateZone: () => void;
  onOpenCreateGroup: () => void;
  onOpenFriends: () => void;
  onRotateIdentity: () => void;
  onSignOut: () => void;
}

export function DiscordSidebar({
  identity,
  zones,
  selectedZoneId,
  chatRefs,
  activeChatId,
  pendingRequestCount,
  onSelectZone,
  onSelectChat,
  onOpenCreateZone,
  onOpenCreateGroup,
  onOpenFriends,
  onRotateIdentity,
  onSignOut,
}: DiscordSidebarProps) {
  const [codeCopied, setCodeCopied] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(identity.friendCode);
    } catch {
      // Ignore clipboard restriction
    }
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1800);
  };

  return (
    <aside
      aria-label="Rooms, direct messages, and groups"
      className="shader-panel rounded-2xl flex flex-col overflow-hidden h-[calc(100vh-7.5rem)] sticky top-20"
    >
      <div className="flex-1 overflow-y-auto p-3.5 space-y-5">
        {/* Direct Messages & Group Chats */}
        <section aria-label="Direct messages and group chats" className="space-y-1.5">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-xs font-semibold text-[#8EB3C2]">
              Private & Group Chats
            </span>
            <button
              type="button"
              onClick={onOpenCreateGroup}
              aria-label="Create group chat"
              title="New Group Chat"
              className="min-h-[28px] min-w-[28px] rounded-lg inline-flex items-center justify-center text-[#8EB3C2] hover:text-[#ECF7FA] hover:bg-sky-400/10 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenFriends}
            className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl flex items-center justify-between text-xs font-medium text-[#A7CBD8] hover:text-[#ECF7FA] hover:bg-sky-400/10 transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-teal-300" aria-hidden="true" />
              <span>Add Friends</span>
            </span>
            {pendingRequestCount > 0 && (
              <span className="font-mono tabular-nums text-[11px] font-semibold text-teal-300">
                {pendingRequestCount} pending
              </span>
            )}
          </button>

          {chatRefs.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-[#6B90A0] leading-relaxed">
              Add a friend to unlock 1-on-1 DMs and private group chats.
            </p>
          ) : (
            <div className="space-y-1">
              {chatRefs.map((chat) => {
                const isActive = activeChatId === chat.chatId;
                return (
                  <button
                    key={chat.chatId}
                    type="button"
                    onClick={() => onSelectChat(chat.chatId)}
                    className={`w-full px-2.5 py-2 rounded-xl flex items-center gap-2.5 text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-sky-500/20 to-teal-500/20 text-[#ECF7FA] border border-teal-400/25'
                        : 'text-[#A7CBD8] hover:bg-sky-400/10 hover:text-[#ECF7FA]'
                    }`}
                  >
                    {chat.kind === 'dm' && typeof chat.peerHue === 'number' ? (
                      <PersonaGlyph hue={chat.peerHue} size={28} />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-teal-400/15 border border-teal-300/25 flex items-center justify-center shrink-0">
                        {chat.kind === 'group' ? (
                          <Users className="w-3.5 h-3.5 text-teal-300" aria-hidden="true" />
                        ) : (
                          <MessageCircle className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
                        )}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">{chat.title}</div>
                      <div className="text-[11px] text-[#7398A8] truncate">
                        {chat.lastMessageText || (chat.kind === 'group' ? 'Group chat' : 'Direct chat')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Discord-style Neighborhood Channels */}
        <section aria-label="Neighborhood channels" className="space-y-1.5 pt-3 border-t border-sky-400/15">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-xs font-semibold text-[#8EB3C2]">
              Neighborhood Channels
            </span>
            <button
              type="button"
              onClick={onOpenCreateZone}
              aria-label="Create neighborhood room"
              title="New Neighborhood Channel"
              className="min-h-[28px] min-w-[28px] rounded-lg inline-flex items-center justify-center text-[#8EB3C2] hover:text-[#ECF7FA] hover:bg-sky-400/10 transition-colors cursor-pointer"
            >
              <MapPinPlus className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-1">
            {zones.map((zone) => {
              const isSelected = !activeChatId && selectedZoneId === zone.id;
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => onSelectZone(zone.id)}
                  className={`w-full min-h-[38px] px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-sky-500/20 to-teal-500/20 text-[#ECF7FA] border border-teal-400/25'
                      : 'text-[#8EB3C2] hover:bg-sky-400/10 hover:text-[#ECF7FA]'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <Hash className="w-3.5 h-3.5 text-teal-300/80 shrink-0" aria-hidden="true" />
                    <span className="text-xs font-medium truncate">{zone.name}</span>
                  </span>
                  {zone.activeCount > 0 && (
                    <span className="text-[11px] font-mono tabular-nums text-[#7398A8] shrink-0">
                      {zone.activeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Bottom Discord-Style User Identity Dock */}
      <div className="p-3 bg-[#050E17]/90 border-t border-sky-400/15 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <PersonaGlyph hue={identity.hue} size={32} label={identity.handle} />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#ECF7FA] truncate">
                {identity.handle}
              </div>
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="inline-flex items-center gap-1 text-[11px] font-mono text-teal-300 hover:text-teal-200 cursor-pointer"
                title="Copy your friend code"
              >
                <span>{codeCopied ? 'Copied code' : identity.friendCode}</span>
                {codeCopied ? (
                  <Check className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <Copy className="w-3 h-3" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onRotateIdentity}
              aria-label="Switch anonymous mask"
              title="New Mask"
              className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-[#8EB3C2] hover:text-[#ECF7FA] hover:bg-sky-400/10 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-[#8EB3C2] hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
