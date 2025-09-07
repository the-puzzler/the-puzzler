
// Minimal helper functions; no frameworks.
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

async function loadPosts(){
  const res = await fetch('posts.json', {cache:'no-store'});
  const posts = await res.json();
  return posts.sort((a,b)=> new Date(b.date) - new Date(a.date));
}

function formatDate(iso){
  try{ return new Date(iso).toLocaleDateString(undefined, {year:'numeric', month:'short', day:'2-digit'}); }
  catch(e){ return iso; }
}

// Render list on index.html
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
    const res = await fetch(path, {cache:'no-store'});
    const html = await res.text();
    contentEl.innerHTML = html;
    

    // MathJax typeset (if present)
    typesetAfterLoad(contentEl);

    // Enable book mode on phones with SOFT breaks
    if (window.matchMedia('(max-width: 560px)').matches) {
      enableSoftBookMode(contentEl);
    }
  }catch(e){
    console.error(e);
    contentEl.innerHTML = `<p>Failed to load post.</p>`;
  }
}

/* ---------- MathJax helper (unchanged) ---------- */
function typesetAfterLoad(root){
  let tries = 0;
  (function tick(){
    const mj = window.MathJax;
    if (mj && typeof mj.typesetPromise === 'function') {
      mj.typesetPromise([root]).catch(console.error);
    } else if (tries++ < 100) {
      setTimeout(tick, 50);
    }
  })();
}

/* ---------- Book mode with SOFT page breaks ---------- */
/* Logic:
   1) Split content into "sections" by <hr>.
   2) Pack multiple sections into a page until the next one wouldn't fit.
   3) If a single section is taller than the page, put it alone and let that page scroll vertically.
*/
function enableSoftBookMode(contentEl){
  const post = contentEl.closest('.post');
  if (!post) return;

  // Build sections (arrays of nodes) using <hr> as soft boundaries
  const sections = splitIntoSections(contentEl);

  // Create an offscreen measurer to calculate heights accurately
  const { measurer, sheetForMeasure, cleanup } = makeMeasurer(contentEl);

  const pages = [];
  const maxH = getPageMaxHeight(); // px, derived from CSS (88vh fallback)

  let currentNodes = [];
  const finalizePage = (overflow=false) => {
    if (currentNodes.length === 0) return;
    pages.push({ nodes: currentNodes.slice(), overflow });
    currentNodes = [];
  };

  for (const section of sections) {
    // try to add this section into the current page
    const tentative = currentNodes.concat(section);
    const h = measureNodesHeight(sheetForMeasure, tentative);

    if (h <= maxH) {
      // it fits: accept it
      currentNodes = tentative;
    } else {
      // doesn't fit: if current page is empty, force this section alone and mark overflow if still too tall
      if (currentNodes.length === 0) {
        const hAlone = measureNodesHeight(sheetForMeasure, section);
        const overflow = hAlone > maxH;
        pages.push({ nodes: section, overflow });
      } else {
        // close current page and start new with this section
        finalizePage(false);
        // try adding the section to the new (empty) page
        const hAlone = measureNodesHeight(sheetForMeasure, section);
        const overflow = hAlone > maxH;
        if (overflow) {
          pages.push({ nodes: section, overflow: true });
        } else {
          currentNodes = section.slice();
        }
      }
    }
  }
  // flush remaining
  finalizePage(false);

  // Build the live DOM
  const book = document.createElement('div');
  book.className = 'book';
  for (const p of pages) {
    const sheet = document.createElement('section');
    sheet.className = 'sheet';
    if (p.overflow) sheet.classList.add('sheet--overflow');
    p.nodes.forEach(n => sheet.appendChild(n));
    book.appendChild(sheet);
  }

  // Replace content with book
  contentEl.innerHTML = '';
  contentEl.appendChild(book);
  post.classList.add('book-mode');

  // Page badge
  addPageBadge(post, book);

  // Clean up measurer
  cleanup();

  // Re-pack on orientation/resize (debounced)
  const reflow = debounce(() => {
    // rebuild from original HTML (stored?) — simplest: reload the page section
    // For now, re-run enableSoftBookMode by reconstructing from current linearized HTML:
    // Extract linear HTML from sheets back to contentEl and rebuild.
    const linearHTML = Array.from(book.querySelectorAll('.sheet'))
      .map(s => s.innerHTML).join('');
    contentEl.innerHTML = linearHTML;
    enableSoftBookMode(contentEl);
  }, 200);
  window.addEventListener('resize', reflow);
}

/* Turn the content (which currently includes <hr>) into an array of "sections" (nodes between hrs) */
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

  // Wrap stray text nodes in <p> so measurements are stable
  return groups.map(g => g.map(node => {
    if (node.nodeType === 3 && node.textContent.trim() !== '') {
      const p = document.createElement('p');
      p.textContent = node.textContent;
      return p;
    }
    return node;
  }));
}

/* Create a hidden measurer with the same width context */
function makeMeasurer(referenceEl){
  const measurer = document.createElement('div');
  measurer.style.cssText = `
    position: absolute; left: -99999px; top: 0;
    width: ${Math.max(referenceEl.clientWidth, 1)}px;
    visibility: hidden;
    pointer-events: none;
  `;
  document.body.appendChild(measurer);

  const sheet = document.createElement('section');
  sheet.className = 'sheet';
  measurer.appendChild(sheet);

  function cleanup(){
    measurer.remove();
  }

  return { measurer, sheetForMeasure: sheet, cleanup };
}

/* Measure combined height of a set of nodes when they’re in a sheet */
function measureNodesHeight(sheetEl, nodes){
  sheetEl.innerHTML = '';
  nodes.forEach(n => sheetEl.appendChild(n.cloneNode(true)));
  // Force layout
  const h = sheetEl.scrollHeight;
  sheetEl.innerHTML = '';
  return h;
}

/* Extract px from 88vh rule */
function getPageMaxHeight(){
  // Read the CSS variable from a dummy sheet, else fallback to window innerHeight * 0.88
  const vh = Math.max(window.innerHeight, 1);
  return Math.round(vh * 0.88);
}

/* Page number HUD */
function addPageBadge(postEl, bookEl){
  const badge = document.createElement('div');
  badge.className = 'page-num';
  postEl.appendChild(badge);

  const total = bookEl.children.length;

  function update(){
    const idx = Math.round(bookEl.scrollLeft / Math.max(bookEl.clientWidth, 1));
    const clamped = Math.min(Math.max(idx, 0), total - 1);
    badge.textContent = `${clamped + 1} / ${total}`;
  }

  bookEl.addEventListener('scroll', debounce(update, 50), {passive:true});
  window.addEventListener('resize', debounce(update, 100));
  update();

  // Optional edge-tap navigation
  bookEl.addEventListener('click', (e) => {
    const rect = bookEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.2) snapToPage(bookEl, -1);
    else if (x > rect.width * 0.8) snapToPage(bookEl, +1);
  }, {passive:true});
}

function snapToPage(bookEl, delta){
  const idx = Math.round(bookEl.scrollLeft / Math.max(bookEl.clientWidth, 1)) + delta;
  const target = Math.min(Math.max(idx, 0), bookEl.children.length - 1);
  bookEl.scrollTo({ left: target * bookEl.clientWidth, behavior: 'smooth' });
}

function debounce(fn, ms){
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}

// Init
addEventListener('DOMContentLoaded', () => {
  renderList();
  renderPost();
});
