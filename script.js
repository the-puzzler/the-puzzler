
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

// Render a single post on post.html
async function renderPost(){
  const contentEl = $('#post-content');
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
  }catch(e){
    contentEl.innerHTML = `<p>Failed to load post.</p>`;
  }
}

// Init
addEventListener('DOMContentLoaded', () => {
  renderList();
  renderPost();
});
