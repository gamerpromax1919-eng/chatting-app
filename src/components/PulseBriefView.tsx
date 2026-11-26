import { useState, type FormEvent } from 'react';
import { Activity, ArrowUpRight, Loader2 } from 'lucide-react';
import type {
  EphemeralMessage,
  LocationStory,
  LocationZone,
  PulseAnalysisResponse,
  ZoneId,
} from '../types/drift.ts';

interface PulseBriefViewProps {
  zones: readonly LocationZone[];
  selectedZoneId: ZoneId;
  stories: readonly LocationStory[];
  messages: readonly EphemeralMessage[];
  onOpenStoryById: (storyId: string) => void;
}

const SUGGESTED_PROMPTS = [
  'Cross-reference all live stories and whispers—where is the biggest crowd gathering right now and why?',
  'Separate confirmed on-the-ground sightings from unconfirmed rumors across the neighborhoods.',
  'Plan a 2-hour spontaneous local route hitting the highest-rated expiring spots before they close.',
] as const;

export function PulseBriefView({
  zones,
  selectedZoneId,
  stories,
  messages,
  onOpenStoryById,
}: PulseBriefViewProps) {
  const [query, setQuery] = useState('');
  const [scopeZone, setScopeZone] = useState<'all' | ZoneId>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PulseAnalysisResponse | null>(null);

  const runAnalysis = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (trimmed.length < 4) {
      setError('Enter a question of at least 4 characters.');
      return;
    }

    const now = Date.now();
    const scopedStories = stories
      .filter((s) => scopeZone === 'all' || s.zoneId === scopeZone)
      .slice(0, 40)
      .map((s) => ({
        id: s.id,
        zone: s.zoneName,
        vibe: s.vibe,
        headline: s.headline,
        caption: s.caption,
        boostCount: s.boostCount,
        replyCount: s.replyCount,
        minutesRemaining: Math.max(1, Math.round((s.expiresAtMs - now) / 60000)),
      }));

    const scopedWhispers = messages
      .filter((m) => !m.burnOnRead && (scopeZone === 'all' || m.zoneId === scopeZone))
      .slice(0, 50)
      .map((m) => ({
        zone: zones.find((z) => z.id === m.zoneId)?.name ?? m.zoneId,
        text: m.text,
        reactions: m.reactionCounts,
      }));

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pulse/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          scopeLabel:
            scopeZone === 'all'
              ? 'All local neighborhoods'
              : zones.find((z) => z.id === scopeZone)?.name ?? scopeZone,
          stories: scopedStories,
          whispers: scopedWhispers,
        }),
      });
      const data = (await res.json()) as PulseAnalysisResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Analysis request failed.');
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to synthesize local pulse.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runAnalysis(query);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Query Panel */}
      <section className="lg:col-span-5 shader-panel rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="font-display text-xl font-bold text-[#ECF7FA]">
            Local Pulse Brief
          </h2>
          <p className="text-sm text-[#8EB3C2] mt-1 leading-relaxed">
            Deep multi-story synthesis across {stories.length} live neighborhood drops and{' '}
            {messages.filter((m) => !m.burnOnRead).length} active whispers.
          </p>
        </div>

        <div>
          <span className="block text-xs font-semibold text-[#A7CBD8] mb-2">
            Analysis Scope
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setScopeZone('all')}
              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                scopeZone === 'all'
                  ? 'bg-teal-400/20 text-teal-200 border border-teal-400/30 font-semibold'
                  : 'bg-[#050C14]/70 border border-sky-400/15 text-[#8EB3C2] hover:text-[#ECF7FA]'
              }`}
            >
              All Zones
            </button>
            {zones.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => setScopeZone(z.id)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  scopeZone === z.id
                    ? 'bg-teal-400/20 text-teal-200 border border-teal-400/30 font-semibold'
                    : 'bg-[#050C14]/70 border border-sky-400/15 text-[#8EB3C2] hover:text-[#ECF7FA]'
                }`}
              >
                {z.name}
                {z.id === selectedZoneId ? ' (Current)' : ''}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label
            htmlFor="pulse-query-input"
            className="block text-xs font-semibold text-[#A7CBD8]"
          >
            Ask a complex local question
          </label>
          <textarea
            id="pulse-query-input"
            rows={3}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., Which neighborhood has the best live energy for the next 90 minutes?"
            className="w-full px-3.5 py-2.5 rounded-xl border border-sky-400/20 bg-[#050C14]/85 text-sm text-[#ECF7FA] placeholder:text-[#5F8496] focus:outline-none focus:border-teal-400 resize-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl shader-btn-primary disabled:opacity-60 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Synthesizing neighborhood pulse...</span>
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" aria-hidden="true" />
                <span>Analyze Local Pulse</span>
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-sky-400/15 space-y-2">
          <span className="block text-xs font-semibold text-[#A7CBD8]">
            Quick Deep Queries
          </span>
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={loading}
              onClick={() => {
                setQuery(prompt);
                void runAnalysis(prompt);
              }}
              className="w-full text-left px-3.5 py-2.5 rounded-xl shader-surface hover:border-teal-400/35 text-xs text-[#CBE4EE] leading-relaxed transition-colors cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      </section>

      {/* Output Panel */}
      <section className="lg:col-span-7 shader-panel rounded-2xl p-6 min-h-[420px] flex flex-col">
        {error && (
          <div
            role="alert"
            className="mb-4 p-4 rounded-xl border border-rose-500/30 bg-rose-950/40 text-sm text-rose-200"
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <Loader2 className="w-7 h-7 text-teal-300 animate-spin mb-3" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#ECF7FA]">
              Cross-referencing active stories and whispers
            </p>
            <p className="text-xs text-[#8EB3C2] mt-1 max-w-sm">
              Deep reasoning is weighing corroboration, expiration timers, and crowd momentum.
            </p>
          </div>
        )}

        {!loading && !result && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-6">
            <Activity className="w-7 h-7 text-teal-300/70 mb-3" aria-hidden="true" />
            <h3 className="font-display text-lg font-bold text-[#ECF7FA]">
              Ready to synthesize what is happening around you
            </h3>
            <p className="text-sm text-[#8EB3C2] mt-1.5 max-w-md">
              Pick one of the deep queries or ask your own question to distill live drops
              from real neighbors into clear local intelligence.
            </p>
          </div>
        )}

        {!loading && result && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-sky-400/15">
              <h3 className="font-display text-lg font-bold text-[#ECF7FA]">
                Neighborhood Synthesis
              </h3>
              <span className="text-xs font-mono tabular-nums text-teal-300">
                {result.analyzedStoriesCount} stories · {result.analyzedMessagesCount} whispers
              </span>
            </div>

            <p className="text-base text-[#E2F3F8] leading-relaxed">{result.answer}</p>

            {result.highlights.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-[#8EB3C2]">
                  Key Grounded Signals
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  {result.highlights.map((item, idx) => (
                    <div
                      key={`${item.title}-${idx}`}
                      className="p-4 rounded-xl shader-surface flex items-start justify-between gap-4"
                    >
                      <div>
                        <div className="text-sm font-semibold text-[#ECF7FA]">
                          {item.title}
                        </div>
                        <p className="text-xs text-[#A7CBD8] mt-1 leading-relaxed">
                          {item.summary}
                        </p>
                      </div>
                      {item.relatedStoryId && (
                        <button
                          type="button"
                          onClick={() => onOpenStoryById(item.relatedStoryId!)}
                          className="inline-flex items-center gap-1 min-h-[34px] px-3 py-1 rounded-lg border border-sky-400/25 bg-sky-400/15 hover:bg-sky-400/25 text-xs font-semibold text-[#ECF7FA] whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <span>View Story</span>
                          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-[#8EB3C2] pt-3 border-t border-sky-400/15">
              {result.confidenceNote}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
