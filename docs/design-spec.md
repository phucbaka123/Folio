# File Explorer redesign: full spec

Apple-style polish on a Windows 11 File Explorer. Three parts, all in dark theme with a light variant for the buttons:

1. Title bar buttons: square hit areas, rounded corners, bolder icons
2. Icon set: 29 macOS-style bold line icons
3. Sidebar layout: iPad Files-style sections and selection

Everything else in Explorer (tabs, address bar, command bar, file area) keeps the Windows layout. Only the look of the buttons and icons, and the structure of the sidebar, change.

---

## 0. Window layout

Reference size 1280 x 920 px.

```
+--------------------------------------------------------------+
| Title bar (48 px): tab, +  ............  min  max  close      |
+------------------+-------------------------------------------+
| Sidebar (280 px) | Navigation row (56 px)                     |
|  capsule (56 px) |   back fwd up refresh | path | search      |
|  Home, Gallery   | Command bar (56 px, bottom hairline)       |
|  Favorites       |   New | cut copy paste rename share delete |
|  Locations       |   | Sort View | more ......... Preview     |
|                  | File area (padding 16 x 20, 7-column grid) |
+------------------+-------------------------------------------+
```

The sidebar runs the full height under the title bar. Its top row (56 px) lines up with the navigation row.

### Colors (dark)

| Use | Value |
|---|---|
| Window and file area background | `#141416` |
| Title bar background | `#232326` |
| Sidebar background | `#1d1d20` |
| Primary text and toolbar icons | `#f5f5f7` |
| Secondary text (section headers, placeholders) | `#a1a1a6` |
| Sidebar icons and accent | `#409CFF` (`#0A84FF` on light) |
| Pill backgrounds (path, search, tab, capsule) | `rgba(255,255,255,.07)` (tab: `.09`) |
| Hover fill | `rgba(255,255,255,.11)` |
| Pressed fill | `rgba(255,255,255,.18)` |
| Hairline / separator | `rgba(255,255,255,.08)` (separators between buttons: `.14`) |
| Close hover / pressed | `#D92D20` / `#B42318`, icon white |
| Focus ring | 2 px `#0A84FF`, 2 px offset, keyboard focus only |

Light theme: icons `#1d1d1f`, hover `rgba(0,0,0,.07)`, pressed `rgba(0,0,0,.13)`, bar background `#f2f2f4`.

### Font

`-apple-system, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`. Body 14 px, toolbar labels 13 px, captions 12 px.

---

## 1. Title bar buttons

| Token | Value |
|---|---|
| Button size | 36 x 36 px (the whole square is the hit area) |
| Corner radius | 10 px |
| Gap between buttons | 4 px |
| Icon size | 16 x 16 px in the title bar, 20 px in the toolbars |
| Icon stroke | 2 px, round caps and joins, no fill |
| Pressed scale | 0.94 |
| Transition | 120 ms ease (background and transform) |
| Title bar | height 48 px, padding 6 px 8 px |

Layout: new tab (`+`) and menu (chevron) on the left, flexible drag area, then Minimize, Maximize (Restore while maximized), Close on the right.

Title bar icons (viewBox `0 0 16 16`):

| Button | SVG content |
|---|---|
| New tab | `<path d="M8 3v10M3 8h10"/>` |
| Menu | `<path d="M4 6l4 4 4-4"/>` |
| Minimize | `<path d="M3 8h10"/>` |
| Maximize | `<rect x="3" y="3" width="10" height="10" rx="2.5"/>` |
| Restore | `<path d="M6 3h5.5A1.5 1.5 0 0 1 13 4.5V10"/><rect x="2.5" y="5.5" width="8" height="8" rx="2.5"/>` |
| Close | `<path d="M4 4l8 8M12 4l-8 8"/>` |

Tab (Explorer): height 36 px, radius 10 px, padding 0 8 px 0 12 px, background `rgba(255,255,255,.09)`, 18 px blue drive icon, label 13 px, small 24 x 24 close button (radius 8 px, 12 px icon).

### Button CSS

```css
.bar { --fg:#f5f5f7; --hov:rgba(255,255,255,.11); --prs:rgba(255,255,255,.18); }

.tb { width:36px; height:36px; box-sizing:border-box; border:0; padding:0; margin:0;
      border-radius:10px; background:transparent; color:var(--fg);
      display:inline-flex; align-items:center; justify-content:center;
      transition:background .12s ease, transform .12s ease; }
.tb svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:2;
          stroke-linecap:round; stroke-linejoin:round; pointer-events:none; }
.tb:hover  { background:var(--hov); }
.tb:active { background:var(--prs); transform:scale(.94); }
.tb:focus-visible { outline:2px solid #0A84FF; outline-offset:2px; }
.tb.close:hover  { background:#D92D20; color:#fff; }
.tb.close:active { background:#B42318; color:#fff; }

/* Buttons with a text label (New, Sort, View, Preview) */
.tbt { height:36px; padding:0 10px; border:0; border-radius:10px; background:transparent;
       color:var(--fg); font-size:13px; display:inline-flex; align-items:center; gap:8px; }
.tbt:hover  { background:var(--hov); }
.tbt:active { background:var(--prs); transform:scale(.96); }
```

---

## 2. Icon set

Rules for every icon:

| Property | Value |
|---|---|
| Grid | `viewBox="0 0 24 24"` |
| Stroke | 2 px, `stroke-linecap="round"`, `stroke-linejoin="round"` |
| Fill | none (only the "More" dots and the "Drive" dot are filled) |
| Color | `currentColor` |
| Size | 20 px in toolbars and the sidebar, 28 px for large display |

```css
.icon { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:2;
        stroke-linecap:round; stroke-linejoin:round; }
```

```html
<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">...paths...</svg>
```

Every icon sits inside a button or label with its own `aria-label` or visible text, so the SVG is `aria-hidden`.

### Navigation

| Name | SVG content |
|---|---|
| Back | `<path d="M19 12H5M11 6l-6 6 6 6"/>` |
| Forward | `<path d="M5 12h14M13 6l6 6-6 6"/>` |
| Up | `<path d="M12 19V5M6 11l6-6 6 6"/>` |
| Refresh | `<path d="M19.5 12A7.5 7.5 0 1 1 17.5 7"/><path d="M17.5 3.5V7H14"/>` |
| This PC | `<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4"/>` |

### Command bar

| Name | SVG content |
|---|---|
| New | `<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>` |
| Cut | `<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M7.6 15.8L18.5 4M16.4 15.8L5.5 4"/>` |
| Copy | `<path d="M8 8V6.5A2.5 2.5 0 0 1 10.5 4h7A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H16"/><rect x="4" y="8" width="12" height="12" rx="2.5"/>` |
| Paste | `<rect x="5" y="4.5" width="14" height="16.5" rx="3"/><rect x="9" y="2.5" width="6" height="4" rx="1.5"/><path d="M9 12h6M9 16h4"/>` |
| Rename | `<rect x="3" y="7" width="18" height="10" rx="3"/><path d="M12 4v16M10 4h4M10 20h4"/>` |
| Share | `<path d="M12 15V4M8 8l4-4 4 4"/><path d="M8 11h-.5A2.5 2.5 0 0 0 5 13.5v4A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-4a2.5 2.5 0 0 0-2.5-2.5H16"/>` |
| Delete | `<path d="M4 7h16"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M6 7l.8 11.2A2 2 0 0 0 8.8 20h6.4a2 2 0 0 0 2-1.8L18 7"/><path d="M10 11v5M14 11v5"/>` |
| Sort | `<path d="M8 20V4M4.5 7.5L8 4l3.5 3.5"/><path d="M16 4v16M12.5 16.5L16 20l3.5-3.5"/>` |
| View | `<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>` |
| More | `<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>` |
| Preview | `<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>` |
| Search | `<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>` |
| Hide sidebar | same as Preview: `<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>` (the divider is on the left) |

Small chevron after "New" (viewBox `0 0 16 16`, shown at 12 px): `<path d="M4 6l4 4 4-4"/>`

### Sidebar and places

| Name | SVG content |
|---|---|
| Home | `<path d="M4 11l8-7 8 7"/><path d="M6 9.5v9A1.5 1.5 0 0 0 7.5 20h3v-5.5h3V20h3a1.5 1.5 0 0 0 1.5-1.5v-9"/>` |
| Gallery | `<rect x="3" y="7" width="15" height="13" rx="2.5"/><path d="M7 7v-.5A2.5 2.5 0 0 1 9.5 4h9A2.5 2.5 0 0 1 21 6.5v9a2.5 2.5 0 0 1-2.5 2.5H18"/><path d="M4 17l4-3.5 3 2.5 3-2.5 3.5 3"/>` |
| Cloud | `<path d="M7.5 18.5h10a4 4 0 0 0 .6-7.95 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7.5 18.5z"/>` |
| Desktop | `<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M3 9h18"/>` |
| Downloads | `<circle cx="12" cy="12" r="9"/><path d="M12 7.5v8M8.5 12.5l3.5 3.5 3.5-3.5"/>` |
| Documents | `<path d="M7.5 3H14l5 5v10.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18.5v-13A2.5 2.5 0 0 1 7.5 3z"/><path d="M14 3v5h5M9 13h6M9 16.5h4"/>` |
| Pictures | `<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 16"/>` |
| Music | `<path d="M9 17.5v-11L19 4.5V15"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>` |
| Videos | `<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>` |
| Folder | `<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.2c.5 0 1 .2 1.4.6l1 1.1c.4.4.9.6 1.4.6H18a2.5 2.5 0 0 1 2.5 2.5V17.5A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z"/>` |
| Drive | `<rect x="3" y="12" width="18" height="8" rx="2.5"/><path d="M5 12l2-6.5A2 2 0 0 1 8.9 4h6.2A2 2 0 0 1 17 5.5L19 12"/><path d="M12 16h5"/><circle cx="7.5" cy="16" r="1" fill="currentColor" stroke="none"/>` |
| Network | `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z"/>` |

Naming for code: back, forward, up, refresh, thisPC, new, cut, copy, paste, rename, share, delete, sort, view, more, preview, search, hideSidebar, home, gallery, cloud, desktop, downloads, documents, pictures, music, videos, folder, drive, network.

### Navigation row and path/search pills

- Row height 56 px, padding 10 px 16 px, 4 px gap.
- Back, Forward, Up, Refresh: 36 px buttons, 20 px icons. 8 px space after Refresh.
- Path pill (fills the remaining width): height 36 px, radius 10 px, background `rgba(255,255,255,.07)`, 18 px This PC icon, then breadcrumbs separated by a dim `›`.
- Search pill: 240 px wide, same style, 18 px search icon, placeholder "Search <folder name>" in `#a1a1a6`.

### Command bar row

- Row height 56 px, padding 10 px 16 px, bottom hairline `rgba(255,255,255,.08)`.
- Order: `New` (icon, label, small chevron) | separator | Cut, Copy, Paste, Rename, Share, Delete | separator | `Sort`, `View` (icon + label) | separator | More | flexible space | `Preview` (icon + label).
- Separator: 1 px wide, 20 px tall, `rgba(255,255,255,.14)`, 6 px side margin.

---

## 3. Sidebar layout (iPad Files style)

The old tree view (arrows that expand folders) becomes a flat list in three groups.

### Structure

| Group | Header | Items (in order) |
|---|---|---|
| Top | none | Home, Gallery |
| Favorites | "Favorites" (the old pinned folders) | Desktop, Downloads, Documents, Pictures, Music, Videos, IdeaProjects, CAN_Hack, Test Video, test |
| Locations | "Locations" | This PC, OS (C:), New Volume (D:), Google Drive (G:), OneDrive – Personal, iCloud Drive, iCloud Photos, Network |

Icons: Folder icon for IdeaProjects, CAN_Hack, Test Video and test. Drive icon for OS (C:), New Volume (D:) and Google Drive (G:). Cloud icon for OneDrive and iCloud Drive. Pictures icon for iCloud Photos. The other items use the icon with the same name.

### Dimensions

| Part | Value |
|---|---|
| Sidebar width | 280 px, padding 0 12 px 8 px, background `#1d1d20` |
| Top row | 56 px tall, holds the capsule on the right |
| Capsule | background `rgba(255,255,255,.07)`, radius 14 px, padding 2 px; contains two 36 px buttons: More (three dots) and Hide sidebar |
| Section header | height 28 px, 12 px top margin, padding 0 12 px, 13 px, weight 600, `#a1a1a6`, label on the left, 14 px chevron on the right, `aria-expanded` set |
| Item row | height 36 px, padding 0 12 px, radius 12 px, 14 px text `#f5f5f7`, 20 px blue icon, 12 px gap between icon and label |
| Item hover | `rgba(255,255,255,.06)` |
| Selected item | `rgba(255,255,255,.12)` background, full width, `aria-current="page"` |

The sidebar scrolls vertically if it does not fit. Clicking a section header collapses or expands that group.

### Sidebar CSS

```css
.side { width:280px; flex:none; box-sizing:border-box; padding:0 12px 8px;
        background:#1d1d20; display:flex; flex-direction:column; overflow:auto; }
.capsule { display:flex; align-items:center; padding:2px; border-radius:14px;
           background:rgba(255,255,255,.07); }

.sh { width:100%; height:28px; box-sizing:border-box; padding:0 12px; margin:12px 0 0;
      border:0; border-radius:10px; background:transparent; color:#a1a1a6;
      font-size:13px; font-weight:600;
      display:flex; align-items:center; justify-content:space-between; }
.sh svg { width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:2;
          stroke-linecap:round; stroke-linejoin:round; }

.si { width:100%; height:36px; box-sizing:border-box; padding:0 12px; margin:0;
      border:0; border-radius:12px; background:transparent; color:#f5f5f7;
      font-size:14px; text-align:left;
      display:flex; align-items:center; gap:12px; transition:background .12s ease; }
.si svg { width:20px; height:20px; flex:none; fill:none; stroke:#409CFF; stroke-width:2;
          stroke-linecap:round; stroke-linejoin:round; }
.si:hover { background:rgba(255,255,255,.06); }
.si.sel   { background:rgba(255,255,255,.12); }
.si:focus-visible, .sh:focus-visible { outline:2px solid #0A84FF; outline-offset:2px; }
```

### Sidebar HTML pattern

```html
<nav class="side" aria-label="Sidebar">
  <div class="top"><div class="capsule">
    <button class="tb" aria-label="More options">...</button>
    <button class="tb" aria-label="Hide sidebar">...</button>
  </div></div>

  <button class="si"><svg ...home...></svg><span>Home</span></button>
  <button class="si"><svg ...gallery...></svg><span>Gallery</span></button>

  <button class="sh" aria-expanded="true"><span>Favorites</span><svg ...chevron...></svg></button>
  <button class="si"><svg ...desktop...></svg><span>Desktop</span></button>
  ...
  <button class="sh" aria-expanded="true"><span>Locations</span><svg ...chevron...></svg></button>
  <button class="si sel" aria-current="page"><svg ...drive...></svg><span>OS (C:)</span></button>
  ...
</nav>
```

---

## 4. File area

Not redesigned. In the mockup it is a 7-column grid with 20 px / 16 px padding, 8 px gap, 64 x 52 px folder shapes and 13 px centered labels. The yellow folders in the mockup are stand-ins; keep the real Windows folder and file icons.

---

## 5. Implementation notes

- Keep all numbers (36 px buttons, 10 px radius, 2 px strokes, the colors above) if the app is not web-based (WinUI, WPF, Qt and so on); convert the SVG paths to that framework's vector format.
- Maximize swaps to the Restore icon while the window is maximized.
- Not covered: the large folder and file icons in the file area, the details/list view, the status bar and context menus.

## 6. Prompt to give Claude Code

> Read explorer-redesign-spec.md and rebuild my File Explorer interface to match it exactly: the title bar buttons (36 x 36 px square hit areas, 10 px rounded corners, 2 px icons, red Close hover), the 29 bold line icons, and the new iPad Files-style sidebar (Home and Gallery at the top, collapsible Favorites and Locations sections, rounded selected row, blue line icons, capsule with More and Hide sidebar at the top). Use the exact colors from the spec. Keep the rest of the Windows layout. Tell me which files you changed.
