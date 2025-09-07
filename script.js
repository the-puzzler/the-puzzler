// -----------------------------
// Minimal helpers
// -----------------------------
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function debounce(fn, ms){
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// -----------------------------
// Posts list
// -----------------------------
async function loadPosts(){
  const res = await fetch('posts.json', { cache: 'no-store' });
  const posts = await res.json();
  return posts.sort((a,b)=> new Date(b.date) - new Date(a.date));
}
function formatDate(iso){
  try{ return new Date(iso).toLocaleDateString(undefined, {year:'numeric', month:'short', day:'2-digit'}); }
  catch{ return iso; }
}
async function renderList(){
  const listEl = $('#post-list');
  if(!listEl) return;
  const posts = await loadPosts();
  listEl.innerHTML = posts.map(p => `
    <li class="item">
      <h3><a href="post.html?p=${encodeURIComponent(p.path)}">${p.title}</a></h3>
      <small>${formatDate(p.date)}</small>
      ${p.description ? `<p>${p.description}</p>` : ``}
    </li>
  `).join('');
}

// -----------------------------
// MathJax typeset (awaitable)
// -----------------------------
function typesetAfterLoad(root){
  return new Promise((resolve) => {
    let tries = 0;
    (function tick(){
      const mj = window.MathJax;
      if (mj && typeof mj.typesetPromise === 'function') {
        mj.typesetPromise([root]).then(resolve).catch((err) => { console.error(err); resolve(); });
      } else if (tries++ < 100) {
        setTimeout(tick, 50);
      } else {
        resolve();
      }
    })();
  });
}

// -----------------------------
// Sidecar loader (per-post JS/CSS)
// -----------------------------
function loadSidecarAssets(htmlPath){
  const base = htmlPath.replace(/\.html?$/i, '');
  addStylesheet(`${base}.css`);
  addModule(`${base}.js`);
}
function addModule(src){
  const s = document.createElement('script');
  s.type = 'module';
  s.src = src;
  s.async = true;
  s.onerror = () => console.debug('No post script at', src);
  document.body.appendChild(s);
}
function addStylesheet(href){
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.onerror = () => console.debug('No post stylesheet at', href);
  document.head.appendChild(l);
}

// -----------------------------
// Heading normalization (prevents stalled scramble snapshots)
// -----------------------------
function normalizeHeadings(root){
  $$('h1, h2, h3, h4, h5, h6', root).forEach(h => {
    const finalText = h.dataset.title || h.textContent.trim();
    // Store once so future reflows know the true title
    if (!h.dataset.title) h.dataset.title = finalText;
    // Ensure DOM has final (clean) text before we measure/flatten
    h.textContent = h.dataset.title;
  });
}

// -----------------------------
// Book mode (soft page breaks, keep-with-next for headings)
// -----------------------------
function enableSoftBookMode(contentEl){
  const post = contentEl.closest('.post');
  if (!post) return;

  // Save linear HTML once for clean rebuilds
  if (!contentEl._originalHTML) contentEl._originalHTML = contentEl.innerHTML;

  // Make sure headings show their final text before measuring
  normalizeHeadings(contentEl);

  // Split content into sections by <hr>
  const sections = splitIntoSections(contentEl);

  // Measurer with exact width context
  const { sheetForMeasure, cleanup } = makeMeasurer(contentEl);

  // Available page height below header
  const maxH = getPageMaxHeight();
  document.documentElement.style.setProperty('--sheet-h', `${maxH}px`);

  const pages = [];
  let current = [];

  const pushPage = (nodes) => { if (nodes.length) pages.push({ nodes }); };
  const tryPack = (nodes) => {
    const tentative = current.concat(nodes);
    const h = measureNodesHeight(sheetForMeasure, tentative);
    if (h <= maxH) { current = tentative; return true; }
    return false;
  };

  // Build pages
  for (const section of sections) {
    // Split into blocks, then into "units" that keep headings with their next block
    const blocks = splitSectionIntoBlocks(section);
    const units  = buildKeepWithNextUnits(blocks);

    // First, try whole section as a single unit (fast path)
    const wholeSection = [ ...section ];
    if (wholeSection.length && tryPack(wholeSection)) continue;

    // Otherwise, pack unit by unit
    // If a unit is too large for an empty page (e.g. huge pre/img), place it alone.
    // This guarantees a heading never sits at the BOTTOM of a page:
    // we never place a heading without its companion block on the same page unless it's impossible.
    pushPage(current); current = [];
    for (const unit of units) {
      if (tryPack(unit)) continue;

      // Unit doesn't fit in current (which is empty here): force it as a separate page
      pushPage(current); current = [];
      if (!tryPack(unit)) {
        // Extremely tall unit: still put as a single page (may exceed slightly)
        pushPage(unit); // no split inside the unit
      }
    }
  }
  pushPage(current); current = [];

  // Build live DOM
  const book = document.createElement('div');
  book.className = 'book';
  for (const p of pages) {
    const sheet = document.createElement('section');
    sheet.className = 'sheet';
    p.nodes.forEach(n => sheet.appendChild(n));
    book.appendChild(sheet);
  }

  contentEl.innerHTML = '';
  contentEl.appendChild(book);
  post.classList.add('book-mode');

  addPageBadge(post, book);
  cleanup();

  // Repack on resize: normalize headings first, then flatten, then pack
  const reflow = debounce(() => {
    document.documentElement.style.setProperty('--sheet-h', `${getPageMaxHeight()}px`);
    // Normalize headings inside sheets so we don't capture a scrambled snapshot
    normalizeHeadings(book);
    const linearHTML = Array.from(book.querySelectorAll('.sheet')).map(s => s.innerHTML).join('');
    contentEl.innerHTML = linearHTML;
    enableSoftBookMode(contentEl);
    document.dispatchEvent(new CustomEvent('post:ready', { detail: { path: getCurrentPostPath() } }));
  }, 200);
  window.addEventListener('resize', reflow);
}

function splitIntoSections(container){
  const nodes = Array.from(container.childNodes);
  const groups = [[]];
  for (const n of nodes) {
    if (n.nodeType === 1 && n.tagName === 'HR') {
      if (groups[groups.length-1].length > 0) groups.push([]);
    } else {
      groups[groups.length-1].push(n);
    }
  }
  if (groups[groups.length-1].length === 0 && groups.length > 1) groups.pop();
  // Normalize stray text to paragraphs
  return groups.map(g => g.map(node => {
    if (node.nodeType === 3 && node.textContent.trim() !== '') {
      const p = document.createElement('p');
      p.textContent = node.textContent;
      return p;
    }
    return node;
  }));
}

// Split into blocks (indivisible display units)
function splitSectionIntoBlocks(nodes){
  const blocks = [];
  nodes.forEach(n => {
    if (n.nodeType === 3){
      const txt = n.textContent.trim();
      if (txt){ const p = document.createElement('p'); p.textContent = txt; blocks.push(p); }
    } else if (n.nodeType === 1){
      const tag = n.tagName.toLowerCase();
      const isBlock = /^(p|h1|h2|h3|h4|h5|h6|ul|ol|li|pre|blockquote|figure|img|table|hr|div)$/i.test(tag);
      if (isBlock) blocks.push(n);
      else { const p = document.createElement('p'); p.appendChild(n); blocks.push(p); }
    }
  });
  // Remove any hr that slipped in (sections are split by hr already)
  return blocks.filter(el => !(el.tagName && el.tagName.toLowerCase() === 'hr'));
}

// Build units that keep headings with the next block
function buildKeepWithNextUnits(blocks){
  const units = [];
  for (let i = 0; i < blocks.length; i++){
    const b = blocks[i];
    const tag = (b.tagName || '').toLowerCase();
    if (/^h[1-6]$/.test(tag)){
      const next = blocks[i+1];
      if (next){
        units.push([b, next]); // heading + next block stay together
        i++;                   // skip the next (already grouped)
      } else {
        units.push([b]);       // heading at end of section; try to keep it alone at top of a page
      }
    } else {
      units.push([b]);
    }
  }
  return units;
}

function makeMeasurer(referenceEl){
  const width = Math.max(referenceEl.getBoundingClientRect().width, 1);
  const measurer = document.createElement('div');
  measurer.style.cssText = `
    position:absolute; left:-99999px; top:0;
    width:${width}px; visibility:hidden; pointer-events:none;
  `;
  document.body.appendChild(measurer);

  const sheet = document.createElement('section');
  sheet.className = 'sheet';
  measurer.appendChild(sheet);

  function cleanup(){ measurer.remove(); }
  return { sheetForMeasure: sheet, cleanup };
}
function measureNodesHeight(sheetEl, nodes){
  sheetEl.innerHTML = '';
  nodes.forEach(n => sheetEl.appendChild(n.cloneNode(true)));
  const h = sheetEl.scrollHeight;
  sheetEl.innerHTML = '';
  return h;
}
function getPageMaxHeight(){
  const vh = (window.visualViewport?.height || window.innerHeight);
  const header = document.querySelector('.header');
  const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
  const pad = 12; // room for page badge
  return Math.max(120, Math.round(vh - headerBottom - pad));
}
function addPageBadge(postEl, bookEl){
  const old = postEl.querySelector('.page-num'); if (old) old.remove();
  const badge = document.createElement('div');
  badge.className = 'page-num';
  postEl.appendChild(badge);

  const total = bookEl.children.length;
  function update(){
    const idx = Math.round(bookEl.scrollLeft / Math.max(bookEl.clientWidth, 1));
    const clamped = Math.min(Math.max(idx, 0), total - 1);
    badge.textContent = `${clamped + 1} / ${total}`;
  }
  bookEl.addEventListener('scroll', debounce(update, 50), { passive: true });
  window.addEventListener('resize', debounce(update, 100));
  update();

  bookEl.addEventListener('click', (e) => {
    const rect = bookEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.2) snapToPage(bookEl, -1);
    else if (x > rect.width * 0.8) snapToPage(bookEl, +1);
  }, { passive: true });
}
function snapToPage(bookEl, delta){
  const idx = Math.round(bookEl.scrollLeft / Math.max(bookEl.clientWidth, 1)) + delta;
  const target = Math.min(Math.max(idx, 0), bookEl.children.length - 1);
  bookEl.scrollTo({ left: target * bookEl.clientWidth, behavior: 'smooth' });
}
function getCurrentPostPath(){
  const params = new URLSearchParams(location.search);
  return params.get('p') || '';
}

// -----------------------------
// Post renderer
// -----------------------------
async function renderPost(){
  const contentEl = document.querySelector('#post-content');
  if(!contentEl) return;

  const params = new URLSearchParams(location.search);
  const path = params.get('p');
  if(!path){
    contentEl.innerHTML = `<p>Missing post path.</p>`;
    return;
  }

  try{
    const res = await fetch(path, { cache: 'no-store' });
    const html = await res.text();
    contentEl.innerHTML = html;

    // Ensure headings have stable final text before any measuring
    normalizeHeadings(contentEl);

    // Typeset math first (accurate heights)
    await typesetAfterLoad(contentEl);

    // Mobile book packing
    const isPhone = window.matchMedia('(max-width: 560px)').matches;
    if (isPhone) {
      enableSoftBookMode(contentEl);

      const reflowOnce = debounce(async () => {
        document.documentElement.style.setProperty('--sheet-h', `${getPageMaxHeight()}px`);
        const book = contentEl.querySelector('.book');
        if (book) {
          normalizeHeadings(book); // avoid capturing scrambled title
          const linearHTML = Array.from(book.querySelectorAll('.sheet')).map(s => s.innerHTML).join('');
          contentEl.innerHTML = linearHTML;
        } else if (contentEl._originalHTML) {
          contentEl.innerHTML = contentEl._originalHTML;
          normalizeHeadings(contentEl);
          await typesetAfterLoad(contentEl);
        }
        enableSoftBookMode(contentEl);
        document.dispatchEvent(new CustomEvent('post:ready', { detail: { path } }));
      }, 150);

      window.addEventListener('orientationchange', reflowOnce, { once: true });
      window.addEventListener('load', reflowOnce, { once: true });
      contentEl.querySelectorAll('img').forEach(img => {
        if (!img.complete) img.addEventListener('load', reflowOnce, { once: true });
      });
    }

    // Load per-post sidecars AFTER packing, then fire post:ready
    loadSidecarAssets(path);
    document.dispatchEvent(new CustomEvent('post:ready', { detail: { path } }));

  }catch(e){
    console.error(e);
    contentEl.innerHTML = `<p>Failed to load post.</p>`;
  }
}

// -----------------------------
// Init
// -----------------------------
addEventListener('DOMContentLoaded', () => {
  renderList();
  renderPost();
});
