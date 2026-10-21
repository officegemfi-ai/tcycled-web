"""Assemble the tcycled website into one HTML page (the artifact) plus asset files."""
import re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / 'src'
PARTS = SRC / 'parts'
DIST = HERE / 'dist'
KIT = HERE / 'kit'  # the icons, illustrations, logos and favicons the site uses, from the tcycled brand kit
sys.path.insert(0, str(HERE))
from qrpath import qr_path  # noqa: E402

DIST.mkdir(exist_ok=True)


def include(text):
    """{{>name}} pulls in src/parts/name.html (used for posters and feed posts that appear on two pages)."""
    for _ in range(3):
        text = re.sub(r'\{\{>([a-z0-9-]+)\}\}', lambda m: (PARTS / f'{m.group(1)}.html').read_text(), text)
    return text


def inner_svg(text):
    m = re.search(r'<svg[^>]*viewBox="([^"]+)"[^>]*>(.*)</svg>', text, re.S)
    body = re.sub(r'<title>.*?</title>', '', m.group(2), flags=re.S)
    return m.group(1), body


nav_src = include((SRC / 'nav.html').read_text())
foot_src = include((SRC / 'footer.html').read_text())
page_srcs = [include(p.read_text()) for p in sorted((SRC / 'pages').glob('*.html'))]
js = (SRC / 'app.js').read_text()
css = (SRC / 'style.css').read_text()

symbols = []
used_icons = set()
all_src = nav_src + foot_src + ''.join(page_srcs) + js
used_icons.update(re.findall(r'\{\{i:([a-z0-9-]+)\}\}', all_src))
used_icons.update(re.findall(r'#i-([a-z0-9-]+)', all_src))
for name in sorted(used_icons):
    for sub in ('phosphor/regular', 'phosphor/fill', 'custom'):
        f = KIT / 'icons' / sub / f'{name}.svg'
        if f.exists():
            break
    else:
        raise SystemExit(f'missing icon {name}')
    vb, body = inner_svg(f.read_text())
    body = body.replace('#0F1F17', 'currentColor')  # custom icons carry a fixed ink colour
    symbols.append(f'<symbol id="i-{name}" viewBox="{vb}">{body}</symbol>')

# illustrations
for f in sorted((KIT / 'illustrations' / 'svg').glob('*.svg')):
    vb, body = inner_svg(f.read_text())
    if f.stem == 'reward':  # the site shows a voucher without a made-up percentage
        body, n = re.subn(r'<path d="M-13\.78[^>]*/>', '', body)
        assert n == 1, 'reward glyphs not found'
    symbols.append(f'<symbol id="ill-{f.stem}" viewBox="{vb}">{body}</symbol>')


# logos with themeable colours (CSS custom properties inherit through <use>)
def themed(text):
    text = text.replace('stroke="#127A47"', 'style="stroke:var(--logo-mark,#127A47)"')
    text = text.replace('fill="#127A47"', 'style="fill:var(--logo-mark,#127A47)"')
    text = text.replace('fill="#0F1F17"', 'style="fill:var(--logo-word,#0F1F17)"')
    text = text.replace('fill="#46554D"', 'style="fill:var(--logo-by,#46554D)"')
    return text


for sym, fname in [('logo', 'tcycled-logo.svg'), ('logo-endorsed', 'tcycled-logo-endorsed.svg'), ('mark', 'tcycled-mark.svg')]:
    vb, body = inner_svg(themed((KIT / 'logos' / 'svg' / fname).read_text()))
    # the mark's polygon carries both a fill and a stroke style after theming; merge them
    body = body.replace('style="fill:var(--logo-mark,#127A47)" style="stroke:var(--logo-mark,#127A47)"', 'style="fill:var(--logo-mark,#127A47);stroke:var(--logo-mark,#127A47)"')
    symbols.append(f'<symbol id="{sym}" viewBox="{vb}">{body}</symbol>')

# <use> draws a symbol into a 0 0 w h box, so the outer viewBox starts at 0 0 with the symbol's size
logo_vb = {'logo': '0 0 419.1 110', 'logo-endorsed': '0 0 419.1 134', 'mark': '0 0 100 100'}

# the tcycled bag, drawn for the site (hero, game, billboard, story ad)
vb, body = inner_svg((SRC / 'bag.svg').read_text())
symbols.append(f'<symbol id="bag" viewBox="{vb}">{body}</symbol>')
LOOPLINE = (SRC / 'loopline.txt').read_text().strip()
# the mark as drawable lines (footer loop, brand page)
MARK_LINE = ('<path pathLength="1" d="M43.5 30 L43.5 79 A6.5 6.5 0 0 0 50 85.5 A35.5 35.5 0 0 0 50.62 14.51 A35.5 35.5 0 0 0 24.46 74.66"/>'
             '<path pathLength="1" d="M31.5 38.5 L58.5 38.5"/><polygon points="16.37,82.48 34.54,85.09 32.56,66.85"/>')

# QR and barcode paths
qr = {}
# the cap's QR is a web link: a phone camera opens registration without the app, the app opens it as a universal link
for key, text in [('bag', 'https://tcycled.de/b/4F7K2M9QH8TA'), ('app', 'https://tcycled.de/?q=site'), ('box', 'DHL RETOURE PLACEHOLDER BX7Q-4M2K-T9HD')]:
    qr[key] = qr_path(text)
bar_lines = (HERE / 'bar_hm10.txt').read_text().split('\n')
bar_n, bar_d = int(bar_lines[0]), bar_lines[1]


def render(text):
    text = re.sub(r'\{\{i:([a-z0-9-]+)\}\}', lambda m: f'<svg class="i" aria-hidden="true" focusable="false"><use href="#i-{m.group(1)}"/></svg>', text)
    text = re.sub(r'\{\{ill:([a-z0-9-]+)\}\}', lambda m: f'<svg class="ill" viewBox="0 0 240 240" aria-hidden="true" focusable="false"><use href="#ill-{m.group(1)}"/></svg>', text)
    for sym, vb in logo_vb.items():
        text = text.replace('{{' + sym + '}}', f'<svg class="{sym}" viewBox="{vb}" role="img" aria-label="tcycled"><use href="#{sym}"/></svg>')
    for key, (n, d) in qr.items():
        text = text.replace('{{qr:' + key + '}}', f'<svg class="qr" viewBox="-2 -2 {n + 4} {n + 4}" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path fill="currentColor" d="{d}"/></svg>')
    text = text.replace('{{bag}}', '<use href="#bag"/>')
    text = text.replace('{{loopline}}', LOOPLINE)
    text = text.replace('{{markline}}', MARK_LINE)
    text = text.replace('{{bar:voucher}}', f'<svg class="bar" viewBox="-12 0 {bar_n + 24} 1" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path fill="currentColor" d="{bar_d}"/></svg>')
    left = re.findall(r'\{\{[^}]+\}\}', text)
    if left:
        raise SystemExit(f'unresolved placeholders: {sorted(set(left))[:10]}')
    return text


body = render(nav_src + '<main id="main" tabindex="-1">' + ''.join(page_srcs) + '</main>' + foot_src)
sprite = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">' + ''.join(symbols) + '</svg>'

# fonts are served from the site itself: no request to Google, so no visitor IP leaves for a third party
# bricolage.woff2 is the display face fixed at its display optical size (half the bytes); the full three-axis
# font is only fetched by the type playground on the brand page
FONT_FILES = ['bricolage.woff2', 'bricolage-full.woff2', 'figtree.woff2', 'figtree-italic.woff2', 'dm-mono-400.woff2', 'dm-mono-500.woff2']
font_css = ('@font-face{font-family:"Bricolage Grotesque";src:url(fonts/bricolage.woff2) format("woff2");font-weight:200 800;font-stretch:75% 92%;font-style:normal;font-display:swap}'
            '@font-face{font-family:"Bricolage Grotesque Full";src:url(fonts/bricolage-full.woff2) format("woff2");font-weight:200 800;font-stretch:75% 100%;font-style:normal;font-display:swap}'
            '@font-face{font-family:"Figtree";src:url(fonts/figtree.woff2) format("woff2");font-weight:300 900;font-style:normal;font-display:swap}'
            '@font-face{font-family:"Figtree";src:url(fonts/figtree-italic.woff2) format("woff2");font-weight:300 900;font-style:italic;font-display:swap}'
            '@font-face{font-family:"DM Mono";src:url(fonts/dm-mono-400.woff2) format("woff2");font-weight:400;font-style:normal;font-display:swap}'
            '@font-face{font-family:"DM Mono";src:url(fonts/dm-mono-500.woff2) format("woff2");font-weight:500;font-style:normal;font-display:swap}')
# only the text face is preloaded: it sets the first paragraph, which is what a phone paints first
fonts = '<link rel="preload" href="fonts/figtree.woff2" as="font" type="font/woff2" crossorigin>'

# ad placements: the code in a placement's QR link (?q=code) tells the site which poster or screen sent the visit
import csv
PLACEMENTS = {}
with open(HERE / 'placements.csv', newline='') as fh:
    for row in csv.DictReader(fh):
        if '?q=' in row['link'] or row['code'] == 'radio':
            PLACEMENTS[row['code']] = {'channel': row['channel'], 'motif': row['motif']}

# analytics: off unless a snippet file is given (the hosted build); the preview and the artifact load nothing
import os
snippet_file = os.environ.get('TC_ANALYTICS_SNIPPET')
analytics = Path(snippet_file).read_text().strip() + '\n' if snippet_file else ''

import json
de_file = SRC / 'i18n' / 'de.json'
DE = json.loads(de_file.read_text()) if de_file.exists() else {}
i18n_js = ('window.__TC_DE = ' + json.dumps(DE, ensure_ascii=False).replace('</', '<\\/') + ';\n'
           + 'window.__TC_PLACEMENTS = ' + json.dumps(PLACEMENTS, ensure_ascii=False) + ';')
html = ('<title>tcycled.de</title>\n<meta name="description" content="Put your old clothes in the tcycled bag, scan the cap and send the bag back with your next return. Your voucher comes at the carrier\'s first scan. Sorted by Artus in Bad Oldesloe.">\n'
        + analytics + fonts + '\n<style>\n' + font_css + '\n' + css + '\n</style>\n' + sprite + '\n' + body + '\n<script>\n' + i18n_js + '\n</script>\n<script>\n' + js + '\n</script>\n')
out = DIST / 'index.html'
out.write_text(html)
print(out, round(len(html.encode()) / 1024, 1), 'KB', len(used_icons), 'icons')

# the hosted build: the live site in ../docs, which GitHub Pages serves at tcycled.de (dist/index.html above is the
# single-page preview without a document wrapper)
import shutil
HOST = HERE.parent / 'docs'
if HOST.exists():
    shutil.rmtree(HOST)
(HOST / 'fonts').mkdir(parents=True)
shutil.copytree(HERE / 'assets', HOST / 'assets')
for f in FONT_FILES:
    shutil.copy(HERE / 'fonts' / f, HOST / 'fonts' / f)
if (HERE / 'app.html').exists():
    shutil.copy(HERE / 'app.html', HOST / 'app.html')
# German is the default page on the real domain: the copy is baked into the HTML, so a German visitor never sees
# English flash first and search engines index the German text. English lives next to it as en.html.
sys.path.insert(0, str(HERE))
from pretranslate import to_german  # noqa: E402
ORIGIN = 'https://tcycled.de/'
ALT = ('<link rel="alternate" hreflang="de" href="' + ORIGIN + '">\n<link rel="alternate" hreflang="en" href="' + ORIGIN + 'en.html">\n'
       '<link rel="alternate" hreflang="x-default" href="' + ORIGIN + '">\n')
META = {
    'de': ('tcycled: Alte Klamotten per Post zurück, mit Gutschein',
           'Pack deine alten Klamotten in den tcycled-Beutel, scann den Code am Verschluss und schick den Beutel mit deiner nächsten Retoure zurück. Dein Gutschein kommt beim ersten Scan des Paketdienstes. Sortiert von Artus in Bad Oldesloe.'),
    'en': ('tcycled: old clothes back by post, with a voucher',
           "Put your old clothes in the tcycled bag, scan the cap and send the bag back with your next return. Your voucher comes at the carrier's first scan. Sorted by Artus in Bad Oldesloe."),
}
style_end = html.index('</style>') + 8
script_at = html.index('<script>\nwindow.__TC_DE')
for lg, fname in [('de', 'index.html'), ('en', 'en.html')]:
    markup = html[style_end:script_at]
    if lg == 'de':
        markup, _miss = to_german(markup, DE)
        markup = markup.replace('data-lang="en"', 'data-lang="de"')
        markup = re.sub(r'<img src="([^"]+)" data-src-de="([^"]+)"', r'<img src="\2" data-src-de="\2" data-src-en="\1"', markup)
    title, desc = META[lg]
    head = (html[:style_end].replace('<title>tcycled.de</title>', '<title>' + title + '</title>')
            .replace(re.search(r'<meta name="description" content="[^"]*">', html).group(0), '<meta name="description" content="' + desc.replace('"', '&quot;') + '">'))
    canon = '<link rel="canonical" href="' + ORIGIN + ('' if lg == 'de' else 'en.html') + '">\n'
    canon += '<link rel="icon" href="favicon.svg" type="image/svg+xml">\n<link rel="icon" href="favicon.ico" sizes="32x32">\n<link rel="apple-touch-icon" href="apple-touch-icon.png">\n'
    doc = ('<!doctype html>\n<html lang="' + lg + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
           '<meta name="theme-color" content="#F5F3EC">\n' + canon + ALT + head + '\n</head>\n<body>\n' + markup
           + '<script>window.__TC_SRC = ' + repr(lg) + ';</script>\n' + html[script_at:] + '</body>\n</html>\n')
    (HOST / fname).write_text(doc)
# favicons from the brand kit's app icon
from PIL import Image
shutil.copy(KIT / 'app-icon' / 'tcycled-favicon.svg', HOST / 'favicon.svg')
shutil.copy(KIT / 'app-icon' / 'apple-touch-icon-180.png', HOST / 'apple-touch-icon.png')
Image.open(KIT / 'app-icon' / 'favicon-32.png').convert('RGBA').save(HOST / 'favicon.ico', sizes=[(32, 32), (16, 16)])
(HOST / '_redirects').write_text('# Netlify / Cloudflare Pages\n/b/:code   /?b=:code   302\n/radio     /?q=radio   302\n/q/:code   /?q=:code   302\n')
(HOST / '404.html').write_text("""<!doctype html><meta charset="utf-8"><title>tcycled</title>
<script>
// GitHub Pages has no redirect rules, so unknown paths land here and are sent on
var p = location.pathname.replace(/\\/+$/, ''), m;
if ((m = p.match(/^\\/b\\/([0-9A-Za-z-]{12,14})$/))) location.replace('/?b=' + m[1]);
else if (p === '/radio') location.replace('/?q=radio');
else if ((m = p.match(/^\\/q\\/([a-z0-9-]{1,32})$/))) location.replace('/?q=' + m[1]);
else location.replace('/');
</script>
""")
(HOST / 'CNAME').write_text('tcycled.de\n')  # the custom domain for GitHub Pages
(HOST / '.nojekyll').write_text('')  # serve the files as they are, _redirects included
print(HOST, 'written')
