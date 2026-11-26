import { useEffect, useState } from 'react';
import { Check, Copy, MessageCircle, Send, Users, X } from 'lucide-react';
import type { LocationStory, UserChatRef } from '../types/drift.ts';
import { PersonaGlyph } from './PersonaGlyph.tsx';

interface ShareStoryToChatModalProps {
  story: LocationStory | null;
  chatRefs: readonly UserChatRef[];
  onClose: () => void;
  onCopyLink: (story: LocationStory) => void;
  onSendToChat: (story: LocationStory, chatId: string, note: string) => Promise<void>;
}

export function ShareStoryToChatModal({
  story,
  chatRefs,
  onClose,
  onCopyLink,
  onSendToChat,
}: ShareStoryToChatModalProps) {
  const [note, setNote] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!story) return;
    setSentIds([]);
    setNote('');
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [story, onClose]);

  if (!story) return null;

  const handleSend = async (chatId: string) => {
    setSendingId(chatId);
    try {
      await onSendToChat(story, chatId, note.trim() || `Check this drop in ${story.zoneName}`);
      setSentIds((prev) => [...prev, chatId]);
    } finally {
      setSendingId(null);
    }
  };

  const handleCopy = () => {
    onCopyLink(story);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-story-title"
        className="w-full sm:max-w-md shader-panel rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-sky-400/15 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 id="share-story-title" className="font-display text-lg font-bold text-[#ECF7FA] truncate">
              Send Story to Chat
            </h2>
            <p className="text-xs text-[#8EB3C2] truncate mt-0.5">{story.headline}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#8EB3C2] hover:bg-sky-400/10 hover:text-[#ECF7FA] cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="share-note-input" className="sr-only">
              Optional message note
            </label>
            <input
              id="share-note-input"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={140}
              placeholder="Write a quick note to send with this story..."
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-sky-400/20 bg-[#050C14]/85 text-sm text-[#ECF7FA] placeholder:text-[#5F8496] focus:outline-none focus:border-teal-400"
            />
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {chatRefs.length === 0 ? (
              <p className="text-xs text-[#8EB3C2] py-4 text-center">
                No friend DMs or group chats yet. Copy the link below or add friends in the Friends tab.
              </p>
            ) : (
              chatRefs.map((chat) => {
                const isSent = sentIds.includes(chat.chatId);
                return (
                  <div
                    key={chat.chatId}
                    className="shader-surface rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
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
                      <span className="text-xs font-semibold text-[#ECF7FA] truncate">
                        {chat.title}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isSent || sendingId === chat.chatId}
                      onClick={() => void handleSend(chat.chatId)}
                      className={`inline-flex items-center gap-1 min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        isSent
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'shader-btn-primary disabled:opacity-50'
                      }`}
                    >
                      {isSent ? (
                        <>
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Sent</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{sendingId === chat.chatId ? 'Sending...' : 'Send'}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-sky-400/20 hover:bg-sky-400/10 text-xs font-semibold text-[#ECF7FA] inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" aria-hidden="true" />
                <span>Share Link Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" aria-hidden="true" />
                <span>Copy External Share Link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
