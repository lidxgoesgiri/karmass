// Original inline SVG icons (no icon-font or Reddit glyph dependencies).

export const BalanceCoreIcon = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <circle
      cx="16"
      cy="16"
      r="15"
      fill="none"
      stroke="#00F5A0"
      strokeOpacity="0.4"
      strokeWidth="1.5"
    />
    <path
      d="M16 5 L27 16 L16 27 L5 16 Z"
      fill="#141418"
      stroke="#FAFAFA"
      strokeWidth="2"
    />
    <circle cx="16" cy="16" r="3.6" fill="#00F5A0" />
  </svg>
);

export const SoundIcon = ({ muted }: { muted: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
    {muted ? (
      <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" />
    ) : (
      <path
        d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"
        strokeLinecap="round"
      />
    )}
  </svg>
);

export const CloseIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
  </svg>
);

export const Avatar = ({
  src,
  size = 32,
}: {
  src: string | null;
  size?: number;
}) =>
  src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  ) : (
    <BalanceCoreIcon size={size} />
  );
