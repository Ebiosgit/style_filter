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

  // State
  let originalImage = null;
  let currentFilter = 'valencia';
  let intensity = 80;
  let grainAmount = 15;
  let isProcessing = false;
  let filterDebounceTimer = null;
  let doodleSeed = 1;

  // AI Mode State
  let aiMode = false;
  let aiConfig = null;
  let aiLoading = false;
  const geminiApiKey = 'AIzaSyA-w2QjsdFNA45h08QAE2veU-1SSE6hM0w';

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

    // AI Auto-decorate
    const aiBtn = document.getElementById('aiDecorateBtn');
    if (aiBtn) {
      aiBtn.addEventListener('click', activateAiMode);
    }
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

    // AI Doodle Art overlay
    if (aiMode && aiConfig) {
      applyAiDoodleArt();
    }

    addWatermark();
    isProcessing = false;
  }

  const allDrawFns = {
    heart: drawHeart, star: drawStar, flower: drawFlower, cloud: drawCloud,
    sparkle: drawSparkle, arrow: drawArrow, spiral: drawSpiral, music: drawMusicNote,
    crown: drawCrown, rainbow: drawRainbow, lightning: drawLightning, moon: drawMoon,
    butterfly: drawButterfly, speech: drawSpeechBubble, cat: drawCatFace,
    bear: drawBearFace, bunny: drawBunnyFace, diamond: drawDiamond
  };

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
    c.strokeStyle = `hsla(${hue}, 70%, 38%, 0.9)`;
    c.fillStyle = `hsla(${hue}, 80%, 65%, 0.4)`;
    c.lineWidth = Math.max(2, s * 0.07);
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
    c.strokeStyle = `hsla(${hue}, 70%, 38%, 0.95)`;
    c.fillStyle = `hsla(${hue}, 90%, 70%, 0.4)`;
    c.lineWidth = Math.max(2, s * 0.07);
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
    c.strokeStyle = `hsla(${hue}, 65%, 38%, 0.9)`;
    c.lineWidth = Math.max(1.5, s * 0.05);
    const petals = 5;
    for (let i = 0; i < petals; i++) {
      const angle = (i * 2 * Math.PI) / petals;
      c.beginPath();
      const cx = Math.cos(angle) * s * 0.25;
      const cy = Math.sin(angle) * s * 0.25;
      c.ellipse(cx, cy, s * 0.2, s * 0.12, angle, 0, Math.PI * 2);
      c.fillStyle = `hsla(${(hue + i * 20) % 360}, 80%, 75%, 0.4)`;
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
    c.strokeStyle = 'rgba(60, 60, 60, 0.9)';
    c.fillStyle = 'rgba(255, 255, 255, 0.4)';
    c.lineWidth = Math.max(1.5, s * 0.05);
    c.beginPath();
    c.arc(-s*0.2, 0, s*0.2 + (seededRandom()-0.5)*2, Math.PI, 0);
    c.arc(s*0.1, -s*0.05, s*0.25 + (seededRandom()-0.5)*2, Math.PI, 0);
    c.arc(s*0.35, 0, s*0.18 + (seededRandom()-0.5)*2, Math.PI, 0);
    c.closePath();
    c.fill();
    c.stroke();
  }

  function drawSparkle(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 80%, 40%, 0.95)`;
    c.lineWidth = Math.max(2, s * 0.07);
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
    c.strokeStyle = `hsla(${hue}, 60%, 35%, 0.9)`;
    c.lineWidth = Math.max(2, s * 0.07);
    const len = s * 0.6;
    wobblyLine(c, [[0, 0], [len, 0]]);
    wobblyLine(c, [[len * 0.65, -len * 0.25], [len, 0], [len * 0.65, len * 0.25]]);
  }

  function drawSpiral(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 70%, 38%, 0.9)`;
    c.lineWidth = Math.max(1.5, s * 0.05);
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
    c.strokeStyle = `hsla(${hue}, 70%, 35%, 0.9)`;
    c.fillStyle = `hsla(${hue}, 80%, 55%, 0.6)`;
    c.lineWidth = Math.max(2, s * 0.07);
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
    c.strokeStyle = `hsla(45, 80%, 35%, 0.95)`;
    c.fillStyle = `hsla(50, 90%, 65%, 0.45)`;
    c.lineWidth = Math.max(2, s * 0.07);
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
    c.lineWidth = Math.max(2, s * 0.07);
    var colors = [
      'hsla(0, 80%, 40%, 0.9)',
      'hsla(30, 80%, 40%, 0.9)',
      'hsla(55, 80%, 40%, 0.9)',
      'hsla(120, 70%, 35%, 0.9)',
      'hsla(210, 70%, 40%, 0.9)',
      'hsla(270, 70%, 40%, 0.9)'
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
    c.strokeStyle = `hsla(50, 90%, 38%, 0.95)`;
    c.fillStyle = `hsla(50, 95%, 65%, 0.45)`;
    c.lineWidth = Math.max(2, s * 0.07);
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
    c.strokeStyle = `hsla(45, 60%, 35%, 0.9)`;
    c.fillStyle = `hsla(50, 80%, 70%, 0.4)`;
    c.lineWidth = Math.max(1.5, s * 0.05);
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
    c.strokeStyle = `hsla(${hue}, 70%, 35%, 0.9)`;
    c.lineWidth = Math.max(1.5, s * 0.05);
    // Left wings
    c.beginPath();
    c.fillStyle = `hsla(${hue}, 75%, 65%, 0.4)`;
    c.ellipse(-s * 0.2, -s * 0.12, s * 0.22, s * 0.15, -0.4 + (seededRandom() - 0.5) * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.fillStyle = `hsla(${(hue + 30) % 360}, 75%, 65%, 0.4)`;
    c.ellipse(-s * 0.15, s * 0.1, s * 0.16, s * 0.1, -0.2 + (seededRandom() - 0.5) * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Right wings (mirror)
    c.beginPath();
    c.fillStyle = `hsla(${hue}, 75%, 65%, 0.4)`;
    c.ellipse(s * 0.2, -s * 0.12, s * 0.22, s * 0.15, 0.4 + (seededRandom() - 0.5) * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.fillStyle = `hsla(${(hue + 30) % 360}, 75%, 65%, 0.4)`;
    c.ellipse(s * 0.15, s * 0.1, s * 0.16, s * 0.1, 0.2 + (seededRandom() - 0.5) * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Body
    c.strokeStyle = `hsla(${hue}, 50%, 30%, 0.9)`;
    c.lineWidth = Math.max(2, s * 0.07);
    wobblyLine(c, [[0, -s * 0.25], [0, s * 0.2]]);
    // Antennae
    c.lineWidth = Math.max(1, s * 0.035);
    wobblyLine(c, [[0, -s * 0.25], [-s * 0.12, -s * 0.4 + (seededRandom() - 0.5) * 2]]);
    wobblyLine(c, [[0, -s * 0.25], [s * 0.12, -s * 0.4 + (seededRandom() - 0.5) * 2]]);
  }

  function drawSpeechBubble(c, s, hue) {
    var texts = ['OMG', 'LOL', 'YOLO', ':)', '<3', 'WOW', 'HI', 'XD', '#TBT', 'BFF'];
    var text = texts[Math.floor(seededRandom() * texts.length)];
    c.strokeStyle = `hsla(${hue}, 50%, 35%, 0.9)`;
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.lineWidth = Math.max(1.5, s * 0.05);
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
    c.fillStyle = `hsla(${hue}, 60%, 35%, 0.95)`;
    c.font = `bold ${s * 0.22}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, (seededRandom() - 0.5) * 2, (seededRandom() - 0.5) * 2);
  }

  // ==========================================
  // Cute character doodles
  // ==========================================
  function drawCatFace(c, s, hue) {
    c.strokeStyle = `hsla(${hue}, 50%, 35%, 0.9)`;
    c.fillStyle = `hsla(${hue}, 40%, 80%, 0.4)`;
    c.lineWidth = Math.max(1.5, s * 0.05);
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
    c.lineWidth = Math.max(1, s * 0.035);
    wobblyLine(c, [[-r * 0.2, r * 0.15], [-r * 0.8, r * 0.05]]);
    wobblyLine(c, [[-r * 0.2, r * 0.25], [-r * 0.8, r * 0.3]]);
    wobblyLine(c, [[r * 0.2, r * 0.15], [r * 0.8, r * 0.05]]);
    wobblyLine(c, [[r * 0.2, r * 0.25], [r * 0.8, r * 0.3]]);
  }

  function drawBearFace(c, s, hue) {
    c.strokeStyle = `hsla(30, 45%, 30%, 0.9)`;
    c.fillStyle = `hsla(30, 40%, 65%, 0.4)`;
    c.lineWidth = Math.max(1.5, s * 0.05);
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
    c.strokeStyle = `hsla(330, 40%, 38%, 0.9)`;
    c.fillStyle = `hsla(330, 30%, 85%, 0.4)`;
    c.lineWidth = Math.max(1.5, s * 0.05);
    var r = s * 0.28;
    // Long ears
    c.beginPath();
    c.ellipse(-r * 0.35, -r * 1.4, r * 0.2, r * 0.6 + (seededRandom() - 0.5) * 2,
              -0.15 + (seededRandom() - 0.5) * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Inner ear
    c.fillStyle = `hsla(350, 60%, 75%, 0.45)`;
    c.beginPath();
    c.ellipse(-r * 0.35, -r * 1.4, r * 0.1, r * 0.4, -0.15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = `hsla(330, 30%, 85%, 0.4)`;
    c.beginPath();
    c.ellipse(r * 0.35, -r * 1.4, r * 0.2, r * 0.6 + (seededRandom() - 0.5) * 2,
              0.15 + (seededRandom() - 0.5) * 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = `hsla(350, 60%, 75%, 0.45)`;
    c.beginPath();
    c.ellipse(r * 0.35, -r * 1.4, r * 0.1, r * 0.4, 0.15, 0, Math.PI * 2);
    c.fill();
    // Face
    c.fillStyle = `hsla(330, 30%, 85%, 0.4)`;
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
    c.strokeStyle = `hsla(${hue}, 70%, 38%, 0.95)`;
    c.fillStyle = `hsla(${hue}, 80%, 75%, 0.4)`;
    c.lineWidth = Math.max(2, s * 0.07);
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
    c.lineWidth = Math.max(1, s * 0.035);
    c.strokeStyle = `hsla(${hue}, 60%, 45%, 0.6)`;
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
  // AI Auto-Decorate Functions
  // ==========================================
  function getImageBase64() {
    const maxDim = 1024;
    const tmpCanvas = document.createElement('canvas');
    let w = originalImage.width;
    let h = originalImage.height;
    if (w > maxDim || h > maxDim) {
      if (w > h) { h = (h * maxDim) / w; w = maxDim; }
      else { w = (w * maxDim) / h; h = maxDim; }
    }
    tmpCanvas.width = Math.round(w);
    tmpCanvas.height = Math.round(h);
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.drawImage(originalImage, 0, 0, tmpCanvas.width, tmpCanvas.height);
    const dataUrl = tmpCanvas.toDataURL('image/jpeg', 0.8);
    return dataUrl.split(',')[1];
  }

  async function callGeminiVision(base64Data) {
    const prompt = `당신은 평범한 사진을 동화 속 한 장면처럼 연출하는 '비주얼 아트 디렉터'이자 'AI 프롬프트 엔지니어'입니다. 첨부된 이미지의 구도와 피사체를 정밀하게 분석하여, 이 사진과 완벽하게 어울리는 '핸드 드로잉 및 낙서(Doodle)' 요소를 추가하기 위한 최적의 프롬프트를 작성해 주세요. 작성 시 아래의 단계와 [출력 형식]을 엄격히 준수해야 합니다.

Step 1. 배경 및 피사체 분석: 사진 속 주요 배경(산, 바다, 도시 등)과 핵심 피사체(인물, 동물, 사물)를 파악합니다.

Step 2. 드로잉 요소 매칭: 배경을 대체할 스케치 요소(라인 드로잉)와 추가할 낙서 요소(꽃, 구름, 화살표 등)를 기획합니다.
- 사용 가능한 낙서 타입 (정확히 이 문자열만 사용): heart, star, flower, cloud, sparkle, arrow, spiral, music, crown, rainbow, lightning, moon, butterfly, speech, cat, bear, bunny, diamond

Step 3. 질감 및 스타일 지정: '색연필이나 크레용 질감', '검은색 외곽선 스케치', '삐뚤빼뚤한 수작업 느낌'의 스타일을 적용합니다.
- 사용 가능한 필터: valencia(따뜻한 오후), nashville(핑크빛 추억), earlybird(빈티지 감성), vsco(차분한 필름)

Step 4. 대비(Contrast) 설정: 실사 피사체와 원본 사진의 전체적인 밝기, 조명 톤을 절대 변경하지 않고 그대로 유지하여, 추가되는 드로잉 요소들과 극적인 대비를 이루도록 설계합니다.

Step 5. 최종 프롬프트 완성: 이미지 생성 AI가 이해할 수 있는 구체적인 한글 프롬프트를 생성합니다. 아래 좌표계와 규칙에 따라 JSON으로 출력합니다.

[좌표계] x, y는 0~1 정규화 좌표. x: 0=왼쪽, 1=오른쪽. y: 0=위쪽, 1=아래쪽.

[배치 규칙]
- 하늘/상단 여백: cloud, rainbow, moon, star, sparkle 등 → y: 0.02~0.25
- 지면/하단: flower, butterfly 등 자연 요소 → y: 0.75~0.98
- 인물 감지 시: crown은 머리 바로 위, speech는 근처(얼굴 위 직접 배치 금지)
- heart, sparkle, music 등 악센트 요소는 여백 공간에 분산
- 배경 요소(산, 건물, 나무 등)의 윤곽을 따라 라인 드로잉 느낌의 요소 배치
- 피사체 주변에 감성적 낙서 요소(화살표, 하트, 별 등) 추가

[출력 형식 설명]
"업로드한 원본 사진의 고유한 밝기, 색감, 조명 분위기와 실사 피사체는 수정 없이 완벽하게 원본 그대로 유지합니다. 이 사진 위에 손으로 그린 듯한 드로잉 스타일의 라인 드로잉과 낙서 요소들을 오버레이 합니다. 배경 요소들을 검은색 외곽선 스케치와 색연필 질감으로 표현하고, 하늘/여백에는 추천 낙서 요소들을 추가하고, 피사체에도 추천 낙서 요소들을 추가해 주세요. 실사와 드로잉이 조화를 이루는 감성적인 포스터 스타일로 생성해 주세요."

위 콘셉트를 실현하는 JSON을 아래 스키마에 맞춰 출력하세요:
{
  "filter": "valencia | nashville | earlybird | vsco 중 하나",
  "doodles": [
    { "type": "18개 타입 중 하나", "x": 0~1, "y": 0~1, "size": 0.3~2.0, "hue": 0~360, "rotation": -0.5~0.5, "text": "speech 타입일 때만 텍스트" }
  ],
  "texts": [
    { "content": "짧은 영문 텍스트", "x": 0~1, "y": 0~1, "size": 0.03~0.12, "hue": 0~360, "rotation": -0.3~0.3, "style": "handwritten | block | cursive" }
  ],
  "mood": "warm | cool | vintage | dreamy"
}

[필수 가이드라인]
- doodles는 15~25개로 풍성하되 균형 잡힌 구성
- texts는 1~3개, 여백 공간에 배치, 사진 분위기에 맞는 감성 영문 문구 (예: "dreamy days", "hello sunshine", "#throwback")
- 배경의 윤곽선 느낌을 살리기 위해 배경 경계 부근에 arrow, spiral, sparkle 등을 윤곽을 따라 배치
- 피사체 근처에 heart, star, crown, speech 등 감정/표현 요소를 집중 배치
- 전체적으로 '실사 + 핸드드로잉 오버레이'가 조화를 이루는 동화적 감성 포스터 느낌`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    const body = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
        ]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = errData?.error?.message || response.statusText;
      throw new Error(`API 오류 (${response.status}): ${msg}`);
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AI 응답이 비어있습니다.');
    return JSON.parse(text);
  }

  function validateAiConfig(config) {
    const validFilters = ['valencia', 'nashville', 'earlybird', 'vsco'];
    const validDoodleTypes = Object.keys(allDrawFns);

    if (!validFilters.includes(config.filter)) {
      config.filter = 'valencia';
    }

    if (!Array.isArray(config.doodles)) config.doodles = [];
    config.doodles = config.doodles.filter(d => validDoodleTypes.includes(d.type)).map(d => ({
      type: d.type,
      x: clamp(d.x ?? 0.5, 0, 1),
      y: clamp(d.y ?? 0.5, 0, 1),
      size: clamp(d.size ?? 1, 0.3, 2.0),
      hue: clamp(d.hue ?? 0, 0, 360),
      rotation: clamp(d.rotation ?? 0, -0.5, 0.5),
      text: d.text || ''
    }));

    if (!Array.isArray(config.texts)) config.texts = [];
    config.texts = config.texts.slice(0, 5).map(t => ({
      content: String(t.content || '').slice(0, 30),
      x: clamp(t.x ?? 0.5, 0, 1),
      y: clamp(t.y ?? 0.5, 0, 1),
      size: clamp(t.size ?? 0.06, 0.03, 0.12),
      hue: clamp(t.hue ?? 0, 0, 360),
      rotation: clamp(t.rotation ?? 0, -0.3, 0.3),
      style: ['handwritten', 'block', 'cursive'].includes(t.style) ? t.style : 'handwritten'
    }));

    return config;
  }

  async function activateAiMode() {
    if (!originalImage) return;
    if (aiLoading) return;

    const overlay = document.getElementById('aiLoadingOverlay');
    aiLoading = true;
    if (overlay) overlay.classList.remove('hidden');

    try {
      const base64 = getImageBase64();
      const rawConfig = await callGeminiVision(base64);
      const config = validateAiConfig(rawConfig);

      aiConfig = config;
      aiMode = true;

      // Apply the AI-chosen filter
      currentFilter = config.filter;
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      const targetBtn = document.querySelector(`[data-filter="${config.filter}"]`);
      if (targetBtn) targetBtn.classList.add('active');

      applyFilter();
    } catch (err) {
      console.error('AI Decorate Error:', err);
      alert('AI 꾸미기 실패: ' + err.message);
      aiMode = false;
      aiConfig = null;
    } finally {
      aiLoading = false;
      if (overlay) overlay.classList.add('hidden');
    }
  }

  function applyAiDoodleArt() {
    if (!aiConfig) return;
    const w = canvas.width;
    const h = canvas.height;

    // Draw AI-placed doodles
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    resetSeed();

    for (const d of aiConfig.doodles) {
      const drawFn = allDrawFns[d.type];
      if (!drawFn) continue;

      const px = d.x * w;
      const py = d.y * h;
      const baseSize = Math.min(w, h) * 0.07;
      const size = baseSize * d.size;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(d.rotation);

      if (d.type === 'speech' && d.text) {
        drawSpeechBubbleWithText(ctx, size, d.hue, d.text);
      } else {
        drawFn(ctx, size, d.hue);
      }
      ctx.restore();
    }

    ctx.restore();

    // Draw AI text overlays
    for (const t of aiConfig.texts) {
      drawHandwrittenText(t, w, h);
    }
  }

  function drawHandwrittenText(config, w, h) {
    const px = config.x * w;
    const py = config.y * h;
    const fontSize = Math.max(16, Math.min(w, h) * config.size);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(config.rotation);

    let fontFamily;
    switch (config.style) {
      case 'cursive': fontFamily = "'Segoe Script', 'Comic Sans MS', cursive"; break;
      case 'block': fontFamily = "Impact, 'Arial Black', sans-serif"; break;
      default: fontFamily = "'Comic Sans MS', 'Chalkboard SE', cursive"; break;
    }

    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // White outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = Math.max(3, fontSize * 0.12);
    ctx.lineJoin = 'round';
    ctx.strokeText(config.content, 0, 0);

    // Colored fill
    ctx.fillStyle = `hsl(${config.hue}, 70%, 40%)`;
    ctx.fillText(config.content, 0, 0);

    ctx.restore();
  }

  function drawSpeechBubbleWithText(c, s, hue, text) {
    c.strokeStyle = `hsla(${hue}, 50%, 35%, 0.9)`;
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.lineWidth = Math.max(1.5, s * 0.05);

    // Size bubble to text
    var textLen = text.length;
    var bw = Math.max(s * 0.7, s * 0.15 * textLen);
    var bh = s * 0.45;
    var r2 = s * 0.1;

    // Rounded bubble
    c.beginPath();
    c.moveTo(-bw / 2 + r2, -bh / 2);
    c.lineTo(bw / 2 - r2, -bh / 2);
    c.quadraticCurveTo(bw / 2, -bh / 2, bw / 2, -bh / 2 + r2);
    c.lineTo(bw / 2, bh / 2 - r2);
    c.quadraticCurveTo(bw / 2, bh / 2, bw / 2 - r2, bh / 2);
    c.lineTo(-bw / 2 + r2, bh / 2);
    c.quadraticCurveTo(-bw / 2, bh / 2, -bw / 2, bh / 2 - r2);
    c.lineTo(-bw / 2, -bh / 2 + r2);
    c.quadraticCurveTo(-bw / 2, -bh / 2, -bw / 2 + r2, -bh / 2);
    c.closePath();
    c.fill();
    c.stroke();

    // Tail
    c.beginPath();
    c.moveTo(-s * 0.05, bh / 2);
    c.lineTo(-s * 0.15, bh / 2 + s * 0.2);
    c.lineTo(s * 0.08, bh / 2);
    c.stroke();

    // Text
    c.fillStyle = `hsla(${hue}, 60%, 35%, 0.95)`;
    c.font = `bold ${s * 0.2}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 0, 0);
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

    // Reset AI state
    aiMode = false;
    aiConfig = null;
    aiLoading = false;
    const aiOverlay = document.getElementById('aiLoadingOverlay');
    if (aiOverlay) aiOverlay.classList.add('hidden');

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
