// Minimal line icons, drawn on a 24px grid with a 1.75 stroke.
const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  // Never let a flex parent squeeze an icon (e.g. the narrow side rail).
  className: "shrink-0",
};

export const HomeIcon = () => (
  <svg {...base}><path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" /></svg>
);
export const LiveIcon = () => (
  <svg {...base}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="m8 2.5 4 3.5 4-3.5" /></svg>
);
export const FilmIcon = () => (
  <svg {...base}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 3v18M16 3v18M4 8h4M4 16h4M16 8h4M16 16h4" /></svg>
);
export const SeriesIcon = () => (
  <svg {...base}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M6 4h12" /></svg>
);
export const SearchIcon = () => (
  <svg {...base}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
);
export const PlayIcon = () => (
  <svg {...base} fill="currentColor" stroke="none"><path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.4-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5" /></svg>
);
export const PauseIcon = () => (
  <svg {...base} fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
);
export const BackIcon = () => (
  <svg {...base}><path d="M15 5 8 12l7 7" /></svg>
);
export const PlusIcon = () => (
  <svg {...base}><path d="M12 5v14M5 12h14" /></svg>
);
export const GridIcon = () => (
  <svg {...base}><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></svg>
);
export const SettingsIcon = () => (
  <svg {...base}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
export const TvGlyph = () => (
  <svg {...base}><rect x="3" y="5" width="18" height="12" rx="2.5" /><path d="M9 20.5h6" /><circle cx="12" cy="11" r="1.6" fill="currentColor" stroke="none" /></svg>
);
export const HouseGlyph = () => (
  <svg {...base}><path d="M4 11 12 4.5 20 11M6.5 9v10.5h11V9" /><path d="M10.5 19.5v-5h3v5" /></svg>
);
export const FullscreenIcon = () => (
  <svg {...base}><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></svg>
);
export const ExitFullscreenIcon = () => (
  <svg {...base}><path d="M9 4v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 20v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4" /></svg>
);
export const VolumeIcon = () => (
  <svg {...base}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>
);
export const VolumeLowIcon = () => (
  <svg {...base}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /></svg>
);
export const MutedIcon = () => (
  <svg {...base}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></svg>
);
export const RewindIcon = () => (
  <svg {...base}><path d="M11.5 7 6 12l5.5 5M18 7l-5.5 5 5.5 5" /></svg>
);
export const ForwardIcon = () => (
  <svg {...base}><path d="m12.5 7 5.5 5-5.5 5M6 7l5.5 5L6 17" /></svg>
);
export const Replay10Icon = () => (
  <svg {...base}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
    <path d="M4.5 3.5v3.7h3.7" />
    <text x="12" y="15.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none">10</text>
  </svg>
);
export const Forward10Icon = () => (
  <svg {...base}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 3.5v3.7h-3.7" />
    <text x="12" y="15.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none">10</text>
  </svg>
);
export const SubtitlesIcon = () => (
  <svg {...base}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M7 12.5h4M13 12.5h4M7 15.5h7" /></svg>
);
export const ChevronUpIcon = () => (
  <svg {...base}><path d="m6 15 6-6 6 6" /></svg>
);
export const ChevronDownIcon = () => (
  <svg {...base}><path d="m6 9 6 6 6-6" /></svg>
);
