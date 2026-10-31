const $ = (id) => document.getElementById(id);
const PC = 'PC'; // virtual "This PC" location

const state = {
  cwd: null,
  history: [],
  idx: -1,
  items: [],
  selection: new Set(),
  anchor: null,
  clipboard: null, // { paths, mode }
  sort: { key: 'name', dir: 1 },
  view: 'grid',
  query: '',
  places: null,
  favorites: [], // [{ label, path, icon }]
  collapsed: { favorites: false, locations: false },
  undo: [],              // recorded operations Ctrl+Z can reverse
  cursor: null,          // item the arrow keys move from
  drag: null,            // paths being dragged inside the app
  expanded: new Set(),   // sidebar tree rows that are open
  children: new Map(),   // folder path -> subfolders already loaded for the sidebar tree
  preview: false,
  renaming: null,
  drives: [],
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sameDir = (a, b) => a && b && a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();
const baseName = (p) => (p === PC ? 'This PC' : p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p);
const sep = () => (state.places && state.places.home.includes('/') ? '/' : '\\');

function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- static chrome ----------
function mountChrome() {
  $('tabClose').innerHTML = smallIcon('close');
  $('newTab').innerHTML = smallIcon('newTab');
  $('tabMenu').innerHTML = smallIcon('menu');
  $('wMin').innerHTML = smallIcon('minimize');
  $('wMax').innerHTML = smallIcon('maximize');
  $('wClose').innerHTML = smallIcon('close');
  for (const [id, name] of [['bBack', 'back'], ['bFwd', 'forward'], ['bUp', 'up'], ['bRefresh', 'refresh'],
    ['cCut', 'cut'], ['cCopy', 'copy'], ['cPaste', 'paste'], ['cRename', 'rename'], ['cShare', 'share'],
    ['cDelete', 'delete'], ['cMore', 'more']]) {
    $(id).innerHTML = icon(name);
  }
  $('cNew').innerHTML = `${icon('new')}<span>New</span>${smallIcon('chevron', 'chev')}`;
  $('cSort').innerHTML = `${icon('sort')}<span>Sort</span>`;
  $('cView').innerHTML = `${icon('view')}<span>View</span>`;
  $('cPreview').innerHTML = `${icon('preview')}<span>Preview</span>`;
  $('pathIcon').innerHTML = icon('thisPC');
  $('searchIcon').innerHTML = icon('search');

  $('wMin').onclick = () => api.minimize();
  $('wMax').onclick = () => api.toggleMaximize();
  $('wClose').onclick = () => api.close();
  $('tabClose').onclick = () => api.close();
  $('newTab').onclick = () => toast('Tabs are not supported yet');
  $('tabMenu').onclick = (e) => openMenu(e.currentTarget, [
    { label: 'Open in new window', run: () => toast('Not supported yet') },
  ]);
  api.onMaximized(setMaxIcon);
  api.isMaximized().then(setMaxIcon);
}

function setMaxIcon(max) {
  $('wMax').innerHTML = smallIcon(max ? 'restore' : 'maximize');
  $('wMax').setAttribute('aria-label', max ? 'Restore' : 'Maximize');
}

// ---------- menus ----------
let openedMenu = null;
function closeMenu() { if (openedMenu) { openedMenu.remove(); openedMenu = null; } }

function openMenu(anchor, entries, at) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  for (const e of entries) {
    if (e === '-') { m.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.setAttribute('role', 'menuitem');
    b.innerHTML = `${e.icon ? icon(e.icon, '') : '<span style="width:18px"></span>'}<span>${esc(e.label)}</span>${e.checked ? '<span class="check">✓</span>' : ''}`;
    if (e.disabled) b.disabled = true;
    b.onclick = () => { closeMenu(); e.run(); };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = at ? { left: at.x, bottom: at.y } : anchor.getBoundingClientRect();
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  m.style.top = `${Math.max(8, Math.min(r.bottom + 4, innerHeight - h - 8))}px`;
  openedMenu = m;
}
document.addEventListener('mousedown', (e) => { if (openedMenu && !openedMenu.contains(e.target)) closeMenu(); });

// ---------- sidebar ----------
function favIconFor(name) {
  return { desktop: 'desktop', downloads: 'downloads', documents: 'documents', pictures: 'pictures', music: 'music', videos: 'videos' }[name] || 'folder';
}

function buildFavorites() {
  const p = state.places;
  const base = [
    ['Desktop', p.desktop, 'desktop'], ['Downloads', p.downloads, 'downloads'], ['Documents', p.documents, 'documents'],
    ['Pictures', p.pictures, 'pictures'], ['Music', p.music, 'music'], ['Videos', p.videos, 'videos'],
  ].filter(([, path]) => path).map(([label, path, ic]) => ({ label, path, icon: ic, builtin: true }));
  const pinned = store.get('pinned', []).map((path) => ({ label: baseName(path), path, icon: 'folder' }));
  state.favorites = [...base, ...pinned];
}

function driveLabel(root) {
  const id = root.replace(/[\\/]+$/, '');
  const label = state.places.labels && state.places.labels[root];
  return `${label || 'Local Disk'} (${id})`;
}

// ---- sidebar folder tree ----
// Rows are keyed by their position (group + ancestors) because one folder can appear in several places,
// e.g. Desktop under Favorites and under Home.
const HIDDEN_DIRS = /^(\$|System Volume Information$)/;

const dirsOf = (items) => items.filter((i) => i.isDir && !HIDDEN_DIRS.test(i.name))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

async function loadChildren(path) {
  if (state.children.has(path)) return;
  const res = await api.list(path);
  state.children.set(path, res.ok ? dirsOf(res.items) : []);
}

function toggleNode(key) {
  if (!state.expanded.delete(key)) state.expanded.add(key);
  store.set('expanded', [...state.expanded]);
  renderSidebar();   // children of a newly opened row are fetched by renderSidebar
}

function renderSidebar() {
  const p = state.places;
  const scroll = $('side').scrollTop;
  const needLoad = new Set();

  const row = (key, ic, label, path, depth = 0, expandable = false) => {
    const sel = path === PC ? state.cwd === PC : sameDir(state.cwd, path);
    const kids = state.children.get(path);
    const open = expandable && state.expanded.has(key);
    const hasKids = expandable && (kids === undefined || kids.length > 0);
    const arrow = hasKids
      ? `<button class="sarrow${open ? ' open' : ''}" data-toggle="${esc(key)}" data-path="${esc(path)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(label)}" tabindex="-1">${smallIcon('chevron')}</button>`
      : '';
    const html = `<div class="srow" style="--depth:${depth}">${arrow}<button class="si${sel ? ' sel' : ''}" data-path="${esc(path)}" ${sel ? 'aria-current="page"' : ''}>${icon(ic, '')}<span>${esc(label)}</span></button></div>`;
    if (open && !kids) needLoad.add(path);
    if (!open || !kids) return html;
    return html + kids.map((k) => row(`${key}/${k.path}`, 'folder', k.name, k.path, depth + 1, true)).join('');
  };
  const item = (group, ic, label, path, expandable = true) => row(`${group}:${path}`, ic, label, path, 0, expandable);
  const header = (key, label) =>
    `<button class="sh" data-group="${key}" aria-expanded="${!state.collapsed[key]}"><span>${label}</span>${smallIcon('chevron')}</button>`;

  const locs = [item('loc', 'thisPC', 'This PC', PC, false)];
  for (const d of p.drives) locs.push(item('loc', 'drive', driveLabel(d), d));
  if (p.oneDrive) locs.push(item('loc', 'cloud', 'OneDrive', p.oneDrive));

  $('side').innerHTML = `
    <div class="top"><div class="capsule">
      <button class="tb" id="sMore" aria-label="More options" title="Pin or unpin current folder">${icon('more', '')}</button>
      <button class="tb" id="sHide" aria-label="Hide sidebar" title="Hide sidebar">${icon('hideSidebar', '')}</button>
    </div></div>
    ${item('top', 'home', 'Home', p.home)}
    ${p.pictures ? item('top', 'gallery', 'Gallery', p.pictures, false) : ''}
    ${header('favorites', 'Favorites')}
    <div class="group" ${state.collapsed.favorites ? 'hidden' : ''}>${state.favorites.map((f) => item('fav', f.icon, f.label, f.path)).join('')}</div>
    ${header('locations', 'Locations')}
    <div class="group" ${state.collapsed.locations ? 'hidden' : ''}>${locs.join('')}</div>`;

  // The same folder can appear in several places (Gallery/Pictures, Favorites/Home tree); highlight only the first.
  const sels = $('side').querySelectorAll('.si.sel');
  for (let i = 1; i < sels.length; i++) { sels[i].classList.remove('sel'); sels[i].removeAttribute('aria-current'); }
  $('side').scrollTop = scroll;

  // loadChildren always caches a result (empty on error), so this cannot loop.
  if (needLoad.size) Promise.all([...needLoad].map(loadChildren)).then(renderSidebar);
}

$('side').addEventListener('click', (e) => {
  const arrow = e.target.closest('.sarrow');
  if (arrow) return toggleNode(arrow.dataset.toggle);
  const si = e.target.closest('.si');
  if (si) return navigate(si.dataset.path);
  const sh = e.target.closest('.sh');
  if (sh) {
    const k = sh.dataset.group;
    state.collapsed[k] = !state.collapsed[k];
    store.set('collapsed', state.collapsed);
    return renderSidebar();
  }
  if (e.target.closest('#sHide')) return toggleSidebar();
  if (e.target.closest('#sMore')) {
    const cwd = state.cwd;
    const canPin = cwd && cwd !== PC;
    const pinned = store.get('pinned', []);
    const isPinned = canPin && pinned.some((x) => sameDir(x, cwd));
    openMenu(e.target.closest('#sMore'), [
      isPinned
        ? { icon: 'folder', label: 'Unpin from Favorites', run: () => { store.set('pinned', pinned.filter((x) => !sameDir(x, cwd))); refreshFavorites(); } }
        : { icon: 'folder', label: 'Pin to Favorites', disabled: !canPin, run: () => { store.set('pinned', [...pinned, cwd]); refreshFavorites(); } },
    ]);
  }
});

function refreshFavorites() { buildFavorites(); renderSidebar(); }

function toggleSidebar() {
  const s = $('side');
  s.classList.toggle('hidden');
  if (s.classList.contains('hidden')) {
    // Without a sidebar there is no toggle; surface one in the nav row.
    if (!$('showSide')) {
      const b = document.createElement('button');
      b.className = 'tb'; b.id = 'showSide'; b.title = 'Show sidebar'; b.setAttribute('aria-label', 'Show sidebar');
      b.innerHTML = icon('hideSidebar', '');
      b.onclick = toggleSidebar;
      document.querySelector('.navrow').prepend(b);
    }
  } else if ($('showSide')) {
    $('showSide').remove();
  }
}

// ---------- navigation ----------
async function navigate(target, { push = true } = {}) {
  if (target !== PC) {
    const res = await api.list(target);
    if (!res.ok) return toast(`Can't open ${baseName(target)}: ${res.error}`);
    state.items = res.items;
    if (state.children.has(target)) state.children.set(target, dirsOf(res.items));
  } else {
    state.items = [];
  }
  if (push) {
    state.history = state.history.slice(0, state.idx + 1);
    state.history.push(target);
    state.idx = state.history.length - 1;
  }
  state.cwd = target;
  state.selection.clear();
  state.anchor = null;
  state.renaming = null;
  $('search').value = '';
  state.query = '';
  if (target === PC) state.drives = await loadDrives();
  render();
}

async function loadDrives() {
  return Promise.all(state.places.drives.map(async (root) => ({ root, info: await api.driveInfo(root) })));
}

async function reload(selectPath) {
  if (state.cwd === PC) return navigate(PC, { push: false });
  const res = await api.list(state.cwd);
  if (!res.ok) { toast(res.error); return; }
  state.items = res.items;
  if (state.children.has(state.cwd)) state.children.set(state.cwd, dirsOf(res.items));
  state.selection = new Set(selectPath ? [selectPath] : [...state.selection].filter((p) => res.items.some((i) => i.path === p)));
  render();
}

const goBack = () => { if (state.idx > 0) { state.idx--; navigate(state.history[state.idx], { push: false }); } };
const goForward = () => { if (state.idx < state.history.length - 1) { state.idx++; navigate(state.history[state.idx], { push: false }); } };
function goUp() {
  if (state.cwd === PC) return;
  const trimmed = state.cwd.replace(/[\\/]+$/, '');
  const parent = trimmed.slice(0, Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/')) + 1);
  if (!parent || sameDir(parent, state.cwd) || /^[A-Za-z]:$/.test(trimmed)) return navigate(PC);
  navigate(parent);
}

$('bBack').onclick = goBack;
$('bFwd').onclick = goForward;
$('bUp').onclick = goUp;
$('bRefresh').onclick = () => reload();

// ---------- breadcrumbs ----------
function renderCrumbs() {
  const el = $('crumbs');
  if (state.cwd === PC) { el.innerHTML = `<button class="crumb" data-p="${PC}">This PC</button>`; return; }
  const parts = state.cwd.split(/[\\/]/).filter(Boolean);
  const isWin = /^[A-Za-z]:$/.test(parts[0] || '');
  let acc = isWin ? '' : '/';
  const html = [`<button class="crumb" data-p="${PC}">This PC</button>`];
  parts.forEach((part, i) => {
    acc += (i === 0 && isWin ? part + '\\' : (i === 0 ? '' : sep()) + part);
    if (i === 0 && !isWin) acc = '/' + part;
    html.push(`<span class="crumbsep">›</span><button class="crumb" data-p="${esc(acc)}">${esc(part)}</button>`);
  });
  el.innerHTML = html.join('');
}
$('crumbs').addEventListener('click', (e) => {
  const b = e.target.closest('.crumb');
  if (b) navigate(b.dataset.p);
  else editAddress();   // empty space in the bar switches to typing a path
});

// ---- typed addresses ----
let addrParent = null;   // folder whose subfolders currently fill the suggestion list

function editAddress() {
  const input = $('addr');
  $('crumbs').hidden = true;
  input.hidden = false;
  input.value = state.cwd === PC ? 'This PC' : state.cwd;
  addrParent = null;
  input.focus();
  input.select();
}

function stopEditAddress() {
  if ($('addr').hidden) return;
  $('addr').hidden = true;
  $('crumbs').hidden = false;
}

async function commitAddress() {
  let v = $('addr').value.trim().replace(/^"|"$/g, '');
  if (!v) return stopEditAddress();
  if (/^this pc$/i.test(v)) { stopEditAddress(); return navigate(PC); }
  if (v === '~' || v.startsWith('~/') || v.startsWith('~\\')) v = state.places.home + v.slice(1);
  if (/^[A-Za-z]:$/.test(v)) v += '\\';   // "D:" alone means the drive's current folder; we want its root
  stopEditAddress();
  await navigate(v);
}

$('addr').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); commitAddress(); }
  else if (e.key === 'Escape') { e.preventDefault(); stopEditAddress(); }
});
$('addr').addEventListener('blur', stopEditAddress);

// Suggest the subfolders of whatever has been typed up to the last separator.
$('addr').addEventListener('input', async () => {
  const v = $('addr').value;
  const cut = Math.max(v.lastIndexOf('\\'), v.lastIndexOf('/'));
  if (cut < 0) return;
  const parent = v.slice(0, cut + 1);
  if (parent === addrParent) return;
  addrParent = parent;
  const res = await api.list(parent);
  if (parent !== addrParent) return;   // typed on while this was loading
  $('addrList').innerHTML = res.ok
    ? dirsOf(res.items).slice(0, 200).map((d) => `<option value="${esc(parent + d.name)}"></option>`).join('')
    : '';
});

// ---------- file list ----------
const iconCache = new Map();
function iconKey(item) {
  if (item.isDir) return 'dir';
  const ext = (item.name.split('.').pop() || '').toLowerCase();
  return ['exe', 'ico', 'lnk', 'msi', 'url'].includes(ext) || !item.name.includes('.') ? item.path : `.${ext}`;
}
async function loadIcon(item) {
  const key = iconKey(item);
  if (!iconCache.has(key)) iconCache.set(key, api.icon(item.path));
  return iconCache.get(key);
}

// Electron's getFileIcon returns the generic document icon for folders on Windows, so folders are drawn here.
function folderIcon(cls) {
  return `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M4 12.5A4.5 4.5 0 0 1 8.5 8h10.1c1.2 0 2.3.5 3.1 1.3l2 2c.5.5 1.2.7 1.9.7H39.500A4.500 4.500 0 0 1 44 16.500V36a4.500 4.500 0 0 1-4.500 4.500h-31A4.500 4.500 0 0 1 4 36z" fill="#E0A526"/>
    <path d="M4 19.500A4.500 4.500 0 0 1 8.500 15h31a4.500 4.500 0 0 1 4.500 4.500V36a4.500 4.500 0 0 1-4.500 4.500h-31A4.500 4.500 0 0 1 4 36z" fill="#FFCB4D"/>
    <path d="M4 19.500A4.500 4.500 0 0 1 8.500 15h31a4.500 4.500 0 0 1 4.500 4.500v1.500H4z" fill="#fff" opacity=".18"/>
  </svg>`;
}

function visibleItems() {
  const q = state.query.trim().toLowerCase();
  const { key, dir } = state.sort;
  const list = state.items.filter((i) => !q || i.name.toLowerCase().includes(q));
  const cmp = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    date: (a, b) => a.mtime - b.mtime,
    size: (a, b) => a.size - b.size,
    type: (a, b) => (a.name.split('.').pop() || '').localeCompare(b.name.split('.').pop() || '') || a.name.localeCompare(b.name),
  }[key];
  return list.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : cmp(a, b) * dir));
}

function render() {
  const pcView = state.cwd === PC;
  const label = baseName(state.cwd);
  $('tabLabel').textContent = label;
  document.title = label;
  $('search').placeholder = `Search ${label}`;
  renderCrumbs();
  renderSidebar();
  $('bBack').disabled = state.idx <= 0;
  $('bFwd').disabled = state.idx >= state.history.length - 1;
  $('bUp').disabled = pcView;
  $('cPreview').classList.toggle('on', state.preview);
  $('cPreview').setAttribute('aria-pressed', String(state.preview));
  $('preview').hidden = !state.preview;
  renderFiles();
  renderPreview();
  renderToolbarState();
}

function renderFiles() {
  const el = $('files');
  if (state.cwd === PC) {
    el.className = 'files drives';
    el.innerHTML = state.drives.map(({ root, info }) => {
      const used = info ? info.total - info.free : 0;
      const pct = info ? Math.round((used / info.total) * 100) : 0;
      return `<button class="drivecard" data-path="${esc(root)}">${icon('drive', 'icon')}
        <div class="info"><div>${esc(driveLabel(root))}</div>
        ${info ? `<div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="sub">${fmtSize(info.free)} free of ${fmtSize(info.total)}</div>` : '<div class="sub">Unavailable</div>'}</div></button>`;
    }).join('');
    $('status').textContent = `${state.drives.length} drives`;
    return;
  }

  const items = visibleItems();
  const list = state.view === 'list';
  el.className = `files ${list ? 'list' : 'grid'}`;
  const head = list ? '<div class="head"><span>Name</span><span>Date modified</span><span>Size</span></div>' : '';
  el.innerHTML = head + items.map((it) => {
    const cls = `fitem${state.selection.has(it.path) ? ' sel' : ''}${state.clipboard && state.clipboard.mode === 'cut' && state.clipboard.paths.includes(it.path) ? ' cut' : ''}`;
    const nameHtml = state.renaming === it.path
      ? `<input class="rename-input" value="${esc(it.name)}" data-rename="${esc(it.path)}">`
      : `<span class="name">${esc(it.name)}</span>`;
    const meta = list ? `<span class="meta">${fmtDate(it.mtime)}</span><span class="meta">${it.isDir ? '' : fmtSize(it.size)}</span>` : '';
    return `<button class="${cls}" data-path="${esc(it.path)}" title="${esc(it.name)}" draggable="${state.renaming === it.path ? 'false' : 'true'}">
      <span class="cell0">${it.isDir ? folderIcon('fi') : `<span class="fi-ph" data-icon="${esc(it.path)}"></span>`}${nameHtml}</span>${meta}</button>`;
  }).join('');

  if (!items.length) {
    const msg = document.createElement('div');
    msg.className = 'empty';
    msg.textContent = state.query ? 'No matching items' : 'This folder is empty';
    el.appendChild(msg);
  }

  // Fill in real system icons asynchronously.
  const byPath = new Map(items.map((i) => [i.path, i]));
  el.querySelectorAll('[data-icon]').forEach(async (ph) => {
    const url = await loadIcon(byPath.get(ph.dataset.icon));
    if (url && ph.isConnected) {
      const img = document.createElement('img');
      img.className = 'fi'; img.src = url; img.alt = '';
      ph.replaceWith(img);
      img.dataset.icon = ph.dataset.icon;
    }
  });

  const rn = el.querySelector('[data-rename]');
  if (rn) {
    rn.focus();
    const dot = rn.value.lastIndexOf('.');
    rn.setSelectionRange(0, dot > 0 ? dot : rn.value.length);
  }

  const n = state.selection.size;
  $('status').textContent = `${items.length} item${items.length === 1 ? '' : 's'}${n ? `  ·  ${n} selected` : ''}`;
}

function renderToolbarState() {
  const none = state.selection.size === 0 || state.cwd === PC;
  const inFolder = state.cwd !== PC;
  $('cCut').disabled = none;
  $('cCopy').disabled = none;
  $('cDelete').disabled = none;
  $('cRename').disabled = state.selection.size !== 1 || state.cwd === PC;
  $('cShare').disabled = state.selection.size !== 1;
  $('cPaste').disabled = !inFolder;   // the Windows clipboard may hold files even when ours is empty
  $('cNew').disabled = !inFolder;
}

// ---- preview pane ----
const PREVIEW_KINDS = {
  image: 'png jpg jpeg gif webp bmp svg ico avif',
  video: 'mp4 webm m4v ogv mov',
  audio: 'mp3 wav ogg oga flac m4a aac opus',
  pdf: 'pdf',
  text: 'txt md markdown json jsonc js mjs cjs ts tsx jsx css scss html htm xml csv tsv log ini cfg conf toml yml yaml py java kt c h cpp hpp cs go rs rb php sh bat cmd ps1 sql gradle properties env gitignore',
};
const kindOf = (name) => {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : name.replace(/^\./, '').toLowerCase();
  return Object.keys(PREVIEW_KINDS).find((k) => PREVIEW_KINDS[k].split(' ').includes(ext)) || null;
};

function fileUrl(p) {
  const parts = p.replace(/\\/g, '/').split('/');
  return 'file:///' + parts.map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join('/');
}

const KIND_LABEL = { image: 'Image', video: 'Video', audio: 'Audio', pdf: 'PDF document', text: 'Text file' };
let previewToken = 0;   // a newer selection invalidates in-flight async work of an older one

async function renderPreview() {
  const el = $('preview');
  if (!state.preview) return;
  const token = ++previewToken;
  const stale = () => token !== previewToken;

  if (state.selection.size === 0) {
    el.innerHTML = '<div class="none">Select a file to preview it</div>';
    return;
  }
  if (state.selection.size > 1) {
    const sel = state.items.filter((i) => state.selection.has(i.path));
    const bytes = sel.filter((i) => !i.isDir).reduce((n, i) => n + i.size, 0);
    el.innerHTML = `<div class="none"><strong>${sel.length} items selected</strong><br>${fmtSize(bytes)} in files</div>`;
    return;
  }

  const it = state.items.find((i) => i.path === [...state.selection][0]);
  if (!it) return;
  const kind = it.isDir ? null : kindOf(it.name);
  const typeLabel = it.isDir ? 'Folder' : KIND_LABEL[kind] || (it.name.includes('.') ? it.name.split('.').pop().toUpperCase() + ' file' : 'File');
  const rows = [['Type', typeLabel]];
  if (!it.isDir) rows.push(['Size', fmtSize(it.size)]);
  rows.push(['Modified', fmtDate(it.mtime)], ['Location', state.cwd]);
  const meta = () => `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(String(v))}</dd>`).join('')}</dl>`;
  const head = `<h3>${esc(it.name)}</h3>`;
  const url = fileUrl(it.path);

  let media = '';
  if (it.isDir) {
    media = folderIcon('big');
    el.innerHTML = media + head + meta();
    const res = await api.list(it.path);
    if (stale()) return;
    if (res.ok) {
      const dirs = res.items.filter((i) => i.isDir).length;
      rows.splice(1, 0, ['Contains', `${res.items.length} item${res.items.length === 1 ? '' : 's'}${dirs ? `, ${dirs} folder${dirs === 1 ? '' : 's'}` : ''}`]);
    }
    el.innerHTML = media + head + meta();
    return;
  }

  if (kind === 'image') media = `<div class="pv-frame"><img class="pv-media" src="${url}" alt=""></div>`;
  else if (kind === 'video') media = `<div class="pv-frame"><video class="pv-media" src="${url}" controls preload="metadata"></video></div>`;
  else if (kind === 'audio') media = `<div class="pv-frame pv-audio">${icon('music', 'icon pv-glyph')}<audio src="${url}" controls preload="metadata"></audio></div>`;
  else if (kind === 'pdf') media = `<iframe class="pv-pdf" src="${url}#toolbar=0&navpanes=0" title="PDF preview"></iframe>`;
  else if (kind === 'text') {
    el.innerHTML = head + '<div class="pv-text pv-loading">Loading…</div>' + meta();
    const res = await api.readText(it.path);
    if (stale()) return;
    const body = !res.ok ? `Can't preview: ${esc(res.error)}`
      : res.binary ? 'This file looks like binary data.'
      : `${esc(res.text)}${res.truncated ? '\n\n… preview truncated' : ''}`;
    el.innerHTML = head + `<pre class="pv-text">${body || '(empty file)'}</pre>` + meta();
    return;
  } else {
    el.innerHTML = head + meta();   // show details at once; the system icon can take a moment to load
    const icn = await loadIcon(it);
    if (stale()) return;
    media = icn ? `<img class="big" src="${icn}" alt="">` : '';
  }

  el.innerHTML = media + head + meta();
  const m = el.querySelector('img.pv-media');
  if (m) {
    m.onload = () => {
      if (stale()) return;
      rows.splice(2, 0, ['Dimensions', `${m.naturalWidth} × ${m.naturalHeight}`]);
      el.querySelector('dl').outerHTML = meta();
    };
    m.onerror = () => { if (!stale()) el.querySelector('.pv-frame').innerHTML = '<div class="none">Can\'t preview this image</div>'; };
  }
}

// ---------- selection & opening ----------
function selectOnly(p) { state.selection = new Set([p]); state.anchor = p; state.cursor = p; }

$('files').addEventListener('click', (e) => {
  const card = e.target.closest('.drivecard');
  if (card) return navigate(card.dataset.path);
  if (e.target.closest('.rename-input')) return;
  const row = e.target.closest('.fitem');
  if (!row) { state.selection.clear(); return afterSelect(); }
  const p = row.dataset.path;
  if (e.ctrlKey || e.metaKey) {
    state.selection.has(p) ? state.selection.delete(p) : state.selection.add(p);
    state.anchor = state.cursor = p;
  } else if (e.shiftKey && state.anchor) {
    state.cursor = p;
    const order = visibleItems().map((i) => i.path);
    const a = order.indexOf(state.anchor), b = order.indexOf(p);
    state.selection = new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1));
  } else {
    selectOnly(p);
  }
  afterSelect();
});

function afterSelect() {
  $('files').querySelectorAll('.fitem').forEach((r) => r.classList.toggle('sel', state.selection.has(r.dataset.path)));
  const n = state.selection.size;
  const count = visibleItems().length;
  $('status').textContent = `${count} item${count === 1 ? '' : 's'}${n ? `  ·  ${n} selected` : ''}`;
  renderToolbarState();
  renderPreview();
}

$('files').addEventListener('dblclick', async (e) => {
  const row = e.target.closest('.fitem');
  if (!row) return;
  openItem(state.items.find((i) => i.path === row.dataset.path));
});

async function openItem(it) {
  if (!it) return;
  if (it.isDir) return navigate(it.path);
  const err = await api.open(it.path);
  if (err) toast(err);
}

// ---------- rename ----------
function startRename() {
  if (state.selection.size !== 1) return;
  state.renaming = [...state.selection][0];
  renderFiles();
}
async function commitRename(input, ok) {
  const p = state.renaming;
  state.renaming = null;
  const name = input.value.trim();
  const it = state.items.find((i) => i.path === p);
  if (ok && name && it && name !== it.name) {
    const res = await api.rename(p, name);
    if (!res.ok) toast(res.error);
    const dir = p.slice(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);
    if (res.ok) {
      pushUndo({ type: 'rename', from: p, to: dir + name, label: 'rename' });
      state.children.delete(state.cwd);
    }
    return reload(res.ok ? dir + name : p);
  }
  renderFiles();
}
$('files').addEventListener('keydown', (e) => {
  if (!e.target.matches('.rename-input')) return;
  if (e.key === 'Enter') { e.preventDefault(); commitRename(e.target, true); }
  if (e.key === 'Escape') { e.preventDefault(); commitRename(e.target, false); }
  e.stopPropagation();
});
$('files').addEventListener('focusout', (e) => {
  if (e.target.matches && e.target.matches('.rename-input') && state.renaming) commitRename(e.target, true);
});

// ---------- command bar actions ----------
const selectedPaths = () => [...state.selection];
function setClipboard(mode) {
  if (!state.selection.size) return;
  state.clipboard = { paths: selectedPaths(), mode };
  api.clipWrite(state.clipboard.paths);   // also onto the Windows clipboard, so other apps can paste these files
  toast(`${mode === 'cut' ? 'Cut' : 'Copied'} ${state.clipboard.paths.length} item${state.clipboard.paths.length === 1 ? '' : 's'}`);
  render();
}

// ---- undo ----
function pushUndo(op) {
  state.undo.push(op);
  if (state.undo.length > 50) state.undo.shift();
}
async function undo() {
  const op = state.undo.pop();
  if (!op) return toast('Nothing to undo');
  const res = await api.undo(op);
  toast(res.ok ? `Undid ${op.label}` : res.error);
  reload();
}

// ---- name-collision dialog ----
function askConflict(names, destDir) {
  return new Promise((resolve) => {
    const shown = names.slice(0, 4).map(esc).join(', ') + (names.length > 4 ? ` and ${names.length - 4} more` : '');
    const one = names.length === 1;
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="mtitle">
      <h2 id="mtitle">${one ? 'This item already exists' : `${names.length} items already exist`}</h2>
      <p>${shown} ${one ? 'is' : 'are'} already in <strong>${esc(baseName(destDir))}</strong>.</p>
      <div class="modal-actions">
        <button data-a="replace">Replace</button><button data-a="both">Keep both</button>
        <button data-a="skip">Skip</button><button data-a="cancel" class="ghost">Cancel</button>
      </div></div>`;
    const finish = (a) => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(a === 'cancel' ? null : a); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish('cancel'); } };
    back.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) finish(b.dataset.a); else if (e.target === back) finish('cancel'); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    back.querySelector('button').focus();
  });
}

// Copies or moves paths into destDir, asking what to do about name collisions. Returns true if it ran.
async function transfer(paths, destDir, mode) {
  let res = await api.paste(paths, destDir, mode);
  if (!res.ok && res.conflicts) {
    const policy = await askConflict(res.conflicts, destDir);
    if (!policy) return false;
    res = await api.paste(paths, destDir, mode, policy);
  }
  if (!res.ok) { toast(res.error); return false; }
  // A replace sends the old file to the Recycle Bin, which undo can't bring back, so it isn't recorded.
  if (res.done.length && !res.done.some((d) => d.replaced)) {
    pushUndo(mode === 'cut'
      ? { type: 'move', pairs: res.done.map((d) => ({ from: d.from, to: d.to })), label: 'move' }
      : { type: 'copy', paths: res.done.map((d) => d.to), label: 'copy' });
  }
  state.children.delete(destDir);   // sidebar subfolder list for that folder may have changed
  return true;
}

const lowerSet = (a) => new Set(a.map((p) => p.toLowerCase()));
async function paste() {
  if (state.cwd === PC) return;
  const external = await api.clipRead();   // what Windows (or another app) has on the clipboard
  const internal = state.clipboard;
  let paths, mode, usedInternal = false;
  if (internal && (!external.length || (external.length === internal.paths.length && [...lowerSet(external)].every((p) => lowerSet(internal.paths).has(p))))) {
    ({ paths, mode } = internal);   // same files we put there, so we also know whether it was a cut
    usedInternal = true;
  } else if (external.length) {
    paths = external; mode = 'copy';
  } else {
    return toast('Nothing to paste');
  }
  const ran = await transfer(paths, state.cwd, mode);
  if (ran && usedInternal && mode === 'cut') state.clipboard = null;
  reload();
}
async function deleteSelected() {
  if (!state.selection.size) return;
  const n = state.selection.size;
  const res = await api.trash(selectedPaths());
  if (!res.ok) toast(res.error);
  else toast(`Moved ${n} item${n === 1 ? '' : 's'} to the Recycle Bin`);
  state.selection.clear();
  state.children.clear();
  reload();
}
async function createNew(kind) {
  const res = await api.create(state.cwd, kind);
  if (!res.ok) return toast(res.error);
  pushUndo({ type: 'create', paths: [res.path], label: 'new item' });
  state.children.delete(state.cwd);
  state.selection = new Set([res.path]);
  state.renaming = res.path;
  const r = await api.list(state.cwd);
  if (r.ok) state.items = r.items;
  render();
}

$('cCut').onclick = () => setClipboard('cut');
$('cCopy').onclick = () => setClipboard('copy');
$('cPaste').onclick = paste;
$('cRename').onclick = startRename;
$('cDelete').onclick = deleteSelected;
$('cShare').onclick = () => { if (state.selection.size === 1) api.reveal(selectedPaths()[0]); };
$('cNew').onclick = (e) => openMenu(e.currentTarget, [
  { icon: 'folder', label: 'Folder', run: () => createNew('folder') },
  { icon: 'documents', label: 'Text document', run: () => createNew('file') },
]);
$('cSort').onclick = (e) => {
  const keys = [['name', 'Name'], ['date', 'Date modified'], ['type', 'Type'], ['size', 'Size']];
  openMenu(e.currentTarget, [
    ...keys.map(([k, l]) => ({ label: l, checked: state.sort.key === k, run: () => { state.sort.key = k; renderFiles(); } })),
    '-',
    { label: 'Ascending', checked: state.sort.dir === 1, run: () => { state.sort.dir = 1; renderFiles(); } },
    { label: 'Descending', checked: state.sort.dir === -1, run: () => { state.sort.dir = -1; renderFiles(); } },
  ]);
};
$('cView').onclick = (e) => openMenu(e.currentTarget, [
  { icon: 'view', label: 'Grid', checked: state.view === 'grid', run: () => { state.view = 'grid'; store.set('view', 'grid'); renderFiles(); } },
  { icon: 'documents', label: 'List', checked: state.view === 'list', run: () => { state.view = 'list'; store.set('view', 'list'); renderFiles(); } },
]);
$('cMore').onclick = (e) => openMenu(e.currentTarget, [
  { label: 'Select all', run: selectAll },
  { label: 'Copy path', disabled: state.selection.size !== 1 && state.cwd === PC, run: () => {
    const p = state.selection.size === 1 ? selectedPaths()[0] : state.cwd;
    navigator.clipboard.writeText(p).then(() => toast('Path copied'));
  } },
]);
$('cPreview').onclick = () => { state.preview = !state.preview; store.set('preview', state.preview); render(); };

function selectAll() {
  if (state.cwd === PC) return;
  state.selection = new Set(visibleItems().map((i) => i.path));
  afterSelect();
}

$('search').addEventListener('input', (e) => { state.query = e.target.value; renderFiles(); });

// ---------- arrow keys & type-to-select ----------
function gridColumns() {
  const rows = [...$('files').querySelectorAll('.fitem')];
  if (!rows.length) return 1;
  return rows.filter((r) => r.offsetTop === rows[0].offsetTop).length || 1;
}

function revealItem(path) {
  const row = [...$('files').querySelectorAll('.fitem')].find((r) => r.dataset.path === path);
  if (row) row.scrollIntoView({ block: 'nearest' });
}

function moveCursor(key, extend) {
  if (state.cwd === PC) return;
  const order = visibleItems().map((i) => i.path);
  if (!order.length) return;
  const list = state.view === 'list';
  if (list && (key === 'ArrowLeft' || key === 'ArrowRight')) return;
  const last = order.length - 1;
  let cur = order.indexOf(state.cursor);
  if (cur === -1) cur = order.indexOf(state.anchor);
  const cols = list ? 1 : gridColumns();
  let next;
  if (cur === -1) next = key === 'End' ? last : 0;   // nothing selected yet: start from an edge
  else if (key === 'ArrowLeft') next = cur - 1;
  else if (key === 'ArrowRight') next = cur + 1;
  else if (key === 'ArrowUp') next = cur - cols;
  else if (key === 'ArrowDown') next = cur + cols;
  else next = key === 'Home' ? 0 : last;
  next = Math.max(0, Math.min(last, next));

  state.cursor = order[next];
  if (extend) {
    if (!state.anchor || !order.includes(state.anchor)) state.anchor = order[cur === -1 ? next : cur];
    const a = order.indexOf(state.anchor);
    state.selection = new Set(order.slice(Math.min(a, next), Math.max(a, next) + 1));
  } else {
    selectOnly(order[next]);
  }
  afterSelect();
  revealItem(order[next]);
}

let typeBuf = '', typeTimer = null;
function typeAhead(ch) {
  if (state.cwd === PC) return;
  typeBuf += ch.toLowerCase();
  clearTimeout(typeTimer);
  typeTimer = setTimeout(() => { typeBuf = ''; }, 800);
  const hit = visibleItems().find((i) => i.name.toLowerCase().startsWith(typeBuf));
  if (hit) { selectOnly(hit.path); afterSelect(); revealItem(hit.path); }
}

// ---------- drag & drop ----------
// Inside the app: drag onto a folder, a sidebar row or a breadcrumb to move (hold Ctrl to copy).
// From other apps: drop files anywhere in the file area, or onto a folder, to copy them in.
function dropDestination(target) {
  if (!target.closest) return null;
  const row = target.closest('.fitem');
  if (row) {
    const it = state.items.find((i) => i.path === row.dataset.path);
    return it && it.isDir && !(state.drag && state.drag.includes(it.path)) ? { el: row, path: it.path } : null;
  }
  const si = target.closest('.si');
  if (si && si.dataset.path !== PC) return { el: si, path: si.dataset.path };
  const crumb = target.closest('.crumb');
  if (crumb && crumb.dataset.p !== PC) return { el: crumb, path: crumb.dataset.p };
  return null;
}

const draggingFiles = (e) => !state.drag && [...(e.dataTransfer.types || [])].includes('Files');
let dropEl = null;
function setDropEl(el) {
  if (dropEl === el) return;
  if (dropEl) dropEl.classList.remove('drop');
  dropEl = el;
  if (dropEl) dropEl.classList.add('drop');
}

$('files').addEventListener('dragstart', (e) => {
  const row = e.target.closest('.fitem');
  if (!row) return;
  if (!state.selection.has(row.dataset.path)) { selectOnly(row.dataset.path); afterSelect(); }
  state.drag = selectedPaths();
  e.dataTransfer.effectAllowed = 'copyMove';
  e.dataTransfer.setData('text/plain', state.drag.join('\n'));
});
document.addEventListener('dragend', () => { state.drag = null; setDropEl(null); });

document.addEventListener('dragover', (e) => {
  if (!state.drag && !draggingFiles(e)) return;
  const dest = dropDestination(e.target);
  const inFileArea = !!e.target.closest('#files') && state.cwd !== PC;
  if (dest) {
    e.preventDefault();
    e.dataTransfer.dropEffect = state.drag && !e.ctrlKey ? 'move' : 'copy';
    setDropEl(dest.el);
  } else if (draggingFiles(e) && inFileArea) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropEl($('files'));
  } else {
    setDropEl(null);
  }
});

document.addEventListener('drop', async (e) => {
  const dest = dropDestination(e.target);
  const external = draggingFiles(e);
  const destPath = dest ? dest.path : (external && e.target.closest('#files') && state.cwd !== PC ? state.cwd : null);
  setDropEl(null);
  if (!destPath || (!state.drag && !external)) return;
  e.preventDefault();

  const paths = state.drag || [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  const move = !!state.drag && !e.ctrlKey;
  state.drag = null;
  if (!paths.length) return;
  await transfer(paths, destPath, move ? 'cut' : 'copy');
  reload();
});

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input')) {
    if (e.target.id === 'search' && e.key === 'Escape') { e.target.value = ''; state.query = ''; renderFiles(); e.target.blur(); }
    return;
  }
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') { closeMenu(); state.selection.clear(); afterSelect(); }
  else if (e.key === ' ' && typeBuf) { e.preventDefault(); typeAhead(' '); }   // part of a name being typed
  else if (e.key === ' ' && state.cwd !== PC) { e.preventDefault(); $('cPreview').click(); }
  else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) && !e.altKey && !ctrl) {
    e.preventDefault();
    moveCursor(e.key, e.shiftKey);
  }
  else if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  else if ((ctrl && e.key.toLowerCase() === 'l') || (e.altKey && e.key.toLowerCase() === 'd') || e.key === 'F4') { e.preventDefault(); editAddress(); }
  else if (e.key.length === 1 && !ctrl && !e.altKey) typeAhead(e.key);
  else if (e.key === 'F2') startRename();
  else if (e.key === 'F5') reload();
  else if (e.key === 'Delete') deleteSelected();
  else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) { e.preventDefault(); goUp(); }
  else if (e.altKey && e.key === 'ArrowLeft') goBack();
  else if (e.altKey && e.key === 'ArrowRight') goForward();
  else if (e.key === 'Enter' && state.selection.size === 1) openItem(state.items.find((i) => i.path === selectedPaths()[0]));
  else if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
  else if (ctrl && e.key.toLowerCase() === 'c') setClipboard('copy');
  else if (ctrl && e.key.toLowerCase() === 'x') setClipboard('cut');
  else if (ctrl && e.key.toLowerCase() === 'v') paste();
  else if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); $('search').focus(); }
  else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); if (state.cwd !== PC) createNew('folder'); }
});

// Right-click: select the item under the cursor and offer the common actions.
$('files').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (state.cwd === PC) return;
  const row = e.target.closest('.fitem');
  if (row && !state.selection.has(row.dataset.path)) { selectOnly(row.dataset.path); afterSelect(); }
  const at = { x: e.clientX, y: e.clientY - 4 };
  const has = state.selection.size > 0;
  openMenu(null, [
    ...(row ? [{ label: 'Open', run: () => openItem(state.items.find((i) => i.path === row.dataset.path)) }, '-'] : []),
    { icon: 'cut', label: 'Cut', disabled: !has, run: () => setClipboard('cut') },
    { icon: 'copy', label: 'Copy', disabled: !has, run: () => setClipboard('copy') },
    { icon: 'paste', label: 'Paste', run: paste },
    '-',
    { icon: 'rename', label: 'Rename', disabled: state.selection.size !== 1, run: startRename },
    { icon: 'delete', label: 'Delete', disabled: !has, run: deleteSelected },
    '-',
    { icon: 'folder', label: 'New folder', run: () => createNew('folder') },
  ], at);
});

// ---------- boot ----------
(async function init() {
  mountChrome();
  state.view = store.get('view', 'grid');
  state.preview = store.get('preview', false);
  state.collapsed = { ...state.collapsed, ...store.get('collapsed', {}) };
  state.expanded = new Set(store.get('expanded', []));
  state.places = await api.places();
  buildFavorites();

  // A folder given on the command line, or by launching Folio again while it is open, opens directly.
  const open = async (p) => {
    const res = await api.list(p);
    if (res.ok) return navigate(p);
    // Not a folder: show the folder that contains it, with the file selected.
    const dir = p.slice(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);
    if (dir) { await navigate(dir); if (state.items.some((i) => i.path === p)) { selectOnly(p); afterSelect(); } }
  };
  api.onOpenPath(open);
  const start = await api.startPath();
  if (start) await open(start); else await navigate(state.places.home);
})();
