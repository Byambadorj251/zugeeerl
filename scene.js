'use strict';

// A tiny dependency-free 3D renderer: modeled surfaces, perspective projection,
// depth sorting and directional lighting. Works directly from index.html.
(() => {
  const canvas = document.getElementById('garden');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const gift = document.getElementById('gift');
  const giftScreen = document.getElementById('gift-screen');
  const controls = document.getElementById('controls');
  const TAU = Math.PI * 2;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches;
  let width = 0, height = 0, scale = 1;
  let angle = -.22, tilt = -.09, desiredAngle = -.22, desiredTilt = -.09;
  let time = 0, previous = 0, blooming = 1, bloomStart = -100;
  let drag = null, lastFrame = 0;
  let opened = false, reveal = 0, revealStart = 0, giftTimer;
  let mode = 'bouquet', heartStart = 0;
  const confetti = [];
  const particles = Array.from({ length: 75 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), phase: Math.random() * TAU }));
  const bursts = [];
  const meshes = [];
  const rosePetals = [];
  const flowers = [
    { x: .04, y: 1.04, z: -.12, size: .91, color: [247, 156, 188], bend: -.1, lean: -.12, turn: -.1 },
    { x: -1.01, y: .24, z: .13, size: .72, color: [255, 190, 209], bend: -.26, lean: .14, turn: -.27 },
    { x: 1.04, y: .36, z: .03, size: .74, color: [235, 126, 171], bend: .22, lean: -.2, turn: .27 },
    { x: -.47, y: -.62, z: .68, size: .68, color: [243, 144, 181], bend: -.13, lean: .1, turn: -.12 },
    { x: .79, y: -.68, z: .55, size: .52, color: [255, 202, 215], bend: .2, lean: .2, turn: .2 },
  ];
  const heartModels = [
    { x: 1.35, y: 1.95, z: .1, size: .45, phase: 1.6, rot: -.26 },
    { x: -1.37, y: 1.5, z: -.1, size: .27, phase: 3, rot: .28 },
    { x: 1.65, y: -.7, z: .5, size: .22, phase: 4, rot: -.2 },
  ];
  function surface(fn, nu, nv, color, target = meshes, kind = 'flower') {
    const grid = [];
    for (let u = 0; u <= nu; u++) {
      grid[u] = [];
      for (let v = 0; v <= nv; v++) grid[u][v] = fn(u / nu, v / nv);
    }
    for (let u = 0; u < nu; u++) for (let v = 0; v < nv; v++) {
      target.push({ points: [grid[u][v], grid[u + 1][v], grid[u + 1][v + 1], grid[u][v + 1]], color, kind });
    }
  }
  function leaf(x, y, z, direction, size) {
    surface((u, v) => {
      const side = v * 2 - 1;
      const width = Math.pow(Math.sin(Math.PI * u), .85) * side;
      return [x + direction * u * size,
        y + u * size * .66 + width * size * .14,
        z + width * size * .27 + Math.sin(u * Math.PI) * .13 - Math.abs(width) * .1];
    }, 12, 6, [65, 126, 100], meshes, 'stem');
  }
  for (const flower of flowers) {
    const { x, y, z, size, color } = flower;
    surface((u, v) => {
      const yy = -2.48 + (y + 2.48) * u;
      const xx = x * u + flower.bend * Math.sin(u * Math.PI);
      const radius = .023 * (.6 + .4 * u);
      return [xx + Math.cos(v * TAU) * radius, yy, z * u - .16 + Math.sin(v * TAU) * radius];
    }, 16, 8, [70, 126, 97], meshes, 'stem');
    leaf(x * .48, -1.48, z * .48 - .13, x < 0 ? -1 : 1, .65);
    leaf(x * .78, -.55, z * .78 - .2, x < 0 ? -1 : 1, .77);
    // Each petal is a continuous, rounded, cupped surface, shaded as one piece.
    // This avoids the sharp tips and faceted grid of the old flower heads.
    const radii = [1, .83, .65, .48, .32, .19];
    const counts = [8, 7, 6, 5, 4, 3];
    function orient([px, py, pz]) {
      const ly = py * Math.cos(flower.lean) - pz * Math.sin(flower.lean);
      const lz = py * Math.sin(flower.lean) + pz * Math.cos(flower.lean);
      return [(px * Math.cos(flower.turn) + lz * Math.sin(flower.turn)) * size,
        ly * size, (-px * Math.sin(flower.turn) + lz * Math.cos(flower.turn)) * size];
    }
    for (let layer = 0; layer < radii.length; layer++) {
      const radius = radii[layer], count = counts[layer];
      for (let petal = 0; petal < count; petal++) {
        const a = petal / count * TAU + layer * .73 + flower.turn;
        const span = Math.PI / count * 1.48;
        const asymmetry = Math.sin(petal * 2.7 + layer * 1.3) * .035;
        function petalPoint(u, side) {
          const theta = a + side * span + (1 - u) * .17;
          // A broad scalloped crown instead of a pointed, star-shaped petal.
          const crown = Math.sqrt(Math.max(0, 1 - side * side));
          const reach = radius * (.14 + .86 * Math.sin(u * Math.PI / 2)) * (.8 + .2 * crown);
          const cup = -.22 * (1 - u) + layer * .063
            + radius * (.2 * Math.sin(u * Math.PI) - .16 * Math.pow(u, 6) * crown + .19 * side * side * u)
            + asymmetry * u;
          return orient([Math.cos(theta) * reach, Math.sin(theta) * reach, cup]);
        }
        const edge = [];
        for (let i = 0; i <= 8; i++) edge.push(petalPoint(i / 8, -1));
        for (let i = 1; i <= 24; i++) edge.push(petalPoint(1, i / 12 - 1));
        for (let i = 7; i >= 0; i--) edge.push(petalPoint(i / 8, 1));
        for (let i = 1; i < 8; i++) edge.push(petalPoint(0, 1 - i / 4));
        const lip = [];
        for (let i = 0; i <= 24; i++) lip.push(petalPoint(1, i / 12 - 1));
        rosePetals.push({ center: [x, y, z], edge, lip, root: petalPoint(.06, 0), tip: petalPoint(1, 0),
          color, layer, a, depth: orient([Math.cos(a) * radius * .63, Math.sin(a) * radius * .63, layer * .063 + .04]) });
      }
    }
  }
  function addRosePetals(faces, sway) {
    for (const petal of rosePetals) {
      const open = .58 + .42 * blooming;
      const world = point => transform([
        petal.center[0] + point[0] * open + sway * (petal.center[1] + 2.5),
        petal.center[1] + point[1] * open,
        petal.center[2] + point[2] + (1 - blooming) * Math.hypot(point[0], point[1]) * .5,
      ]);
      const depth = world(petal.depth);
      const front = Math.cos(angle + petal.a * .08) * Math.cos(tilt);
      const light = .88 + .1 * Math.sin(petal.a + .8) + .035 * front;
      const tint = (factor, white = 0) => petal.color.map(v => Math.round(Math.min(255, v * factor + (255 - v) * white)));
      faces.push({ p: petal.edge.map(point => project(world(point))), z: depth[2], petal: true,
        lip: petal.lip.map(point => project(world(point))),
        root: project(world(petal.root)), tip: project(world(petal.tip)),
        colors: [tint(light * .53), tint(light * .82, .04), tint(light, .12), tint(light, .3)] });
    }
  }
  // Rounded solid hearts, built as front/back surfaces of a parametric outline.
  const heartMesh = [];
  for (const sign of [-1, 1]) {
    surface((u, v) => {
      const a = v * TAU;
      const x = 16 * Math.pow(Math.sin(a), 3) / 17;
      const y = (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17;
      return [x * u, y * u, sign * .38 * Math.sqrt(Math.max(0, 1 - u * u))];
    }, 9, 36, [239, 106, 157], heartMesh, 'heart');
  }
  // Smooth, symmetric heart contour with rounded shoulders and a soft cleft.
  const contourSegments = [
    [[0, .64], [-.18, .64], [-.24, 1.04], [-.63, 1.04]],
    [[-.63, 1.04], [-1.31, 1.04], [-1.34, .23], [-.83, -.35]],
    [[-.83, -.35], [-.57, -.65], [-.24, -.92], [0, -1.1]],
    [[0, -1.1], [.24, -.92], [.57, -.65], [.83, -.35]],
    [[.83, -.35], [1.34, .23], [1.31, 1.04], [.63, 1.04]],
    [[.63, 1.04], [.24, 1.04], [.18, .64], [0, .64]],
  ];
  const outline = [], distances = [0];
  for (let i = 0; i <= 960; i++) {
    const position = i / 960 * contourSegments.length;
    const segment = Math.min(contourSegments.length - 1, Math.floor(position));
    const t = position - segment, s = 1 - t;
    const points = contourSegments[segment];
    outline.push([0, 1].map(axis => s * s * s * points[0][axis] + 3 * s * s * t * points[1][axis]
      + 3 * s * t * t * points[2][axis] + t * t * t * points[3][axis]));
    if (i) distances.push(distances[i - 1] + Math.hypot(outline[i][0] - outline[i - 1][0], outline[i][1] - outline[i - 1][1]));
  }
  function heartPoint(fraction) {
    const distance = fraction * distances[distances.length - 1];
    let low = 0, high = distances.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (distances[mid] < distance) low = mid; else high = mid;
    }
    const mix = (distance - distances[low]) / (distances[high] - distances[low]);
    return outline[high].map((v, axis) => outline[low][axis] + (v - outline[low][axis]) * mix);
  }
  const heartDots = [];
  const edgeCount = 180, surfaceCount = 2200, insideCount = 420;
  const heartPalette = [[139, 100, 255], [204, 105, 239], [248, 111, 182], [255, 193, 217]];
  function createDot(r, fraction, z, index, edge = false) {
    const [hx, hy] = heartPoint(fraction);
    const x = hx * r * 1.88, y = hy * r * 1.88 + .1;
    const level = Math.max(0, Math.min(.9999, (y + 1.97) / 4.03)) * 3;
    const band = Math.floor(level), blend = level - band;
    const pearl = Math.max(0, 1 - Math.hypot((x + .65) * .55, (y - .9) * .65)) * .23 * Math.max(0, z / .8);
    const color = heartPalette[band].map((channel, axis) => {
      const base = channel + (heartPalette[band + 1][axis] - channel) * blend;
      return Math.round(base + (255 - base) * pearl);
    });
    return { x, y, z, phase: index * 2.39996,
      size: (edge ? .73 : .61) + (index * .618034 % 1) * .49, color, edge };
  }
  // Mirrored samples maintain even density on both halves, including in depth.
  for (let i = 0; i < edgeCount; i++) heartDots.push(createDot(1, i / edgeCount, 0, i, true));
  const filling = [];
  for (let i = 0; i < surfaceCount / 2; i++) {
    const r = Math.sqrt((i + .5) / (surfaceCount / 2));
    const z = (i % 2 ? 1 : -1) * .82 * Math.sqrt(1 - r * r);
    const fraction = (i * .61803398875 % 1) * .5;
    filling.push(createDot(r, fraction, z, i * 2 + edgeCount));
    filling.push(createDot(r, 1 - fraction, z, i * 2 + edgeCount + 1));
  }
  for (let i = 0; i < insideCount / 2; i++) {
    const r = Math.sqrt((i + .5) / (insideCount / 2)) * .93;
    const z = ((i * .754877666 % 1) * 2 - 1) * .72 * Math.sqrt(1 - r * r);
    const fraction = (i * .61803398875 % 1) * .5;
    filling.push(createDot(r, fraction, z, i * 2 + edgeCount + surfaceCount));
    filling.push(createDot(r, 1 - fraction, z, i * 2 + edgeCount + surfaceCount + 1));
  }
  filling.sort((a, b) => a.y - b.y || a.x - b.x);
  heartDots.push(...filling);
  heartDots.forEach((dot, i) => { dot.delay = i < edgeCount ? i * .0045 : .81 + (i - edgeCount) * .0017; });
  const heartDuration = heartDots[heartDots.length - 1].delay + .75;
  function drawDotHeart() {
    const elapsed = time - heartStart;
    const beat = 1 + .013 * Math.pow(Math.max(0, Math.sin(time * 2.5)), 4);
    const visible = [];
    for (const dot of heartDots) {
      const progress = Math.max(0, Math.min(1, (elapsed - dot.delay) / .7));
      if (progress === 0) continue;
      const travel = Math.pow(1 - progress, 3);
      const point = transform([
        dot.x * beat + Math.cos(dot.phase) * travel * .48,
        dot.y * beat - travel * .55,
        dot.z * beat + Math.sin(dot.phase) * travel * .6,
      ]);
      const [x, y] = project(point);
      const depth = 8 / (8 - point[2]);
      const shimmer = .93 + .07 * Math.sin(time * 1.5 + dot.phase);
      visible.push({ x, y, z: point[2], radius: Math.max(.68, scale * .0105) * dot.size * depth,
        alpha: progress * shimmer * Math.max(.22, Math.min(1, .64 + point[2] * .39)), color: dot.color,
        pearl: dot.z > .3 && Math.sin(dot.phase) > .88 });
    }
    visible.sort((a, b) => a.z - b.z);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const dot of visible) {
      ctx.fillStyle = `rgba(${dot.color.join(',')},${dot.alpha * .035})`;
      ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.radius * 4.2, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(${dot.color.join(',')},${dot.alpha * .11})`;
      ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.radius * 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(${dot.color.join(',')},${dot.alpha})`;
      ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.radius, 0, TAU); ctx.fill();
      if (dot.pearl) {
        ctx.fillStyle = `rgba(255,235,248,${dot.alpha * .8})`;
        ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.radius * .48, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;
    const dpr = Math.min(devicePixelRatio || 1, 1.6);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(width * .205, height * .135);
    draw();
  }
  function transform(point) {
    const [x, y, z] = point;
    const a = Math.cos(angle), b = Math.sin(angle), c = Math.cos(tilt), d = Math.sin(tilt);
    const xx = x * a + z * b, zz = -x * b + z * a;
    return [xx, y * c - zz * d, y * d + zz * c];
  }
  function project(point) {
    const depth = 8 / (8 - point[2]);
    return [width * .5 + point[0] * scale * depth,
      height * .47 - point[1] * scale * depth];
  }
  function makeFace(points, color, kind, list) {
    const p = points.map(transform);
    const a = p[0], b = p[1], c = p[2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const diffuse = Math.max(0, (-nx * .4 + ny * .65 + nz * .64) / length);
    const shine = Math.pow(Math.max(0, (-nx * .3 + ny * .48 + nz * .825) / length), kind === 'heart' ? 30 : 12);
    const brightness = .36 + diffuse * .68;
    const rgb = color.map(v => Math.min(255, Math.round(v * brightness + shine * (kind === 'heart' ? 90 : 29))));
    list.push({ p: p.map(project), z: p.reduce((s, q) => s + q[2], 0) / 4, rgb });
  }
  function addHeart(model, list, extra = false) {
    const float = Math.sin(time * .8 + model.phase) * .095;
    const rot = model.rot + Math.sin(time * .6 + model.phase) * .14;
    const size = model.size * (1 + .025 * Math.sin(time * 2 + model.phase));
    for (const face of heartMesh) {
      makeFace(face.points.map(([x, y, z]) => [model.x + (x * Math.cos(rot) + z * Math.sin(rot)) * size,
        model.y + y * size + float, model.z + (-x * Math.sin(rot) + z * Math.cos(rot)) * size]),
      extra ? [255, 132, 177] : face.color, 'heart', list);
    }
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    // Soft pools of light behind the geometry.
    const center = project([0, .2, 0]);
    const glow = ctx.createRadialGradient(center[0], center[1], 0, center[0], center[1], scale * 3);
    glow.addColorStop(0, 'rgba(164,64,118,.11)'); glow.addColorStop(1, 'rgba(164,64,118,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    for (const p of particles) {
      const xx = (p.x * width + Math.sin(time * .1 + p.phase) * 12);
      const yy = ((p.y * height - time * (2 + p.z * 3)) % height + height) % height;
      const alpha = .12 + (Math.sin(time + p.phase) + 1) * .16;
      ctx.fillStyle = `rgba(241,191,216,${alpha})`;
      ctx.beginPath(); ctx.arc(xx, yy, .5 + p.z * 1.15, 0, TAU); ctx.fill();
    }
    if (!opened) return;
    ctx.save();
    ctx.globalAlpha = reveal;
    const origin = project([0, -2.52, 0]);
    const grow = .35 + .65 * reveal;
    ctx.translate(origin[0], origin[1]);
    ctx.scale(grow, grow);
    ctx.translate(-origin[0], -origin[1]);
    // Ground ellipse anchors the bouquet in space.
    const floor = project([0, -2.65, 0]);
    ctx.save(); ctx.translate(...floor); ctx.scale(1, .18);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, scale * 1.5);
    shadow.addColorStop(0, 'rgba(188,95,142,.17)'); shadow.addColorStop(1, 'rgba(132,61,105,0)');
    ctx.fillStyle = shadow; ctx.beginPath(); ctx.arc(0, 0, scale * 1.5, 0, TAU); ctx.fill(); ctx.restore();
    const faces = [];
    const sway = Math.sin(time * .55) * .016;
    if (mode === 'dot-heart') {
      drawDotHeart();
    } else {
      for (const face of meshes) {
        const points = face.points.map(([x, y, z]) => [x + sway * (y + 2.5), y, z]);
        makeFace(points, face.color, face.kind, faces);
      }
      addRosePetals(faces, sway);
      for (const heart of heartModels) addHeart(heart, faces);
    }
    for (const burst of bursts) addHeart(burst, faces, true);
    faces.sort((a, b) => a.z - b.z);
    ctx.lineWidth = .45; ctx.lineJoin = 'round';
    for (const face of faces) {
      if (face.petal) {
        const gradient = ctx.createLinearGradient(...face.root, ...face.tip);
        [0, .34, .78, 1].forEach((stop, i) => gradient.addColorStop(stop, `rgb(${face.colors[i].join(',')})`));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        const last = face.p[face.p.length - 1];
        ctx.moveTo((last[0] + face.p[0][0]) / 2, (last[1] + face.p[0][1]) / 2);
        for (let i = 0; i < face.p.length; i++) {
          const next = face.p[(i + 1) % face.p.length];
          ctx.quadraticCurveTo(...face.p[i], (face.p[i][0] + next[0]) / 2, (face.p[i][1] + next[1]) / 2);
        }
        ctx.closePath(); ctx.fill();
        // A fine translucent highlight follows the rolled outer petal edge.
        ctx.beginPath(); ctx.moveTo(...face.lip[0]);
        for (let i = 1; i < face.lip.length; i++) ctx.lineTo(...face.lip[i]);
        ctx.strokeStyle = 'rgba(255,224,236,.24)';
        ctx.lineWidth = Math.max(.45, scale * .006); ctx.stroke();
        ctx.lineWidth = .45;
      } else {
        ctx.fillStyle = ctx.strokeStyle = `rgb(${face.rgb.join(',')})`;
        ctx.beginPath(); ctx.moveTo(...face.p[0]);
        for (let i = 1; i < 4; i++) ctx.lineTo(...face.p[i]);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
    for (const p of confetti) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.translate(width * .5 + p.x * scale, height * .49 + p.y * scale);
      ctx.rotate(p.spin + p.age * p.turn);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { previous = now; return; }
    if (now - lastFrame < 30) return;
    const dt = previous ? Math.min((now - previous) / 1000, .05) : 0;
    previous = now; lastFrame = now;
    let changed = false;
    if (!paused) {
      time += dt;
      if (opened) reveal = 1 - Math.pow(1 - Math.min(1, (time - revealStart) / 1.65), 3);
      for (let i = confetti.length - 1; i >= 0; i--) {
        const p = confetti[i];
        p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += dt * 1.7;
        if (p.age > p.life) confetti.splice(i, 1);
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        bursts[i].y += dt * .38;
        if (bursts[i].y > 4.8) bursts.splice(i, 1);
      }
      const progress = Math.min(1, (time - bloomStart) / 1.8);
      blooming = .3 + .7 * (1 - Math.pow(1 - progress, 3));
      changed = true;
    }
    if (Math.abs(angle - desiredAngle) + Math.abs(tilt - desiredTilt) > .0001) {
      angle += (desiredAngle - angle) * .14; tilt += (desiredTilt - tilt) * .14; changed = true;
    }
    if (changed) draw();
  }
  canvas.addEventListener('pointerdown', e => {
    if (!opened || !e.isPrimary) return;
    drag = { x: e.clientX, y: e.clientY, angle: desiredAngle, tilt: desiredTilt };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    desiredAngle = drag.angle + (e.clientX - drag.x) * .006;
    desiredTilt = Math.max(-.55, Math.min(.5, drag.tilt + (e.clientY - drag.y) * .003));
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('keydown', e => {
    if (!opened || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'ArrowLeft') desiredAngle -= .12;
    if (e.key === 'ArrowRight') desiredAngle += .12;
    if (e.key === 'ArrowUp') desiredTilt = Math.max(-.55, desiredTilt - .08);
    if (e.key === 'ArrowDown') desiredTilt = Math.min(.5, desiredTilt + .08);
  });
  function syncMotion() {
    const button = document.getElementById('motion');
    button.firstElementChild.textContent = paused ? '▷' : 'Ⅱ';
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', paused ? 'Хөдөлгөөнийг үргэлжлүүлэх' : 'Хөдөлгөөнийг түр зогсоох');
  }
  document.getElementById('motion').addEventListener('click', () => {
    paused = !paused;
    if (paused) {
      reveal = 1; blooming = 1; revealStart = time - 1.65; bloomStart = time - 1.8;
      confetti.length = 0; draw();
    }
    syncMotion();
  });
  function addLove(count = 2) {
    while (bursts.length + count > 8) bursts.shift();
    for (let i = 0; i < count; i++) bursts.push({ x: (Math.random() - .5) * 3.4, y: -.5 + Math.random() * 2,
      z: .6 + Math.random() * .8, size: .15 + Math.random() * .12, phase: Math.random() * TAU, rot: -.3 + Math.random() * .6 });
  }
  function syncMode() {
    document.getElementById('bouquet').setAttribute('aria-pressed', String(mode === 'bouquet'));
    document.getElementById('dot-heart').setAttribute('aria-pressed', String(mode === 'dot-heart'));
  }
  function selectMode(nextMode) {
    if (!opened) return;
    mode = nextMode;
    bursts.length = 0; confetti.length = 0;
    desiredAngle = nextMode === 'dot-heart' ? -.055 : -.22;
    desiredTilt = nextMode === 'dot-heart' ? .015 : -.04;
    reveal = 1; revealStart = time - 1.65;
    heartStart = paused ? time - heartDuration : time - .035;
    bloomStart = paused ? time - 1.8 : time;
    blooming = paused ? 1 : .3;
    syncMode(); draw();
  }
  document.getElementById('bouquet').addEventListener('click', () => selectMode('bouquet'));
  document.getElementById('dot-heart').addEventListener('click', () => selectMode('dot-heart'));
  gift.addEventListener('click', () => {
    if (opened) return;
    opened = true; revealStart = time; bloomStart = time;
    reveal = paused ? 1 : 0; blooming = paused ? 1 : .3;
    gift.setAttribute('aria-expanded', 'true');
    gift.disabled = true;
    giftScreen.classList.add('leaving');
    document.body.classList.add('opened');
    controls.hidden = false;
    canvas.tabIndex = 0;
    document.getElementById('dot-heart').focus({ preventScroll: true });
    addLove(5);
    if (!paused) for (let i = 0; i < 65; i++) {
      const a = Math.random() * TAU;
      confetti.push({ x: 0, y: 0, vx: Math.cos(a) * (1 + Math.random() * 2.8),
        vy: -2.2 + Math.sin(a) * (1 + Math.random() * 2), age: 0, life: 2 + Math.random() * 2,
        spin: Math.random() * TAU, turn: Math.random() * 6 - 3, size: 3 + Math.random() * 5,
        color: ['#ffc1dc', '#e9b0ed', '#ffdcac', '#fff0f5'][i % 4] });
    }
    giftTimer = setTimeout(() => { giftScreen.hidden = true; }, reduced.matches ? 0 : 650);
    draw();
  });
  document.getElementById('replay').addEventListener('click', () => {
    clearTimeout(giftTimer);
    opened = false; reveal = 0; blooming = 1; drag = null;
    mode = 'bouquet'; heartStart = 0; syncMode();
    bursts.length = 0; confetti.length = 0;
    desiredAngle = -.22; desiredTilt = -.09;
    angle = desiredAngle; tilt = desiredTilt;
    controls.hidden = true; giftScreen.hidden = false; gift.disabled = false;
    canvas.tabIndex = -1;
    gift.setAttribute('aria-expanded', 'false');
    giftScreen.classList.remove('leaving');
    document.body.classList.remove('opened');
    gift.focus({ preventScroll: true });
    draw();
  });
  document.getElementById('love').addEventListener('click', () => {
    addLove(); draw();
  });
  reduced.addEventListener('change', e => {
    paused = e.matches;
    if (paused) {
      reveal = opened ? 1 : 0; blooming = 1; revealStart = time - 1.65; bloomStart = time - 1.8;
      heartStart = time - heartDuration;
      confetti.length = 0;
    }
    syncMotion(); draw();
  });
  window.addEventListener('resize', resize);
  syncMotion(); resize(); requestAnimationFrame(frame);
})();



