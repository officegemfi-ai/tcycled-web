"""Bake the German copy into the HTML at build time (the hosted German page), exactly as the runtime walker would."""
import html as H
import re
from html.parser import HTMLParser

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
SKIP_TAGS = {'script', 'style', 'code', 'pre'}
ATTRS = ['aria-label', 'alt', 'placeholder', 'title', 'data-title', 'data-copied']
norm = lambda s: re.sub(r'\s+', ' ', s).strip()


class _P(HTMLParser):
    def __init__(self, src, de):
        super().__init__(convert_charrefs=True)
        self.src, self.de = src, de
        self.lines = [0]
        for m in re.finditer('\n', src):
            self.lines.append(m.end())
        self.stack = []          # (tag, skip_text, skip_attr)
        self.edits = []          # (start, end, replacement)
        self.pending = None      # data start offset
        self.misses = set()

    def off(self):
        ln, col = self.getpos()
        return self.lines[ln - 1] + col

    def _skip(self):
        return bool(self.stack) and self.stack[-1][1]

    def handle_starttag(self, tag, attrs):
        self._tag(tag, attrs, closing=False)

    def handle_startendtag(self, tag, attrs):
        self._tag(tag, attrs, closing=True)

    def _tag(self, tag, attrs, closing):
        a = dict(attrs)
        cls = (a.get('class') or '').split()
        own = tag in SKIP_TAGS or 'code' in cls or 'en' in cls or 'de' in cls or a.get('translate') == 'no'
        parent_text = self._skip()
        parent_attr = bool(self.stack) and self.stack[-1][2]
        skip_text = parent_text or own
        skip_attr = parent_attr or 'en' in cls or 'de' in cls or a.get('translate') == 'no'
        raw = self.get_starttag_text()
        start = self.off()
        if not skip_attr and any(k in a for k in ATTRS):
            new = raw
            for k in ATTRS:
                if k in a and a[k]:
                    v = self.de.get(norm(a[k]))
                    if v:
                        new = re.sub(r'(\s' + re.escape(k) + r'=")([^"]*)(")', lambda m: m.group(1) + H.escape(v, quote=True) + m.group(3), new, count=1)
            if new != raw:
                self.edits.append((start, start + len(raw), new))
        if not closing and tag not in VOID:
            self.stack.append((tag, skip_text, skip_attr))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if not data.strip() or self._skip():
            return
        start = self.off()
        raw_end = self.src.find('<', start)
        raw_end = len(self.src) if raw_end < 0 else raw_end
        raw = self.src[start:raw_end]
        v = self.de.get(norm(H.unescape(raw)))
        if v is None:
            self.misses.add(norm(H.unescape(raw)))
            return
        lead = re.match(r'^\s*', raw).group(0)
        trail = re.search(r'\s*$', raw).group(0)
        self.edits.append((start, raw_end, lead + H.escape(v, quote=False) + trail))


def to_german(src, de):
    p = _P(src, de)
    p.feed(src)
    p.close()
    out, last = [], 0
    for s, e, r in sorted(p.edits):
        if s < last:
            continue
        out.append(src[last:s]); out.append(r); last = e
    out.append(src[last:])
    return ''.join(out), p.misses
