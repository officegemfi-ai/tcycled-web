# tcycled.app

The tcycled website: old clothes back by post, with a voucher. Sorted by Artus in Bad Oldesloe.
German is the default (`/`), English is at `/en.html`.

| Folder | What it is |
| --- | --- |
| `docs/` | The live site. GitHub Pages publishes this folder at tcycled.app. Don't edit it by hand: it is rebuilt from `source/`. |
| `source/` | The editable site: pages, German text, styles, script, images, fonts and the build script. |

## Going live (once)

1. **Domain.** Register `tcycled.app` (and ideally `tcycled.de`, forwarded to tcycled.app).
2. **DNS** at the registrar, for `tcycled.app`:
   - four `A` records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `www` as a `CNAME` to `officegemfi-ai.github.io`
3. **GitHub Pages.** In this repo: Settings → Pages → Build and deployment → *Deploy from a branch*, branch `main`, folder `/docs`.
   The custom domain `tcycled.app` is set by `docs/CNAME`. Once the DNS check passes, tick **Enforce HTTPS** (`.app` domains only work over HTTPS).

## Changing the site

1. Edit the files in `source/src/`:
   - `pages/*.html`: the seven pages, written in English
   - `i18n/de.json`: the German for every English line (German is what most visitors see, so change both)
   - `parts/*.html`: the posters and feed posts, with English and German side by side
   - `style.css`, `app.js`, `nav.html`, `footer.html`
2. Build: `pip install segno pillow`, then `python3 source/build.py`. This rewrites `docs/`.
3. Commit `source/` and `docs/` together. The site updates a minute or two after the push.

Every promise or number on the site is in the claims register (`tcycled-claims-register.xlsx`). New or changed claims go through it before they go live.

## Analytics (Plausible, no cookies)

1. Create the site `tcycled.app` in Plausible.
2. Save Plausible's snippet to a file. In its `plausible.init`, add `hashBasedRouting: true` and `customProperties: () => window.__tcProps()`.
3. Build with `TC_ANALYTICS_SNIPPET=path/to/snippet.html python3 source/build.py`.
4. In Plausible, add the goals `Register start`, `Bag registered`, `App store click`, `Letter saved`, `Pilot requested` and `Asset copied`, and the properties `page, lang, headline, placement, channel, store, via, how, piece, start, asset`.
5. Test it: open `tcycled.app/?q=hh-jeans&debug=analytics` and tap "Beutel registrieren". The event shows in the browser console.

## Links the site understands

| Link | What it does |
| --- | --- |
| `tcycled.app/b/<bag code>` | The QR code on every bag cap: opens registration with the code filled in |
| `tcycled.app/?q=<placement>` | Which poster, screen or ad a visit came from (codes in `source/placements.csv`) |
| `tcycled.app/radio` | The radio spot's spoken link |
| `?h=a` or `?h=b` | Headline A "Kein Abschied." or B "Wohin mit alten Klamotten? Ab in den Beutel." (the paid test) |
| `?lang=de` or `?lang=en` | Language |

GitHub Pages has no redirect rules, so `docs/404.html` sends `/b/…`, `/q/…` and `/radio` on to the right page. `docs/_redirects` does the same if the site moves to Netlify or Cloudflare Pages.

## Still needed before launch

- An Impressum and a privacy policy (Artus and the lawyer), linked from the footer.
- The registration and pilot forms show a confirmation but don't send anything yet. Connect them to the tcycled back end and the Artus partnerships inbox.
- The lawyer's sign-off on the claims register.
