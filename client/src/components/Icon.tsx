const paths = {
  calendar: 'M5 5h14v15H5z M5 10h14 M8 3v4 M16 3v4 M9 14l2 2 4-4',
  arrow: 'M4 12h15 M14 7l5 5-5 5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  users:
    'M9 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M3 20v-3a6 6 0 0 1 12 0v3 M17 4a3 3 0 0 1 0 6 M18 14a4 4 0 0 1 3 4v2',
  logout: 'M9 4H4v16h5 M9 12h12 M17 8l4 4-4 4',
  close: 'M6 6l12 12 M6 18L18 6',
  refresh: 'M20 10a8 8 0 0 0-14-5L3 8 M3 3v5h5 M4 14a8 8 0 0 0 14 5l3-3 M21 21v-5h-5',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12l4 4L19 6',
  book: 'M4 4h6a2 2 0 0 1 2 2v15a4 4 0 0 0-4-2H4z M20 4h-6a2 2 0 0 0-2 2 M20 4v15h-4a4 4 0 0 0-4 2',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',
};

export function Icon({ name, className = '' }: { name: keyof typeof paths; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-mark">
        <Icon name="calendar" />
      </span>
      <span>
        SlotGuard<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
