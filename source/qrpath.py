import segno, sys, json
def qr_path(text, ecc='m'):
    q = segno.make(text, error=ecc, micro=False)
    m = [list(r) for r in q.matrix]
    n = len(m)
    # merge horizontal runs into rects
    parts = []
    for y,row in enumerate(m):
        x = 0
        while x < n:
            if row[x]:
                s = x
                while x < n and row[x]: x += 1
                parts.append(f"M{s} {y}h{x-s}v1h-{x-s}z")
            else:
                x += 1
    return n, ''.join(parts)
if __name__ == '__main__':
    out = {}
    for key, text in [('bag', 'TC 4F7K-2M9Q-H8TA'), ('label', 'TC LABEL HM-7Q2D-RC41')]:
        n, d = qr_path(text)
        out[key] = {'n': n, 'd': d}
        print(key, n, len(d))
    json.dump(out, open(sys.argv[1], 'w'))
