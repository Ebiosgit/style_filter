// 2016 Style Photo Filter Generator + Doodle Art
(function() {
  'use strict';

  // DOM Elements
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const editor = document.getElementById('editor');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const filterList = document.getElementById('filterList');
  const intensitySlider = document.getElementById('intensity');
  const grainSlider = document.getElementById('grain');
  const resetBtn = document.getElementById('resetBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const shareBtn = document.getElementById('shareBtn');
  const qrToggle = document.getElementById('qrToggle');
  const qrContent = document.getElementById('qrContent');
  const doodleToggle = document.getElementById('doodleToggle');
  const doodleOptions = document.getElementById('doodleOptions');
  const sketchSlider = document.getElementById('sketchIntensity');
  const doodleDensitySlider = document.getElementById('doodleDensity');

  // State
  let originalImage = null;
  let currentFilter = 'valencia';
  let intensity = 80;
  let grainAmount = 15;
  let isProcessing = false;
  let filterDebounceTimer = null;
  let doodleEnabled = false;
  let sketchIntensity = 60;
  let doodleDensity = 12;
  let doodleSeed = 1;

  // 2016 Style Filters
  const filters = {
    valencia: {
      brightness: 1.08, contrast: 1.08, saturate: 1.15,
      sepia: 0.08, warmth: 15, fadeBlack: 20, vignette: 0.3
    },
    nashville: {
      brightness: 1.05, contrast: 1.2, saturate: 1.2,
      sepia: 0.02, warmth: 25, fadeBlack: 10, vignette: 0.25,
      tint: { r: 247, g: 176, b: 152, a: 0.1 }
    },
    lofi: {
      brightness: 1.0, contrast: 1.5, saturate: 1.3,
      sepia: 0, warmth: 0, fadeBlack: 0, vignette: 0.6
    },
    earlybird: {
      brightness: 1.0, contrast: 0.9, saturate: 0.9,
      sepia: 0.25, warmth: 20, fadeBlack: 30, vignette: 0.5
    },
    vsco: {
      brightness: 1.02, contrast: 0.95, saturate: 0.85,
      sepia: 0.05, warmth: 5, fadeBlack: 35, vignette: 0.2,
      tint: { r: 100, g: 120, b: 140, a: 0.05 }
    }
  };

  // ==========================================
  // Seeded random for consistent doodle layout
  // ==========================================
  function seededRandom() {
    doodleSeed = (doodleSeed * 16807 + 0) % 2147483647;
    return (doodleSeed - 1) / 2147483646;
  }

  function resetSeed() {
    doodleSeed = 42;
  }

  // ==========================================
  // Initialize
  // ==========================================
  function init() {
    setupEventListeners();
  }

  function setupEventListeners() {
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) loadImage(file);
    });

    filterList.addEventListener('click', (e) => {
      if (e.target.classList.contains('filter-btn')) {
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        applyFilter();
      }
    });

    intensitySlider.addEventListener('input', (e) => {
      intensity = parseInt(e.target.value);
      debouncedApplyFilter();
    });
    grainSlider.addEventListener('input', (e) => {
      grainAmount = parseInt(e.target.value);
      debouncedApplyFilter();
    });
    intensitySlider.addEventListener('change', () => applyFilter());
    grainSlider.addEventListener('change', () => applyFilter());

    resetBtn.addEventListener('click', resetEditor);
    downloadBtn.addEventListener('click', downloadImage);
    shareBtn.addEventListener('click', shareImage);

    qrToggle.addEventListener('click', () => {
      qrContent.classList.toggle('hidden');
      qrToggle.textContent = qrContent.classList.contains('hidden')
        ? 'QR코드로 친구에게 공유' : 'QR코드 닫기';
    });

    // Doodle Art toggle
    doodleToggle.addEventListener('click', () => {
      doodleEnabled = !doodleEnabled;
      doodleToggle.classList.toggle('active', doodleEnabled);
      doodleOptions.classList.toggle('hidden', !doodleEnabled);
      applyFilter();
    });

    // Doodle picker button toggle
    document.getElementById('doodlePicker').addEventListener('click', (e) => {
      const btn = e.target.closest('.doodle-btn');
      if (!btn) return;
      btn.classList.toggle('active');
      applyFilter();
    });

    sketchSlider.addEventListener('input', (e) => {
      sketchIntensity = parseInt(e.target.value);
      debouncedApplyFilter();
    });
    doodleDensitySlider.addEventListener('input', (e) => {
      doodleDensity = parseInt(e.target.value);
      debouncedApplyFilter();
    });
    sketchSlider.addEventListener('change', () => applyFilter());
    doodleDensitySlider.addEventListener('change', () => applyFilter());
  }

  function debouncedApplyFilter() {
    clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(() => applyFilter(), 30);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) loadImage(file);
  }

  function loadImage(file) {
    document.body.classList.add('loading');
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        originalImage = img;
        setupCanvas();
        applyFilter();
        uploadArea.classList.add('hidden');
        editor.classList.remove('hidden');
        document.body.classList.remove('loading');
        editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setupCanvas() {
    const isMobile = window.innerWidth <= 480;
    const maxWidth = isMobile ? 720 : 1080;
    const maxHeight = isMobile ? 900 : 1350;
    let width = originalImage.width;
    let height = originalImage.height;

    if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
    if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight; }

    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
  }

  // ==========================================
  // Main filter pipeline
  // ==========================================
  function applyFilter() {
    if (!originalImage || isProcessing) return;
    isProcessing = true;

    const filter = filters[currentFilter];
    const intensityRatio = intensity / 100;

    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const brightnessVal = lerp(1, filter.brightness, intensityRatio);
    const contrastVal = lerp(1, filter.contrast, intensityRatio);
    const satVal = lerp(1, filter.saturate, intensityRatio);
    const sepiaVal = filter.sepia * intensityRatio;
    const warmthVal = filter.warmth * intensityRatio;
    const fadeVal = filter.fadeBlack * intensityRatio;
    const hasTint = !!filter.tint;
    const tintAlpha = hasTint ? filter.tint.a * intensityRatio : 0;
    const tintR = hasTint ? filter.tint.r : 0;
    const tintG = hasTint ? filter.tint.g : 0;
    const tintB = hasTint ? filter.tint.b : 0;
    const warmG = warmthVal * 0.4;
    const warmB = warmthVal * 0.3;
    const oneMinusTint = 1 - tintAlpha;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];

      r *= brightnessVal; g *= brightnessVal; b *= brightnessVal;

      r = ((r / 255 - 0.5) * contrastVal + 0.5) * 255;
      g = ((g / 255 - 0.5) * contrastVal + 0.5) * 255;
      b = ((b / 255 - 0.5) * contrastVal + 0.5) * 255;

      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray + satVal * (r - gray);
      g = gray + satVal * (g - gray);
      b = gray + satVal * (b - gray);

      if (sepiaVal > 0) {
        const tr = 0.393 * r + 0.769 * g + 0.189 * b;
        const tg = 0.349 * r + 0.686 * g + 0.168 * b;
        const tb = 0.272 * r + 0.534 * g + 0.131 * b;
        r += (tr - r) * sepiaVal; g += (tg - g) * sepiaVal; b += (tb - b) * sepiaVal;
      }

      r += warmthVal + fadeVal; g += warmG + fadeVal; b += fadeVal - warmB;

      if (hasTint) {
        r = r * oneMinusTint + tintR * tintAlpha;
        g = g * oneMinusTint + tintG * tintAlpha;
        b = b * oneMinusTint + tintB * tintAlpha;
      }

      data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }

    ctx.putImageData(imageData, 0, 0);

    if (filter.vignette > 0) applyVignette(filter.vignette * intensityRatio);
    if (grainAmount > 0) applyGrain(grainAmount);

    // Doodle Art overlay (applied after filter, preserving original look)
    if (doodleEnabled) {
      applyDoodleArt();
    }

    addWatermark();
    isProcessing = false;
  }

  // ==========================================
  // Doodle Art Engine
  // ==========================================
  function applyDoodleArt() {
    const w = canvas.width;
    const h = canvas.height;

    // Step 1: Edge detection sketch overlay
    if (sketchIntensity > 0) {
      applySketchOverlay(w, h);
    }

    // Step 2: Draw random doodle elements
    if (doodleDensity > 0) {
      drawDoodleElements(w, h);
    }
  }

  function applySketchOverlay(w, h) {
    const src = ctx.getImageData(0, 0, w, h);
    const srcData = src.data;
    const strength = sketchIntensity / 100;

    // Convert to grayscale for edge detection
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * srcData[idx] + 0.587 * srcData[idx + 1] + 0.114 * srcData[idx + 2];
    }

    // Sobel edge detection
    const edges = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const gx = (
          -gray[idx - w - 1] + gray[idx - w + 1]
          - 2 * gray[idx - 1] + 2 * gray[idx + 1]
          - gray[idx + w - 1] + gray[idx + w + 1]
        );
        const gy = (
          -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1]
          + gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1]
        );
        edges[idx] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    // Overlay edges as dark sketch lines
    const threshold = 30;
    ctx.save();
    ctx.globalAlpha = strength * 0.7;
    ctx.globalCompositeOperation = 'multiply';

    const edgeCanvas = document.createElement('canvas');
    edgeCanvas.width = w;
    edgeCanvas.height = h;
    const edgeCtx = edgeCanvas.getContext('2d');
    const edgeImg = edgeCtx.createImageData(w, h);
    const eData = edgeImg.data;

    for (let i = 0; i < w * h; i++) {
      const e = edges[i];
      const idx = i * 4;
      if (e > threshold) {
        // Dark sketch line with slight wobble effect
        const val = Math.max(0, 255 - e * 2);
        eData[idx] = val;
        eData[idx + 1] = val;
        eData[idx + 2] = val;
        eData[idx + 3] = 255;
      } else {
        eData[idx] = 255;
        eData[idx + 1] = 255;
        eData[idx + 2] = 255;
        eData[idx + 3] = 255;
      }
    }

    edgeCtx.putImageData(edgeImg, 0, 0);
    ctx.drawImage(edgeCanvas, 0, 0);
    ctx.restore();
  }

  const allDrawFns = {
    heart: drawHeart, star: drawStar, flower: drawFlower, cloud: drawCloud,
    sparkle: drawSparkle, arrow: drawArrow, spiral: drawSpiral, music: drawMusicNote,
    crown: drawCrown, rainbow: drawRainbow, lightning: drawLightning, moon: drawMoon,
    butterfly: drawButterfly, speech: drawSpeechBubble, cat: drawCatFace,
    bear: drawBearFace, bunny: drawBunnyFace, diamond: drawDiamond
  };

  function getActiveDrawFns() {
    const activeBtns = document.querySelectorAll('.doodle-btn.active');
    const fns = [];
    activeBtns.forEach(btn => {
      const key = btn.dataset.doodle;
      if (allDrawFns[key]) fns.push(allDrawFns[key]);
    });
    return fns;
  }

  function drawDoodleElements(w, h) {
    resetSeed();
    const count = doodleDensity;
    const drawFns = getActiveDrawFns();
    if (drawFns.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < count; i++) {
      const x = seededRandom() * w;
      const y = seededRandom() * h;
      const size = 15 + seededRandom() * 30;
      const fnIdx = Math.floor(seededRandom() * drawFns.length);
      const hue = Math.floor(seededRandom() * 360);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((seededRandom() - 0.5) * 0.5);
      drawFns[fnIdx](ctx, size, hue);
      ctx.restore();
    }

    ctx.restore();
  }

  // ==========================================
  // Doodle drawing primitives (hand-drawn feel)
  // ==========================================
  function wobblyLine(c, points) {
    c.beginPath();
    c.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const wobble = (seededRandom() - 0.5) * 2;
      c.lineTo(points[i][0] + wobble, points[i][1] + wobble);
    }
    c.stroke();
  }

  function drawHeart(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 70%, 50%, 0.8)`;
    c.fillStyle = `hsla(${hue}, 80%, 65%, 0.3)`;
    c.lineWidth = 2;
    c.beginPath();
    const top = -s * 0.4;
    c.moveTo(0, s * 0.3);
    c.bezierCurveTo(-s * 0.5 + (seededRandom()-0.5)*2, top + (seededRandom()-0.5)*2,
                     -s * 0.8 + (seededRandom()-0.5)*2, s * 0.1,
                     0, s * 0.5);
    c.bezierCurveTo(s * 0.8 + (seededRandom()-0.5)*2, s * 0.1,
                     s * 0.5 + (seededRandom()-0.5)*2, top + (seededRandom()-0.5)*2,
                     0, s * 0.3);
    c.fill();
    c.stroke();
  }

  function drawStar(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 70%, 45%, 0.85)`;
    c.fillStyle = `hsla(${hue}, 90%, 70%, 0.25)`;
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const px = Math.cos(angle) * s * 0.5 + (seededRandom()-0.5)*2;
      const py = Math.sin(angle) * s * 0.5 + (seededRandom()-0.5)*2;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
    c.stroke();
  }

  function drawFlower(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 65%, 50%, 0.8)`;
    c.lineWidth = 1.5;
    const petals = 5;
    for (let i = 0; i < petals; i++) {
      const angle = (i * 2 * Math.PI) / petals;
      c.beginPath();
      const cx = Math.cos(angle) * s * 0.25;
      const cy = Math.sin(angle) * s * 0.25;
      c.ellipse(cx, cy, s * 0.2, s * 0.12, angle, 0, Math.PI * 2);
      c.fillStyle = `hsla(${(hue + i * 20) % 360}, 80%, 75%, 0.3)`;
      c.fill();
      c.stroke();
    }
    // Center
    c.beginPath();
    c.arc(0, 0, s * 0.08, 0, Math.PI * 2);
    c.fillStyle = `hsla(50, 90%, 60%, 0.6)`;
    c.fill();
    c.stroke();
  }

  function drawCloud(c, s, hue) {
    c.strokeStyle = 'rgba(80, 80, 80, 0.6)';
    c.fillStyle = 'rgba(255, 255, 255, 0.2)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(-s*0.2, 0, s*0.2 + (seededRandom()-0.5)*2, Math.PI, 0);
    c.arc(s*0.1, -s*0.05, s*0.25 + (seededRandom()-0.5)*2, Math.PI, 0);
    c.arc(s*0.35, 0, s*0.18 + (seededRandom()-0.5)*2, Math.PI, 0);
    c.closePath();
    c.fill();
    c.stroke();
  }

  function drawSparkle(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 80%, 55%, 0.85)`;
    c.lineWidth = 2;
    const r = s * 0.4;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 4;
      const w = (seededRandom() - 0.5) * 1.5;
      c.beginPath();
      c.moveTo(Math.cos(angle) * r * 0.2 + w, Math.sin(angle) * r * 0.2 + w);
      c.lineTo(Math.cos(angle) * r + w, Math.sin(angle) * r + w);
      c.stroke();
    }
  }

  function drawArrow(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 60%, 45%, 0.75)`;
    c.lineWidth = 2;
    const len = s * 0.6;
    wobblyLine(c, [[0, 0], [len, 0]]);
    wobblyLine(c, [[len * 0.65, -len * 0.25], [len, 0], [len * 0.65, len * 0.25]]);
  }

  function drawSpiral(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 70%, 50%, 0.7)`;
    c.lineWidth = 1.5;
    c.beginPath();
    for (let t = 0; t < 12; t += 0.3) {
      const r = t * s * 0.03;
      const x = Math.cos(t) * r + (seededRandom()-0.5)*1;
      const y = Math.sin(t) * r + (seededRandom()-0.5)*1;
      if (t === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }

  // ==========================================
  // 2016 SNS doodles
  // ==========================================
  function drawMusicNote(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 70%, 45%, 0.8)`;
    c.fillStyle = `hsla(${hue}, 80%, 55%, 0.6)`;
    c.lineWidth = 2;
    // Note head (filled ellipse)
    c.beginPath();
    c.ellipse(0, s * 0.3, s * 0.15, s * 0.1, -0.3, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Stem
    var w = (seededRandom() - 0.5) * 1.5;
    c.beginPath();
    c.moveTo(s * 0.12 + w, s * 0.25);
    c.lineTo(s * 0.12 + w, -s * 0.35 + (seededRandom() - 0.5) * 2);
    c.stroke();
    // Flag
    c.beginPath();
    c.moveTo(s * 0.12 + w, -s * 0.35);
    c.quadraticCurveTo(s * 0.35 + (seededRandom() - 0.5) * 2, -s * 0.2, s * 0.12, -s * 0.1);
    c.stroke();
  }

  function drawCrown(c, s, hue) {
    c.strokeStyle = `hsla(45, 80%, 45%, 0.85)`;
    c.fillStyle = `hsla(50, 90%, 65%, 0.35)`;
    c.lineWidth = 2;
    var h2 = s * 0.35;
    var w2 = s * 0.45;
    var pts = [
      [-w2, h2], [-w2, -h2 * 0.2 + (seededRandom() - 0.5) * 2],
      [-w2 * 0.5, h2 * 0.3 + (seededRandom() - 0.5) * 2],
      [0, -h2 + (seededRandom() - 0.5) * 2],
      [w2 * 0.5, h2 * 0.3 + (seededRandom() - 0.5) * 2],
      [w2, -h2 * 0.2 + (seededRandom() - 0.5) * 2],
      [w2, h2]
    ];
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) {
      c.lineTo(pts[i][0] + (seededRandom() - 0.5) * 1.5, pts[i][1]);
    }
    c.closePath();
    c.fill();
    c.stroke();
    // Jewels on tips
    var tips = [1, 3, 5];
    for (var j = 0; j < tips.length; j++) {
      c.beginPath();
      c.arc(pts[tips[j]][0], pts[tips[j]][1], s * 0.04, 0, Math.PI * 2);
      c.fillStyle = `hsla(${(hue + j * 90) % 360}, 80%, 60%, 0.7)`;
      c.fill();
    }
  }

  function drawRainbow(c, s, hue) {
    c.lineWidth = 2;
    var colors = [
      'hsla(0, 80%, 55%, 0.6)',
      'hsla(30, 80%, 55%, 0.6)',
      'hsla(55, 80%, 55%, 0.6)',
      'hsla(120, 70%, 45%, 0.6)',
      'hsla(210, 70%, 55%, 0.6)',
      'hsla(270, 70%, 55%, 0.6)'
    ];
    for (var i = 0; i < colors.length; i++) {
      c.strokeStyle = colors[i];
      c.beginPath();
      var r = s * 0.5 - i * s * 0.06;
      c.arc(0, s * 0.15, r + (seededRandom() - 0.5) * 1.5, Math.PI, 0);
      c.stroke();
    }
  }

  function drawLightning(c, s, hue) {
    c.strokeStyle = `hsla(50, 90%, 50%, 0.85)`;
    c.fillStyle = `hsla(50, 95%, 65%, 0.35)`;
    c.lineWidth = 2;
    var pts = [
      [s * 0.05, -s * 0.5],
      [-s * 0.1 + (seededRandom() - 0.5) * 2, -s * 0.1],
      [s * 0.08 + (seededRandom() - 0.5) * 2, -s * 0.05],
      [-s * 0.05 + (seededRandom() - 0.5) * 2, s * 0.5]
    ];
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) {
      c.lineTo(pts[i][0], pts[i][1]);
    }
    c.stroke();
    // Second stroke slightly offset for thickness feel
    c.beginPath();
    c.moveTo(pts[0][0] + s * 0.06, pts[0][1]);
    c.lineTo(pts[1][0] + s * 0.08, pts[1][1]);
    c.lineTo(pts[2][0] + s * 0.1, pts[2][1]);
    c.lineTo(pts[3][0] + s * 0.04, pts[3][1]);
    c.lineTo(pts[2][0], pts[2][1]);
    c.lineTo(pts[1][0] + s * 0.02, pts[1][1]);
    c.closePath();
    c.fill();
    c.stroke();
  }

  function drawMoon(c, s, hue) {
    c.strokeStyle = `hsla(45, 60%, 45%, 0.8)`;
    c.fillStyle = `hsla(50, 80%, 70%, 0.3)`;
    c.lineWidth = 1.5;
    var r = s * 0.4;
    // Outer circle
    c.beginPath();
    c.arc(0, 0, r + (seededRandom() - 0.5) * 1.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Inner circle cutout (crescent effect)
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(r * 0.4 + (seededRandom() - 0.5) * 2, -r * 0.15, r * 0.8, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // Re-stroke the outer crescent
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.stroke();
  }

  function drawButterfly(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 70%, 45%, 0.8)`;
    c.lineWidth = 1.5;
    // Left wings
    c.beginPath();
    c.fillStyle = `hsla(${hue}, 75%, 65%, 0.3)`;
    c.ellipse(-s * 0.2, -s * 0.12, s * 0.22, s * 0.15, -0.4 + (seededRandom() - 0.5) * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.fillStyle = `hsla(${(hue + 30) % 360}, 75%, 65%, 0.3)`;
    c.ellipse(-s * 0.15, s * 0.1, s * 0.16, s * 0.1, -0.2 + (seededRandom() - 0.5) * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Right wings (mirror)
    c.beginPath();
    c.fillStyle = `hsla(${hue}, 75%, 65%, 0.3)`;
    c.ellipse(s * 0.2, -s * 0.12, s * 0.22, s * 0.15, 0.4 + (seededRandom() - 0.5) * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.fillStyle = `hsla(${(hue + 30) % 360}, 75%, 65%, 0.3)`;
    c.ellipse(s * 0.15, s * 0.1, s * 0.16, s * 0.1, 0.2 + (seededRandom() - 0.5) * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Body
    c.strokeStyle = `hsla(${hue}, 50%, 35%, 0.8)`;
    c.lineWidth = 2;
    wobblyLine(c, [[0, -s * 0.25], [0, s * 0.2]]);
    // Antennae
    c.lineWidth = 1;
    wobblyLine(c, [[0, -s * 0.25], [-s * 0.12, -s * 0.4 + (seededRandom() - 0.5) * 2]]);
    wobblyLine(c, [[0, -s * 0.25], [s * 0.12, -s * 0.4 + (seededRandom() - 0.5) * 2]]);
  }

  function drawSpeechBubble(c, s, hue) {
    var texts = ['OMG', 'LOL', 'YOLO', ':)', '<3', 'WOW', 'HI', 'XD', '#TBT', 'BFF'];
    var text = texts[Math.floor(seededRandom() * texts.length)];
    c.strokeStyle = `hsla(${hue}, 50%, 40%, 0.75)`;
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.lineWidth = 1.5;
    // Rounded bubble
    var bw = s * 0.7;
    var bh = s * 0.4;
    var r2 = s * 0.1;
    c.beginPath();
    c.moveTo(-bw / 2 + r2, -bh / 2);
    c.lineTo(bw / 2 - r2 + (seededRandom() - 0.5) * 2, -bh / 2);
    c.quadraticCurveTo(bw / 2, -bh / 2, bw / 2, -bh / 2 + r2);
    c.lineTo(bw / 2, bh / 2 - r2 + (seededRandom() - 0.5) * 2);
    c.quadraticCurveTo(bw / 2, bh / 2, bw / 2 - r2, bh / 2);
    c.lineTo(-bw / 2 + r2 + (seededRandom() - 0.5) * 2, bh / 2);
    c.quadraticCurveTo(-bw / 2, bh / 2, -bw / 2, bh / 2 - r2);
    c.lineTo(-bw / 2, -bh / 2 + r2 + (seededRandom() - 0.5) * 2);
    c.quadraticCurveTo(-bw / 2, -bh / 2, -bw / 2 + r2, -bh / 2);
    c.closePath();
    c.fill();
    c.stroke();
    // Tail
    c.beginPath();
    c.moveTo(-s * 0.05, bh / 2);
    c.lineTo(-s * 0.15 + (seededRandom() - 0.5) * 2, bh / 2 + s * 0.2);
    c.lineTo(s * 0.08 + (seededRandom() - 0.5) * 2, bh / 2);
    c.stroke();
    // Text
    c.fillStyle = `hsla(${hue}, 60%, 40%, 0.85)`;
    c.font = `bold ${s * 0.22}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, (seededRandom() - 0.5) * 2, (seededRandom() - 0.5) * 2);
  }

  // ==========================================
  // Cute character doodles
  // ==========================================
  function drawCatFace(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 50%, 40%, 0.8)`;
    c.fillStyle = `hsla(${hue}, 40%, 80%, 0.3)`;
    c.lineWidth = 1.5;
    var r = s * 0.3;
    // Face
    c.beginPath();
    c.arc(0, 0, r + (seededRandom() - 0.5) * 1.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Ears (triangles)
    c.beginPath();
    c.moveTo(-r * 0.8 + (seededRandom() - 0.5) * 1, -r * 0.6);
    c.lineTo(-r * 0.4, -r * 1.3 + (seededRandom() - 0.5) * 2);
    c.lineTo(-r * 0.05 + (seededRandom() - 0.5) * 1, -r * 0.75);
    c.stroke();
    c.beginPath();
    c.moveTo(r * 0.8 + (seededRandom() - 0.5) * 1, -r * 0.6);
    c.lineTo(r * 0.4, -r * 1.3 + (seededRandom() - 0.5) * 2);
    c.lineTo(r * 0.05 + (seededRandom() - 0.5) * 1, -r * 0.75);
    c.stroke();
    // Eyes
    c.fillStyle = `hsla(${hue}, 50%, 30%, 0.8)`;
    c.beginPath();
    c.arc(-r * 0.35, -r * 0.1, r * 0.08, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(r * 0.35, -r * 0.1, r * 0.08, 0, Math.PI * 2);
    c.fill();
    // Nose
    c.beginPath();
    c.moveTo(0, r * 0.1);
    c.lineTo(-r * 0.08, r * 0.2);
    c.lineTo(r * 0.08, r * 0.2);
    c.closePath();
    c.fill();
    // Mouth
    c.beginPath();
    c.moveTo(0, r * 0.2);
    c.lineTo(-r * 0.15, r * 0.35 + (seededRandom() - 0.5) * 1);
    c.stroke();
    c.beginPath();
    c.moveTo(0, r * 0.2);
    c.lineTo(r * 0.15, r * 0.35 + (seededRandom() - 0.5) * 1);
    c.stroke();
    // Whiskers
    c.lineWidth = 1;
    wobblyLine(c, [[-r * 0.2, r * 0.15], [-r * 0.8, r * 0.05]]);
    wobblyLine(c, [[-r * 0.2, r * 0.25], [-r * 0.8, r * 0.3]]);
    wobblyLine(c, [[r * 0.2, r * 0.15], [r * 0.8, r * 0.05]]);
    wobblyLine(c, [[r * 0.2, r * 0.25], [r * 0.8, r * 0.3]]);
  }

  function drawBearFace(c, s, hue) {
    c.strokeStyle = `hsla(30, 45%, 35%, 0.8)`;
    c.fillStyle = `hsla(30, 40%, 65%, 0.3)`;
    c.lineWidth = 1.5;
    var r = s * 0.32;
    // Ears
    c.beginPath();
    c.arc(-r * 0.75, -r * 0.75, r * 0.3 + (seededRandom() - 0.5) * 1, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(r * 0.75, -r * 0.75, r * 0.3 + (seededRandom() - 0.5) * 1, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Face
    c.beginPath();
    c.arc(0, 0, r + (seededRandom() - 0.5) * 1.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Eyes
    c.fillStyle = `hsla(30, 40%, 20%, 0.85)`;
    c.beginPath();
    c.arc(-r * 0.3, -r * 0.15, r * 0.08, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(r * 0.3, -r * 0.15, r * 0.08, 0, Math.PI * 2);
    c.fill();
    // Snout
    c.fillStyle = `hsla(30, 30%, 75%, 0.5)`;
    c.beginPath();
    c.ellipse(0, r * 0.2, r * 0.25, r * 0.18, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Nose
    c.fillStyle = `hsla(30, 40%, 20%, 0.85)`;
    c.beginPath();
    c.ellipse(0, r * 0.12, r * 0.1, r * 0.07, 0, 0, Math.PI * 2);
    c.fill();
    // Mouth
    c.beginPath();
    c.moveTo(0, r * 0.19);
    c.quadraticCurveTo(-r * 0.12, r * 0.35 + (seededRandom() - 0.5) * 1, -r * 0.15, r * 0.3);
    c.stroke();
    c.beginPath();
    c.moveTo(0, r * 0.19);
    c.quadraticCurveTo(r * 0.12, r * 0.35 + (seededRandom() - 0.5) * 1, r * 0.15, r * 0.3);
    c.stroke();
  }

  function drawBunnyFace(c, s, hue) {
    c.strokeStyle = `hsla(330, 40%, 50%, 0.8)`;
    c.fillStyle = `hsla(330, 30%, 85%, 0.3)`;
    c.lineWidth = 1.5;
    var r = s * 0.28;
    // Long ears
    c.beginPath();
    c.ellipse(-r * 0.35, -r * 1.4, r * 0.2, r * 0.6 + (seededRandom() - 0.5) * 2,
              -0.15 + (seededRandom() - 0.5) * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Inner ear
    c.fillStyle = `hsla(350, 60%, 75%, 0.35)`;
    c.beginPath();
    c.ellipse(-r * 0.35, -r * 1.4, r * 0.1, r * 0.4, -0.15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = `hsla(330, 30%, 85%, 0.3)`;
    c.beginPath();
    c.ellipse(r * 0.35, -r * 1.4, r * 0.2, r * 0.6 + (seededRandom() - 0.5) * 2,
              0.15 + (seededRandom() - 0.5) * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = `hsla(350, 60%, 75%, 0.35)`;
    c.beginPath();
    c.ellipse(r * 0.35, -r * 1.4, r * 0.1, r * 0.4, 0.15, 0, Math.PI * 2);
    c.fill();
    // Face
    c.fillStyle = `hsla(330, 30%, 85%, 0.3)`;
    c.beginPath();
    c.arc(0, 0, r + (seededRandom() - 0.5) * 1.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Eyes
    c.fillStyle = `hsla(330, 40%, 25%, 0.85)`;
    c.beginPath();
    c.arc(-r * 0.3, -r * 0.1, r * 0.07, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(r * 0.3, -r * 0.1, r * 0.07, 0, Math.PI * 2);
    c.fill();
    // Nose (small triangle)
    c.fillStyle = `hsla(350, 60%, 65%, 0.8)`;
    c.beginPath();
    c.moveTo(0, r * 0.1);
    c.lineTo(-r * 0.07, r * 0.18);
    c.lineTo(r * 0.07, r * 0.18);
    c.closePath();
    c.fill();
    // Mouth
    c.beginPath();
    c.moveTo(0, r * 0.18);
    c.lineTo(0, r * 0.3 + (seededRandom() - 0.5) * 1);
    c.stroke();
    c.beginPath();
    c.arc(-r * 0.1, r * 0.3, r * 0.1, 0, Math.PI, true);
    c.stroke();
    c.beginPath();
    c.arc(r * 0.1, r * 0.3, r * 0.1, 0, Math.PI, true);
    c.stroke();
  }

  function drawDiamond(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 70%, 50%, 0.85)`;
    c.fillStyle = `hsla(${hue}, 80%, 75%, 0.25)`;
    c.lineWidth = 2;
    var w2 = s * 0.35;
    var h2 = s * 0.5;
    var mid = s * 0.15;
    // Outer shape
    c.beginPath();
    c.moveTo(0, -h2 + (seededRandom() - 0.5) * 2);
    c.lineTo(w2 + (seededRandom() - 0.5) * 1.5, -mid);
    c.lineTo(0, h2 + (seededRandom() - 0.5) * 2);
    c.lineTo(-w2 + (seededRandom() - 0.5) * 1.5, -mid);
    c.closePath();
    c.fill();
    c.stroke();
    // Inner facet lines
    c.lineWidth = 1;
    c.strokeStyle = `hsla(${hue}, 60%, 55%, 0.5)`;
    c.beginPath();
    c.moveTo(-w2, -mid);
    c.lineTo(w2, -mid);
    c.stroke();
    c.beginPath();
    c.moveTo(0, -h2);
    c.lineTo(-w2 * 0.4 + (seededRandom() - 0.5) * 1, -mid);
    c.lineTo(0, h2);
    c.stroke();
    c.beginPath();
    c.moveTo(0, -h2);
    c.lineTo(w2 * 0.4 + (seededRandom() - 0.5) * 1, -mid);
    c.lineTo(0, h2);
    c.stroke();
  }

  // ==========================================
  // Effects
  // ==========================================
  function applyVignette(strength) {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const radius = Math.max(canvas.width, canvas.height) * 0.7;
    const gradient = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function applyGrain(amount) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * amount;
      data[i] = clamp(data[i] + noise, 0, 255);
      data[i + 1] = clamp(data[i + 1] + noise, 0, 255);
      data[i + 2] = clamp(data[i + 2] + noise, 0, 255);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function addWatermark() {
    const text = '2016filter.app';
    const fontSize = Math.max(12, canvas.width * 0.022);
    ctx.save();
    ctx.font = `${fontSize}px 'Noto Sans KR', sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(text, canvas.width - 12, canvas.height - 12);
    ctx.restore();
  }

  // ==========================================
  // Actions
  // ==========================================
  function resetEditor() {
    uploadArea.classList.remove('hidden');
    editor.classList.add('hidden');
    fileInput.value = '';
    originalImage = null;
    currentFilter = 'valencia';
    intensity = 80;
    grainAmount = 15;
    intensitySlider.value = 80;
    grainSlider.value = 15;
    doodleEnabled = false;
    sketchIntensity = 60;
    doodleDensity = 12;
    sketchSlider.value = 60;
    doodleDensitySlider.value = 12;
    doodleToggle.classList.remove('active');
    doodleOptions.classList.add('hidden');
    document.querySelectorAll('.doodle-btn').forEach(btn => btn.classList.add('active'));

    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-filter="valencia"]').classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function downloadImage() {
    const link = document.createElement('a');
    link.download = `2016filter_${Date.now()}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.92);
    link.click();
  }

  async function shareImage() {
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      const file = new File([blob], '2016filter.jpg', { type: 'image/jpeg' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '2016 Filter', text: '2026 is the new 2016 #2016filter' });
      } else if (navigator.share) {
        await navigator.share({ title: '2016 Filter', text: '2026 is the new 2016 #2016filter', url: window.location.href });
      } else {
        downloadImage();
        alert('이미지가 다운로드됩니다.');
      }
    } catch (err) {
      if (err.name !== 'AbortError') downloadImage();
    }
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(val, min, max) { return val < min ? min : val > max ? max : val; }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
