// 29 bold line icons from explorer-redesign-spec.md (viewBox 0 0 24 24, 2px round stroke).
const ICONS = {
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  refresh: '<path d="M19.5 12A7.5 7.5 0 1 1 17.5 7"/><path d="M17.5 3.5V7H14"/>',
  thisPC: '<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4"/>',

  new: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  cut: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M7.6 15.8L18.5 4M16.4 15.8L5.5 4"/>',
  copy: '<path d="M8 8V6.5A2.5 2.5 0 0 1 10.5 4h7A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H16"/><rect x="4" y="8" width="12" height="12" rx="2.5"/>',
  paste: '<rect x="5" y="4.5" width="14" height="16.5" rx="3"/><rect x="9" y="2.5" width="6" height="4" rx="1.5"/><path d="M9 12h6M9 16h4"/>',
  rename: '<rect x="3" y="7" width="18" height="10" rx="3"/><path d="M12 4v16M10 4h4M10 20h4"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M8 11h-.5A2.5 2.5 0 0 0 5 13.5v4A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-4a2.5 2.5 0 0 0-2.5-2.5H16"/>',
  delete: '<path d="M4 7h16"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M6 7l.8 11.2A2 2 0 0 0 8.8 20h6.4a2 2 0 0 0 2-1.8L18 7"/><path d="M10 11v5M14 11v5"/>',
  sort: '<path d="M8 20V4M4.5 7.5L8 4l3.5 3.5"/><path d="M16 4v16M12.5 16.5L16 20l3.5-3.5"/>',
  view: '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  preview: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  hideSidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',

  home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5v9A1.5 1.5 0 0 0 7.5 20h3v-5.5h3V20h3a1.5 1.5 0 0 0 1.5-1.5v-9"/>',
  gallery: '<rect x="3" y="7" width="15" height="13" rx="2.5"/><path d="M7 7v-.5A2.5 2.5 0 0 1 9.5 4h9A2.5 2.5 0 0 1 21 6.5v9a2.5 2.5 0 0 1-2.5 2.5H18"/><path d="M4 17l4-3.5 3 2.5 3-2.5 3.5 3"/>',
  cloud: '<path d="M7.5 18.5h10a4 4 0 0 0 .6-7.95 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7.5 18.5z"/>',
  desktop: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M3 9h18"/>',
  downloads: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v8M8.5 12.5l3.5 3.5 3.5-3.5"/>',
  documents: '<path d="M7.5 3H14l5 5v10.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18.5v-13A2.5 2.5 0 0 1 7.5 3z"/><path d="M14 3v5h5M9 13h6M9 16.5h4"/>',
  pictures: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 16"/>',
  music: '<path d="M9 17.5v-11L19 4.5V15"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>',
  videos: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>',
  folder: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.2c.5 0 1 .2 1.4.6l1 1.1c.4.4.9.6 1.4.6H18a2.5 2.5 0 0 1 2.5 2.5V17.5A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z"/>',
  drive: '<rect x="3" y="12" width="18" height="8" rx="2.5"/><path d="M5 12l2-6.5A2 2 0 0 1 8.9 4h6.2A2 2 0 0 1 17 5.5L19 12"/><path d="M12 16h5"/><circle cx="7.5" cy="16" r="1" fill="currentColor" stroke="none"/>',
  network: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z"/>',
};

// 16x16 title bar icons.
const TITLE_ICONS = {
  newTab: '<path d="M8 3v10M3 8h10"/>',
  menu: '<path d="M4 6l4 4 4-4"/>',
  minimize: '<path d="M3 8h10"/>',
  maximize: '<rect x="3" y="3" width="10" height="10" rx="2.5"/>',
  restore: '<path d="M6 3h5.5A1.5 1.5 0 0 1 13 4.5V10"/><rect x="2.5" y="5.5" width="8" height="8" rx="2.5"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  chevron: '<path d="M4 6l4 4 4-4"/>',
};

function icon(name, cls = 'icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

function smallIcon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${TITLE_ICONS[name]}</svg>`;
}
