def srgb(c):
    c/=255
    return c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
def Y(h):
    h=h.lstrip('#'); r,g,b=(int(h[i:i+2],16) for i in (0,2,4))
    return 0.2126*srgb(r)+0.7152*srgb(g)+0.0722*srgb(b)
def C(a,b):
    x,y=Y(a),Y(b); hi,lo=max(x,y),min(x,y)
    return round((hi+0.05)/(lo+0.05),2)

DARK = dict(
  bg="#0a0d13", surface="#1f242d", chip="#2a323f", raised="#2c3542",
  ink="#e8ecf3", ink2="#c3cbd8", muted="#93a0b4",
  line="#232b38", line_strong="#646e7e",
  accent="#4c8dff", accent_text="#7fb0ff", accent_soft="#16233c", on_accent="#04122e",
  ok="#28c076", ok_text="#3ddb8b", warn="#e0a33a", danger="#f0736a",
)
LIGHT = dict(
  bg="#e3e6eb", surface="#ffffff", chip="#e2e7f0", raised="#f7f9fc",
  ink="#0d1420", ink2="#33405270"[:7], muted="#55637a",
  line="#d5dce7", line_strong="#8a96a8",
  accent="#1f6feb", accent_text="#1550b8", accent_soft="#dde9fd", on_accent="#ffffff",
  ok="#0f7a45", ok_text="#0b6739", warn="#8a5a00", danger="#b3261e",
)

FLOORS = [
  ("canvas -> card",        lambda t: C(t['bg'], t['surface']),        1.25),
  ("card -> chip",          lambda t: C(t['surface'], t['chip']),      1.20),
  ("ink vs muted on card",  lambda t: C(t['ink'], t['muted']),         1.70),
  ("muted on card (AA)",    lambda t: C(t['muted'], t['surface']),     4.50),
  ("muted on canvas (AA)",  lambda t: C(t['muted'], t['bg']),          4.50),
  ("muted on chip (AA)",    lambda t: C(t['muted'], t['chip']),        4.50),
  ("ink on card (AA)",      lambda t: C(t['ink'], t['surface']),       4.50),
  ("ink2 on card (AA)",     lambda t: C(t['ink2'], t['surface']),      4.50),
  ("control boundary",      lambda t: C(t['line_strong'], t['surface']),3.00),
  ("accent fill (3:1)",     lambda t: C(t['accent'], t['bg']),         3.00),
  ("accent fill on card",   lambda t: C(t['accent'], t['surface']),    3.00),
  ("accent text on card",   lambda t: C(t['accent_text'], t['surface']),4.50),
  ("accent text on canvas", lambda t: C(t['accent_text'], t['bg']),    4.50),
  ("accent text on soft",   lambda t: C(t['accent_text'], t['accent_soft']),4.50),
  ("on-accent on accent",   lambda t: C(t['on_accent'], t['accent']),  4.50),
  ("ok text on card",       lambda t: C(t['ok_text'], t['surface']),   4.50),
  ("ok text on canvas",     lambda t: C(t['ok_text'], t['bg']),        4.50),
  ("warn on card",          lambda t: C(t['warn'], t['surface']),      4.50),
  ("danger on card",        lambda t: C(t['danger'], t['surface']),    4.50),
  ("danger on canvas",      lambda t: C(t['danger'], t['bg']),         4.50),
]

fails=0
for name,t in (("DARK",DARK),("LIGHT",LIGHT)):
    print(f"\n{name}")
    for label,fn,floor in FLOORS:
        v=fn(t); ok = v>=floor
        if not ok: fails+=1
        print(f"  {'ok  ' if ok else 'FAIL'} {label:<24} {v:>6}  (>= {floor})")
print(f"\n{fails} failures")
