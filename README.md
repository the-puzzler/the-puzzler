
# the-puzzler — lean retro blog

Minimal static site designed for GitHub Pages. No frameworks. Easy to extend.

## Quick start

1) Create a repo (e.g., `the-puzzler`).
2) Drop these files in the repo root.
3) Enable GitHub Pages:
   - Settings → Pages → Build and deployment → Deploy from branch
   - Branch: `main` (or `master`), folder `/root`
4) Visit your Pages URL once it's built.

## Create a new post

- Copy `posts/hello-world.html` and rename it, e.g. `posts/my-first-post.html`.
- Edit the file’s HTML content.
- Add an entry to `posts.json`:

```json
{
  "title": "My First Post",
  "date": "2025-09-10",
  "path": "posts/my-first-post.html",
  "description": "Short teaser line."
}
```

That’s it. The home page auto-loads the list from `posts.json`. Clicking a post opens `post.html?p=posts/my-first-post.html`.

## Customize

- Colors and typography live in `styles.css`.
- Header links live in `index.html` and `post.html`.
- You can add images to `/assets` and reference them in posts like `<img src="../assets/pic.png" alt="">`.

## Optional niceties

- Use a custom domain under Settings → Pages.
- Add analytics by inserting your script tag before `</body>`.
- If you prefer Markdown, add a tiny client-side converter later; the current setup stays pure-HTML for speed.
