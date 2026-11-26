interface PersonaGlyphProps {
  hue: number;
  size?: number;
  label?: string;
}

export function PersonaGlyph({ hue, size = 28, label }: PersonaGlyphProps) {
  const bg = `hsla(${hue}, 62%, 18%, 0.95)`;
  const fg = `hsl(${hue}, 78%, 68%)`;
  const accent = `hsl(${(hue + 34) % 360}, 82%, 62%)`;

  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0 border border-sky-300/20"
      style={{ width: size, height: size, backgroundColor: bg }}
      aria-label={label ? `${label} avatar` : undefined}
      aria-hidden={label ? undefined : true}
    >
      <svg
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.6)}
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle cx="12" cy="9" r="4" fill={fg} />
        <path
          d="M5 19.5C5.9 15.9 8.7 14 12 14C15.3 14 18.1 15.9 19 19.5"
          stroke={fg}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="17.5" cy="6.5" r="2.2" fill={accent} />
      </svg>
    </span>
  );
}
