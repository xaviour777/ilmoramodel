// Colourful filled icons used across the app.
type P = { size?: number };

export const Icon = {
  home: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path d="M5 15 16 5l11 10v11a2 2 0 0 1-2 2h-6v-8h-6v8H7a2 2 0 0 1-2-2z" fill="#FF9600" /></svg>),
  check: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="7" width="24" height="21" rx="5" fill="#1CB0F6" /><path d="M11 18l3.5 3.5L21 15" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  book: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="4" width="20" height="24" rx="4" fill="#58CC02" /><path d="M11 11h10M11 16h10M11 21h6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>),
  star: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L16 22.6l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z" fill="#FFC800" /></svg>),
  clock: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="#CE82FF" /><path d="M16 9v7l5 3" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>),
  chat: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path d="M5 8a4 4 0 0 1 4-4h14a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-8l-6 5v-5H9a4 4 0 0 1-4-4z" fill="#FF9600" /></svg>),
  coin: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="17" r="11" fill="#E5A800" /><circle cx="16" cy="15" r="11" fill="#FFC800" /></svg>),
  classes: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="5" width="24" height="22" rx="5" fill="#1CB0F6" /><path d="M10 12h12M10 17h12M10 22h7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg>),
  people: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="11" r="6" fill="#CE82FF" /><path d="M5 28a11 11 0 0 1 22 0z" fill="#CE82FF" /></svg>),
  door: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="4" width="18" height="24" rx="3" fill="#58CC02" /><circle cx="20" cy="17" r="1.8" fill="#fff" /></svg>),
  bell: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4a8 8 0 0 1 8 8v6l3 4H5l3-4v-6a8 8 0 0 1 8-8z" fill="#CE82FF" /><circle cx="16" cy="26" r="3" fill="#A568CC" /></svg>),
  flame: ({ size = 22 }: P) => (<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z" fill="#FF9600" /></svg>),
  pencil: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path d="M6 22 21 7l4 4-15 15H6z" fill="#FF4B4B" /><path d="M19 9l4 4" stroke="#fff" strokeWidth="2" /></svg>),
  gear: ({ size = 28 }: P) => (<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path d="M14 3h4l.8 3.6 2.6 1.1 3.1-2 2.8 2.8-2 3.1 1.1 2.6L30 14v4l-3.6.8-1.1 2.6 2 3.1-2.8 2.8-3.1-2-2.6 1.1L18 29h-4l-.8-3.6-2.6-1.1-3.1 2-2.8-2.8 2-3.1-1.1-2.6L2 18v-4l3.6-.8 1.1-2.6-2-3.1 2.8-2.8 3.1 2 2.6-1.1z" fill="#8F8F8F" /><circle cx="16" cy="16" r="4.5" fill="#fff" /></svg>),
};
export type IconName = keyof typeof Icon;
