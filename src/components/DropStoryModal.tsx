import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';
import type {
  LocationZone,
  StoryTtlKey,
  StoryVibe,
  ZoneId,
} from '../types/drift.ts';
import {
  PRESET_BACKDROPS,
  STORY_TTL_OPTIONS,
  STORY_VIBES,
  validateStoryInput,
} from '../utils/ephemeral.ts';

interface DropStoryModalProps {
  open: boolean;
  zones: readonly LocationZone[];
  defaultZoneId: ZoneId;
  onClose: () => void;
  onPublish: (payload: {
    zoneId: ZoneId;
    headline: string;
    caption: string;
    vibe: StoryVibe;
    ttlKey: StoryTtlKey;
    imageUrl?: string;
  }) => Promise<void>;
}

async function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const maxDim = 960;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        if (dataUrl.length > 480_000) {
          resolve(canvas.toDataURL('image/jpeg', 0.58));
        } else {
          resolve(dataUrl);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function DropStoryModal({
  open,
  zones,
  defaultZoneId,
  onClose,
  onPublish,
}: DropStoryModalProps) {
  const [zoneId, setZoneId] = useState<ZoneId>(defaultZoneId);
  const [headline, setHeadline] = useState('');
  const [caption, setCaption] = useState('');
  const [vibe, setVibe] = useState<StoryVibe>('Happening Now');
  const [ttlKey, setTtlKey] = useState<StoryTtlKey>('30m');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setZoneId(defaultZoneId);
  }, [defaultZoneId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Please upload a PNG, JPEG, or WebP image.');
      return;
    }
    try {
      const compressed = await compressImageFile(file);
      setImageUrl(compressed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process image.');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const check = validateStoryInput({ headline, caption, ttlKey });
    if (!check.valid) {
      setError(check.error ?? 'Please complete all required fields.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onPublish({
        zoneId,
        headline: headline.trim(),
        caption: caption.trim(),
        vibe,
        ttlKey,
        imageUrl: imageUrl || undefined,
      });
      setHeadline('');
      setCaption('');
      setImageUrl('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish story.');
    } finally {
      setSubmitting(false);
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
        aria-labelledby="drop-story-title"
        className="w-full sm:max-w-xl shader-panel rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-sky-400/15 flex items-center justify-between gap-4">
          <div>
            <h2 id="drop-story-title" className="font-display text-lg font-bold text-[#ECF7FA]">
              Drop Anonymous Story
            </h2>
            <p className="text-xs text-[#8EB3C2] mt-0.5">
              Visible to verified people nearby and expires automatically
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close story composer"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#8EB3C2] hover:bg-sky-400/10 hover:text-[#ECF7FA] cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="story-zone-select"
                className="block text-xs font-semibold text-[#A7CBD8] mb-1.5"
              >
                Neighborhood Pin
              </label>
              <select
                id="story-zone-select"
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value as ZoneId)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-sky-400/20 bg-[#050C14]/85 text-sm text-[#ECF7FA] focus:outline-none focus:border-teal-400"
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id} className="bg-[#050C14] text-[#ECF7FA]">
                    {z.name} ({z.neighborhood})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs font-semibold text-[#A7CBD8] mb-1.5">
                Expires In
              </span>
              <div
                role="group"
                aria-label="Story expiration timer"
                className="grid grid-cols-4 gap-1 p-1 bg-[#050C14]/85 border border-sky-400/15 rounded-xl"
              >
                {STORY_TTL_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setTtlKey(opt.key)}
                    className={`min-h-[34px] rounded-lg text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                      ttlKey === opt.key
                        ? 'bg-teal-400/20 text-teal-200 font-semibold'
                        : 'text-[#8EB3C2] hover:text-[#ECF7FA]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-[#A7CBD8] mb-1.5">
              Vibe
            </span>
            <div className="flex flex-wrap gap-1.5">
              {STORY_VIBES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVibe(v)}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    vibe === v
                      ? 'bg-teal-400/20 text-teal-200 border border-teal-400/35'
                      : 'bg-[#050C14]/75 border border-sky-400/15 text-[#8EB3C2] hover:text-[#ECF7FA]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="story-headline-input"
              className="block text-xs font-semibold text-[#A7CBD8] mb-1.5"
            >
              Headline
            </label>
            <input
              id="story-headline-input"
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={90}
              placeholder="e.g., Brass quintet setting up by the fountain right now"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-sky-400/20 bg-[#050C14]/85 text-sm text-[#ECF7FA] placeholder:text-[#5F8496] focus:outline-none focus:border-teal-400"
            />
          </div>

          <div>
            <label
              htmlFor="story-caption-input"
              className="block text-xs font-semibold text-[#A7CBD8] mb-1.5"
            >
              Details for neighbors
            </label>
            <textarea
              id="story-caption-input"
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={400}
              placeholder="Share where to enter, what the crowd looks like, or any quick tip..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-sky-400/20 bg-[#050C14]/85 text-sm text-[#ECF7FA] placeholder:text-[#5F8496] focus:outline-none focus:border-teal-400 resize-none"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#A7CBD8]">
                Photo (optional)
              </span>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="text-xs font-medium text-[#8EB3C2] hover:text-[#ECF7FA] cursor-pointer"
                >
                  Remove photo
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border border-sky-400/20 bg-[#050C14]/80 hover:bg-sky-400/10 text-xs font-medium text-[#CBE4EE] cursor-pointer">
                <ImagePlus className="w-4 h-4 text-teal-300" aria-hidden="true" />
                <span>Upload Snap</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void handleFileUpload(e)}
                  className="sr-only"
                />
              </label>

              {PRESET_BACKDROPS.map((preset) => (
                <button
                  key={preset.url}
                  type="button"
                  onClick={() => setImageUrl(preset.url)}
                  className={`min-h-[36px] px-2.5 py-1 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                    imageUrl === preset.url
                      ? 'border-teal-400/40 bg-teal-400/20 text-teal-200'
                      : 'border-sky-400/20 bg-[#050C14]/75 text-[#8EB3C2] hover:text-[#ECF7FA]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {imageUrl && (
              <div className="w-full aspect-[16/9] rounded-xl overflow-hidden bg-[#050C14] border border-sky-400/20">
                <img
                  src={imageUrl}
                  alt="Selected story preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
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
              disabled={submitting}
              className="min-h-[44px] px-5 py-2 rounded-xl shader-btn-primary disabled:opacity-60 text-sm font-semibold transition-colors cursor-pointer"
            >
              {submitting ? 'Publishing...' : 'Publish Story'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
