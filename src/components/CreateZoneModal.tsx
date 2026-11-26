import { useEffect, useState, type FormEvent } from 'react';
import { LocateFixed, X } from 'lucide-react';
import { validateZoneInput } from '../utils/ephemeral.ts';

interface CreateZoneModalProps {
  open: boolean;
  defaultLat: number;
  defaultLng: number;
  usingGps: boolean;
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    neighborhood: string;
    lat: number;
    lng: number;
  }) => Promise<void>;
}

export function CreateZoneModal({
  open,
  defaultLat,
  defaultLng,
  usingGps,
  onClose,
  onCreate,
}: CreateZoneModalProps) {
  const [name, setName] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const check = validateZoneInput({ name, neighborhood });
    if (!check.valid) {
      setError(check.error ?? 'Enter a valid room name and neighborhood.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onCreate({
        name: name.trim(),
        neighborhood: neighborhood.trim(),
        lat: defaultLat,
        lng: defaultLng,
      });
      setName('');
      setNeighborhood('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create room.');
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
        aria-labelledby="create-zone-title"
        className="w-full sm:max-w-md shader-panel rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-sky-400/15 flex items-center justify-between gap-4">
          <div>
            <h2 id="create-zone-title" className="font-display text-lg font-bold text-[#ECF7FA]">
              Start Local Room
            </h2>
            <p className="text-xs text-[#8EB3C2] mt-0.5">
              Open a live story & whisper channel for people near your location
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close room creator"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#8EB3C2] hover:bg-sky-400/10 hover:text-[#ECF7FA] cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs text-[#A7CBD8] shader-surface rounded-xl px-3.5 py-2.5">
            <LocateFixed className="w-4 h-4 text-teal-300 shrink-0" aria-hidden="true" />
            <span>
              {usingGps
                ? `Anchored to your live GPS (${defaultLat.toFixed(3)}, ${defaultLng.toFixed(3)})`
                : `Anchored near current coordinates (${defaultLat.toFixed(3)}, ${defaultLng.toFixed(3)})`}
            </span>
          </div>

          <div>
            <label
              htmlFor="zone-name-input"
              className="block text-xs font-semibold text-[#A7CBD8] mb-1.5"
            >
              Room Name
            </label>
            <input
              id="zone-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={48}
              placeholder="e.g., Williamsburg Waterfront"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-sky-400/20 bg-[#050C14]/85 text-sm text-[#ECF7FA] placeholder:text-[#5F8496] focus:outline-none focus:border-teal-400"
            />
          </div>

          <div>
            <label
              htmlFor="zone-neighborhood-input"
              className="block text-xs font-semibold text-[#A7CBD8] mb-1.5"
            >
              Cross-Street or Landmark
            </label>
            <input
              id="zone-neighborhood-input"
              type="text"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              maxLength={64}
              placeholder="e.g., Bedford & N 7th"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-sky-400/20 bg-[#050C14]/85 text-sm text-[#ECF7FA] placeholder:text-[#5F8496] focus:outline-none focus:border-teal-400"
            />
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
              disabled={saving}
              className="min-h-[44px] px-5 py-2 rounded-xl shader-btn-primary disabled:opacity-60 text-sm font-semibold cursor-pointer"
            >
              {saving ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
