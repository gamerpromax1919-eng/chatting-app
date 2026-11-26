import { useEffect, useState, type FormEvent } from 'react';
import { Check, Users, X } from 'lucide-react';
import type { FriendSummary } from '../types/drift.ts';
import { validateGroupChatInput } from '../utils/ephemeral.ts';
import { PersonaGlyph } from './PersonaGlyph.tsx';

interface CreateGroupModalProps {
  open: boolean;
  friends: readonly FriendSummary[];
  onClose: () => void;
  onCreateGroup: (name: string, selectedFriends: FriendSummary[]) => Promise<void>;
}

export function CreateGroupModal({
  open,
  friends,
  onClose,
  onCreateGroup,
}: CreateGroupModalProps) {
  const [name, setName] = useState('');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const toggleFriend = (uid: string) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const check = validateGroupChatInput({
      name,
      memberCount: selectedUids.length,
    });
    if (!check.valid) {
      setError(check.error ?? 'Choose a group name and at least 1 friend.');
      return;
    }

    const picked = friends.filter((f) => selectedUids.includes(f.uid));
    setError(null);
    setSaving(true);
    try {
      await onCreateGroup(name.trim(), picked);
      setName('');
      setSelectedUids([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group chat.');
    } finally {
      setSaving(false);
    }
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
        aria-labelledby="create-group-title"
        className="w-full sm:max-w-md shader-panel rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-sky-400/15 flex items-center justify-between gap-4">
          <div>
            <h2 id="create-group-title" className="font-display text-lg font-bold text-[#ECF7FA]">
              New Group Chat
            </h2>
            <p className="text-xs text-[#8EB3C2] mt-0.5">
              Invite confirmed friends into a private group channel
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close group creator"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#8EB3C2] hover:bg-sky-400/10 hover:text-[#ECF7FA] cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label
              htmlFor="group-name-input"
              className="block text-xs font-semibold text-[#A7CBD8] mb-1.5"
            >
              Group Name
            </label>
            <input
              id="group-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={48}
              placeholder="e.g., Friday Rooftop Crew"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-sky-400/20 bg-[#050C14]/85 text-sm text-[#ECF7FA] placeholder:text-[#5F8496] focus:outline-none focus:border-teal-400"
            />
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold text-[#A7CBD8]">
              Select Friends ({selectedUids.length} selected)
            </span>

            {friends.length === 0 ? (
              <div className="shader-surface rounded-xl p-4 text-center text-xs text-[#8EB3C2]">
                Add at least one friend first from the Friends tab before starting a group chat.
              </div>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                {friends.map((friend) => {
                  const selected = selectedUids.includes(friend.uid);
                  return (
                    <button
                      key={friend.uid}
                      type="button"
                      onClick={() => toggleFriend(friend.uid)}
                      aria-pressed={selected}
                      className={`w-full px-3 py-2.5 rounded-xl border flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        selected
                          ? 'border-teal-400/40 bg-teal-400/15 text-[#ECF7FA]'
                          : 'border-sky-400/15 bg-[#050C14]/60 text-[#A7CBD8] hover:bg-sky-400/10'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <PersonaGlyph hue={friend.hue} size={28} />
                        <span className="text-xs font-semibold truncate">{friend.handle}</span>
                      </span>
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                          selected
                            ? 'border-teal-300 bg-teal-400 text-slate-950'
                            : 'border-sky-400/30'
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-rose-400">
              {error}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-sky-400/20 text-sm font-medium text-[#A7CBD8] hover:bg-sky-400/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || friends.length === 0}
              className="min-h-[44px] px-5 py-2 rounded-xl shader-btn-primary disabled:opacity-50 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-4 h-4" aria-hidden="true" />
              <span>{saving ? 'Creating...' : 'Create Group'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
