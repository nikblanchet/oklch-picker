const W = 760,
  H = 1200
function rng(s) {
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let R
const gauss = () =>
  Math.max(
    -1.9,
    Math.min(1.9, Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(6.283 * R()))
  )
function wave(n = 3) {
  const p = Array.from({ length: n }, () => [R() * 6.28, 0.6 + R() * 1.2])
  return t =>
    p.reduce((a, [f, k], i) => a + Math.sin(f + t * k * 2 ** i) / (i + 1), 0) /
    1.6
}
function spline(p, step = 5) {
  if (p.length < 3) {
    const [a, b] = p,
      n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)
    return Array.from({ length: n + 1 }, (_, i) =>
      a.map((v, k) => v + ((b[k] - v) * i) / n)
    )
  }
  const o = []
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i],
      b = p[i],
      c = p[i + 1],
      d = p[i + 2] ?? c,
      n = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / step))
    for (let j = 0; j < n; j++) {
      const t = j / n
      o.push(
        b.map(
          (_, k) =>
            0.5 *
            (2 * b[k] +
              (c[k] - a[k]) * t +
              (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t +
              (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t ** 3)
        )
      )
    }
  }
  o.push(p.at(-1))
  return o
}
const shape = (segs, step) => segs.flatMap(s => spline(s, step))
function normals(l) {
  return l.map((p, i) => {
    const a = l[i - 1] ?? p,
      b = l[i + 1] ?? p,
      x = b[0] - a[0],
      y = b[1] - a[1],
      d = Math.hypot(x, y) || 1
    return [-y / d, x / d]
  })
}
function fill(c, poly) {
  c.beginPath()
  poly.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
  c.closePath()
  c.fill()
}
function ribbon(l, width) {
  const n = normals(l),
    a = [],
    b = []
  l.forEach((p, i) => {
    const w = width(i / (l.length - 1), p) / 2
    a.push([p[0] + n[i][0] * w, p[1] + n[i][1] * w])
    b.push([p[0] - n[i][0] * w, p[1] - n[i][1] * w])
  })
  return [a, b]
}
function pen(c, pts, w = 3, alpha = 0.92, dense = false) {
  let l = dense ? pts : spline(pts, 3)
  const wv = wave(),
    j = wave(),
    n = normals(l),
    len = l.length
  l = l.map((p, i) => [
    p[0] + n[i][0] * j(i / 22) * 0.9,
    p[1] + n[i][1] * j(i / 22) * 0.9
  ])
  const [a, b] = ribbon(
    l,
    t =>
      w *
      1.25 *
      Math.max(
        0.1,
        Math.sin(Math.PI * Math.min(1, 0.04 + t * 0.95)) ** 0.55 *
          (0.72 + 0.55 * wv((t * len) / 26))
      )
  )
  c.fillStyle = `rgba(24,22,26,${alpha})`
  fill(c, [...a, ...b.reverse()])
}
function deform(poly, depth, amt, vari) {
  let p = poly.map((q, i) => [q[0], q[1], vari(i)])
  for (let d = 0; d < depth; d++) {
    const o = []
    p.forEach((a, i) => {
      const b = p[(i + 1) % p.length],
        len = Math.hypot(b[0] - a[0], b[1] - a[1]),
        v = (a[2] + b[2]) / 2
      o.push(a, [
        (a[0] + b[0]) / 2 + gauss() * len * amt * v,
        (a[1] + b[1]) / 2 + gauss() * len * amt * v,
        v * (0.75 + R() * 0.4)
      ])
    })
    p = o
  }
  return p
}
function washPoly(
  c,
  poly,
  { layers = 16, alpha = 0.1, core = 0.8, amt = 0.2, rgb = '0,0,0', edge } = {}
) {
  const wv = wave(),
    vari = i => 0.35 + Math.max(0, wv(i / 2.2)) * 1.5
  const base = deform(poly, 1, amt * 0.5, vari)
  c.fillStyle = `rgba(${rgb},${core})`
  fill(
    c,
    deform(base, 3, amt * 0.45, i => base[i][2])
  )
  for (let i = 0; i < layers; i++) {
    const d = deform(base, 4, amt, k => base[k][2])
    c.fillStyle = `rgba(${rgb},${alpha})`
    fill(c, d)
    if (edge && i % 4 == 0) {
      edge.strokeStyle = 'rgba(20,16,24,.07)'
      edge.lineWidth = 2.2
      edge.beginPath()
      d.forEach(([x, y], k) => (k ? edge.lineTo(x, y) : edge.moveTo(x, y)))
      edge.closePath()
      edge.stroke()
    }
  }
}
function brush(c, pts, w, o) {
  const l = spline(pts, 16),
    [a, b] = ribbon(
      l,
      t =>
        w *
        Math.sin(Math.PI * (0.06 + t * 0.9)) ** 0.7 *
        (o.grow ? 0.35 + t * 0.9 : 1)
    )
  washPoly(c, [...a, ...b.reverse()], o)
}
function cv() {
  const e = document.createElement('canvas')
  e.width = W
  e.height = H
  return e.getContext('2d')
}
function noise(scale, lo, hi, max) {
  const s = document.createElement('canvas')
  s.width = Math.ceil(W / scale)
  s.height = Math.ceil(H / scale)
  const c = s.getContext('2d'),
    d = c.createImageData(s.width, s.height)
  for (let i = 3; i < d.data.length; i += 4)
    d.data[i] = 255 * max * Math.min(1, Math.max(0, (R() - lo) / (hi - lo)))
  c.putImageData(d, 0, 0)
  return s
}
function head(ink, hairc, { x, y, tilt = 0, turn = 1, hair, shades }) {
  const T = ([a, b]) => [
      x + a * turn * Math.cos(tilt) - b * Math.sin(tilt),
      y + a * turn * Math.sin(tilt) + b * Math.cos(tilt)
    ],
    m = p => p.map(T)
  pen(
    ink,
    m([
      [30, -14],
      [32, 6],
      [27, 26],
      [16, 43],
      [5, 50],
      [-8, 46],
      [-22, 30],
      [-29, 10]
    ]),
    2.1
  )
  for (const h of hair.mass)
    washPoly(hairc, shape(h.map(m), 12), {
      layers: 8,
      alpha: 0.1,
      core: 0.74,
      amt: 0.13,
      rgb: '26,23,28'
    })
  for (const l of hair.lines ?? []) pen(ink, m(l), 2)
  if (shades) {
    washPoly(
      ink,
      shape(
        [
          m([
            [-20, -4],
            [-4, -7],
            [4, -3],
            [2, 8],
            [-10, 12],
            [-20, 6],
            [-20, -4]
          ])
        ],
        6
      ),
      { layers: 2, core: 0.9, amt: 0.05, rgb: '24,22,26' }
    )
    washPoly(
      ink,
      shape(
        [
          m([
            [10, -4],
            [24, -8],
            [33, -4],
            [31, 7],
            [20, 11],
            [11, 6],
            [10, -4]
          ])
        ],
        6
      ),
      { layers: 2, core: 0.9, amt: 0.05, rgb: '24,22,26' }
    )
    pen(
      ink,
      m([
        [-30, -4],
        [0, -6],
        [33, -6]
      ]),
      2.4
    )
  } else if (shades !== null) {
    pen(
      ink,
      m([
        [-17, 2],
        [-8, 6],
        [2, 3]
      ]),
      2.6
    )
    pen(
      ink,
      m([
        [14, 2],
        [21, 5],
        [29, 0]
      ]),
      2.4
    )
    pen(
      ink,
      m([
        [-19, -8],
        [-9, -12],
        [1, -9]
      ]),
      1.3,
      0.6
    )
    pen(
      ink,
      m([
        [14, -10],
        [22, -13],
        [29, -9]
      ]),
      1.3,
      0.6
    )
  }
  pen(
    ink,
    m([
      [13, 10],
      [15, 18],
      [10, 21]
    ]),
    1.4,
    0.6
  )
  pen(
    ink,
    m([
      [1, 31],
      [7, 29],
      [10, 31],
      [13, 29],
      [18, 31]
    ]),
    3.2
  )
  pen(
    ink,
    m([
      [4, 33],
      [10, 36],
      [16, 33]
    ]),
    2.6
  )
}
function render(look, seed) {
  R = rng(seed)
  const mask = cv(),
    shade = cv(),
    ink = cv(),
    dark = cv(),
    skin = cv(),
    under = cv(),
    solid = cv(),
    soft = cv()
  for (const g of look.garment) {
    fill(solid, shape(g, 5))
    const poly = shape(g, 30)
    washPoly(
      mask,
      poly.map(([x, y]) => [x + 3, y + 2]),
      {
        layers: 26,
        alpha: 0.1,
        core: 0.93,
        amt: 0.235,
        edge: look.edge === false ? undefined : shade
      }
    )
  }
  for (const [p, w] of look.bleed ?? [])
    brush(soft, p, w * 1.5, { layers: 20, alpha: 0.022, core: 0.04, amt: 0.36 })
  mask.filter = 'blur(2.5px)'
  mask.drawImage(soft.canvas, 0, 0)
  mask.filter = 'none'
  soft.clearRect(0, 0, W, H)
  for (const [x, y, n, s] of look.splat ?? [])
    for (let i = 0; i < n; i++) {
      mask.fillStyle = `rgba(0,0,0,${0.35 + R() * 0.5})`
      mask.beginPath()
      mask.arc(x + gauss() * s, y + gauss() * s * 0.8, 0.8 + R() ** 3 * 6, 0, 7)
      mask.fill()
    }
  mask.globalCompositeOperation = 'destination-out'
  for (const [p, w] of look.light ?? []) {
    brush(soft, p, w * 1.25, {
      layers: 9,
      alpha: 0.035,
      core: 0.14,
      amt: 0.3,
      grow: 1
    })
    brush(
      mask,
      p.map(([x, y]) => [x - w * 0.15, y]),
      w * 0.42,
      { layers: 4, alpha: 0.06, core: 0.3, amt: 0.22, grow: 1 }
    )
  }
  mask.filter = 'blur(5px)'
  mask.drawImage(soft.canvas, 0, 0)
  soft.clearRect(0, 0, W, H)
  mask.filter = 'blur(9px)'
  mask.drawImage(noise(80, 0.68, 1, 0.34), 0, 0, W, H)
  mask.filter = 'blur(2px)'
  mask.drawImage(noise(14, 0.7, 1, 0.09), 0, 0, W, H)
  mask.filter = 'none'
  mask.drawImage(noise(2, 0.5, 1, 0.05), 0, 0, W, H)
  for (const [p, w] of look.fold ?? []) {
    brush(soft, p, w * 1.1, {
      layers: 8,
      alpha: 0.014,
      core: 0.07,
      amt: 0.3,
      rgb: '18,12,26',
      grow: 1
    })
    brush(
      shade,
      p.map(([x, y]) => [x + w * 0.2, y]),
      w * 0.5,
      {
        layers: 5,
        alpha: 0.014,
        core: 0.05,
        amt: 0.26,
        rgb: '18,12,26',
        grow: 1
      }
    )
  }
  shade.filter = 'blur(6px)'
  shade.drawImage(soft.canvas, 0, 0)
  shade.filter = 'none'
  // Flat planes in the shadow (positive) or in the light (negative)
  for (const [corners, tone] of look.facet ?? []) {
    const plane = shape(
      corners.map((p, i) => [p, corners[(i + 1) % corners.length]]),
      24
    )
    washPoly(tone > 0 ? shade : mask, plane, {
      layers: 5,
      alpha: Math.abs(tone) / 9,
      core: Math.abs(tone),
      amt: 0.1,
      rgb: '18,12,26'
    })
  }
  for (const l of look.limb ?? []) {
    const c = spline(l, 3),
      [a, b] = ribbon(c, (t, p) => p[2])
    fill(skin, [...a, ...b.toReversed()])
    if (!l.under) {
      pen(ink, a, 2.1, 0.88, true)
      pen(ink, b.slice(Math.floor(b.length * 0.06)), 1.5, 0.8, true)
    }
  }
  for (const l of look.legs ?? []) {
    const c = spline(l, 3),
      [a, b] = ribbon(c, (t, p) => p[2])
    pen(under, a, 2.1, 0.88, true)
    pen(under, b, 1.6, 0.8, true)
    mask.save()
    mask.globalCompositeOperation = 'source-over'
    mask.restore()
  }
  for (const d of look.boots ?? [])
    washPoly(under, shape(d, 12), {
      layers: 7,
      alpha: 0.1,
      core: 0.8,
      amt: 0.1,
      rgb: '26,23,28'
    })
  under.globalCompositeOperation = 'destination-out'
  under.drawImage(solid.canvas, 0, 0)
  for (const s of look.skin ?? []) fill(skin, shape(s, 5))
  for (const d of look.dark ?? []) {
    const p = shape(d, 12)
    washPoly(dark, p, {
      layers: 7,
      alpha: 0.1,
      core: 0.8,
      amt: 0.1,
      rgb: '26,23,28'
    })
    fill(skin, p)
  }
  mask.drawImage(skin.canvas, 0, 0)
  {
    const im = mask.getImageData(0, 0, W, H),
      q = im.data
    for (let i = 3; i < q.length; i += 4) {
      const a = q[i] / 255,
        x = (i >> 2) % W,
        k = Math.min(1, Math.max(0, (a - 0.35) / 0.4))
      q[i] =
        255 *
        (a + (1 - (1 - a) ** 1.08 - a) * k) *
        Math.min(1, x / 24, (W - x) / 24)
    }
    mask.putImageData(im, 0, 0)
  }
  shade.globalCompositeOperation = 'destination-in'
  shade.drawImage(mask.canvas, 0, 0)
  head(ink, dark, look.head)
  for (const [p, w = 2.6, a] of look.line) pen(ink, p, w, a)
  dark.globalCompositeOperation = 'destination-out'
  dark.filter = 'blur(3px)'
  dark.drawImage(noise(22, 0.5, 1, 0.35), 0, 0, W, H)
  const top = cv()
  brush(top, look.ground, 20, {
    layers: 8,
    alpha: 0.018,
    core: 0.04,
    amt: 0.3,
    rgb: '20,18,24'
  })
  top.globalCompositeOperation = 'destination-out'
  top.drawImage(mask.canvas, 0, 0)
  top.globalCompositeOperation = 'source-over'
  top.drawImage(shade.canvas, 0, 0)
  top.drawImage(under.canvas, 0, 0)
  top.drawImage(dark.canvas, 0, 0)
  top.drawImage(ink.canvas, 0, 0)
  const d = mask.getImageData(0, 0, W, H).data,
    al = []
  for (let i = 3; i < d.length; i += 4) if (d[i] > 60) al.push(d[i])
  al.sort((a, b) => a - b)
  const sil = cv()
  sil.drawImage(solid.canvas, 0, 0)
  sil.drawImage(skin.canvas, 0, 0)
  for (const l of look.legs ?? []) {
    const [a, b] = ribbon(spline(l, 3), (t, p) => p[2])
    fill(sil, [...a, ...b.reverse()])
  }
  for (const d of look.boots ?? []) fill(sil, shape(d, 5))
  for (let i = 0; i < 4; i++) sil.drawImage(dark.canvas, 0, 0)
  sil.beginPath()
  sil.ellipse(look.head.x, look.head.y, 34, 52, 0, 0, 7)
  sil.fill()
  for (const b of look.body ?? []) fill(sil, shape(b, 5))
  return {
    mask: mask.canvas,
    top: top.canvas,
    sil: sil.canvas,
    median: al[al.length >> 1] / 255
  }
}
function move(look, cx, k, over) {
  const f = p => [cx + (p[0] - 380) * k, p[1], ...p.slice(2)],
    pts = l => l.map(f),
    segs = g => g?.map(s => s.map(pts)),
    strokes = g => g?.map(([p, ...r]) => [pts(p), ...r])
  return {
    ...look,
    head: {
      ...look.head,
      x: f([look.head.x, 0])[0],
      turn: look.head.turn * Math.sign(k),
      tilt: look.head.tilt * Math.sign(k),
      ...over.head
    },
    ground: pts(look.ground),
    garment: segs(look.garment),
    skin: segs(look.skin),
    dark: segs(look.dark),
    boots: segs(look.boots),
    body: segs(look.body),
    limb: look.limb?.map(pts),
    legs: look.legs?.map(pts),
    light: strokes(look.light),
    fold: strokes(look.fold),
    line: strokes(look.line),
    bleed: over.bleed,
    splat: over.splat
  }
}
function renderPair(front, back, seed) {
  const b = render(back, seed),
    f = render(front, seed + 1)
  for (const c of [b.mask, b.top]) {
    const x = c.getContext('2d')
    x.globalCompositeOperation = 'destination-out'
    x.drawImage(f.sil, 0, 0)
  }
  const t = b.top.getContext('2d')
  t.globalCompositeOperation = 'source-over'
  t.drawImage(f.top, 0, 0)
  return { front: f.mask, back: b.mask, top: b.top }
}
