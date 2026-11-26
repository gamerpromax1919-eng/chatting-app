import { Compass, Lock, MessageSquare, Users } from 'lucide-react';
import { ShaderBackdrop } from './ShaderBackdrop.tsx';

interface AuthLandingProps {
  loading: boolean;
  error: string | null;
  onSignInWithGoogle: () => void;
}

export function AuthLanding({
  loading,
  error,
  onSignInWithGoogle,
}: AuthLandingProps) {
  return (
    <div className="min-h-screen relative isolate flex flex-col text-[#ECF7FA]">
      <ShaderBackdrop />

      <header className="relative z-10 bg-[#06111B]/70 backdrop-blur-xl border-b border-sky-400/15">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <span className="font-display text-2xl font-bold tracking-tight shader-accent-text whitespace-nowrap shrink-0">
            Drift
          </span>
          <nav
            aria-label="Overview"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#8EB3C2]"
          >
            <a href="#how-it-works" className="hover:text-[#ECF7FA] whitespace-nowrap">
              Stories & Rooms
            </a>
            <a href="#friends" className="hover:text-[#ECF7FA] whitespace-nowrap">
              Friends & Groups
            </a>
          </nav>
          <button
            type="button"
            onClick={onSignInWithGoogle}
            disabled={loading}
            className="min-h-[40px] px-4 py-2 rounded-xl shader-btn-primary disabled:opacity-60 text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Continue with Google'}
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-6 space-y-6">
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#ECF7FA] text-balance leading-[1.1]">
            Instagram stories meet{' '}
            <span className="shader-accent-text">Discord rooms & group chats.</span>
          </h1>
          <p className="text-base sm:text-lg text-[#9CC0CE] leading-relaxed max-w-xl">
            Drop expiring neighborhood stories, talk live in local channels, add real
            friends by code, and spin up private 1-on-1 DMs or group chats.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              type="button"
              onClick={onSignInWithGoogle}
              disabled={loading}
              className="min-h-[48px] px-6 py-3 rounded-xl shader-btn-primary disabled:opacity-60 text-sm font-semibold inline-flex items-center gap-3 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#03151E"
                  d="M21.35 11.1h-9.17v2.98h5.27c-.23 1.24-.92 2.29-1.97 3v2.49h3.18c1.86-1.71 2.93-4.24 2.93-7.24 0-.42-.04-.83-.24-1.23z"
                />
                <path
                  fill="#03151E"
                  d="M12.18 21.5c2.66 0 4.89-.88 6.52-2.38l-3.18-2.49c-.88.59-2.01.94-3.34.94-2.57 0-4.75-1.74-5.53-4.08H3.36v2.57A9.82 9.82 0 0 0 12.18 21.5z"
                />
                <path
                  fill="#03151E"
                  d="M6.65 13.49a5.9 5.9 0 0 1 0-3.78V7.14H3.36a9.82 9.82 0 0 0 0 8.92l3.29-2.57z"
                />
                <path
                  fill="#03151E"
                  d="M12.18 6.08c1.45 0 2.75.5 3.77 1.48l2.83-2.83C17.06 3.12 14.84 2.15 12.18 2.15A9.82 9.82 0 0 0 3.36 7.14l3.29 2.57c.78-2.34 2.96-3.63 5.53-3.63z"
                />
              </svg>
              <span>{loading ? 'Connecting...' : 'Continue with Google'}</span>
            </button>
          </div>

          {error && (
            <p role="alert" className="text-sm text-rose-400 font-medium">
              {error}
            </p>
          )}

          <div
            id="friends"
            className="pt-5 border-t border-sky-400/15 grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs text-[#8EB3C2]"
          >
            <div className="space-y-1">
              <div className="font-semibold text-[#ECF7FA] inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-teal-300" aria-hidden="true" />
                <span>Friends & Groups</span>
              </div>
              <p>Add friends with a code or from rooms, then open DMs and group chats.</p>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-[#ECF7FA] inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
                <span>Private Email</span>
              </div>
              <p>Your Google account details never appear in public feeds or rooms.</p>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-[#ECF7FA] inline-flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
                <span>Local Channels</span>
              </div>
              <p>Join nearby channels or forward stories directly into friend chats.</p>
            </div>
          </div>
        </div>

        <div id="how-it-works" className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="shader-panel rounded-2xl overflow-hidden">
            <div className="aspect-[4/3] bg-slate-900">
              <img
                src="/src/assets/images/story_rooftop_espresso_1795624615247.jpg"
                alt="Rooftop neighborhood coffee spot"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-4">
              <div className="text-xs font-mono text-teal-300">30m · Local Story Ring</div>
              <div className="font-display font-bold text-[#ECF7FA] mt-1">
                Instagram-Style Stories
              </div>
              <p className="text-xs text-[#8EB3C2] mt-1">
                Drop expiring spots and forward highlights directly into friend DMs.
              </p>
            </div>
          </div>

          <div className="shader-panel rounded-2xl overflow-hidden">
            <div className="aspect-[4/3] bg-slate-900">
              <img
                src="/src/assets/images/story_alley_vinyl_1795624616848.jpg"
                alt="Evening street vinyl market"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-4">
              <div className="text-xs font-mono text-sky-300 inline-flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
                <span>Channels · DMs · Groups</span>
              </div>
              <div className="font-display font-bold text-[#ECF7FA] mt-1">
                Discord-Style Rooms & DMs
              </div>
              <p className="text-xs text-[#8EB3C2] mt-1">
                Switch effortlessly between neighborhood channels, private DMs, and groups.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
