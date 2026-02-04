// 2016 Style Photo Filter Generator
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

  // State
  let originalImage = null;
  let currentFilter = 'valencia';
  let intensity = 80;
  let grainAmount = 15;

  // 2016 Style Filters - Instagram/VSCO inspired
  const filters = {
    valencia: {
      brightness: 1.08,
      contrast: 1.08,
      saturate: 1.15,
      sepia: 0.08,
      warmth: 15,
      fadeBlack: 20,
      vignette: 0.3
    },
    nashville: {
      brightness: 1.05,
      contrast: 1.2,
      saturate: 1.2,
      sepia: 0.02,
      warmth: 25,
      fadeBlack: 10,
      vignette: 0.25,
      tint: { r: 247, g: 176, b: 152, a: 0.1 }
    },
    lofi: {
      brightness: 1.0,
      contrast: 1.5,
      saturate: 1.3,
      sepia: 0,
      warmth: 0,
      fadeBlack: 0,
      vignette: 0.6
    },
    earlybird: {
      brightness: 1.0,
      contrast: 0.9,
      saturate: 0.9,
      sepia: 0.25,
      warmth: 20,
      fadeBlack: 30,
      vignette: 0.5
    },
    vsco: {
      brightness: 1.02,
      contrast: 0.95,
      saturate: 0.85,
      sepia: 0.05,
      warmth: 5,
      fadeBlack: 35,
      vignette: 0.2,
      tint: { r: 100, g: 120, b: 140, a: 0.05 }
    }
  };

  // Initialize
  function init() {
    setupEventListeners();
  }

  function setupEventListeners() {
    // Upload area click
    uploadArea.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        loadImage(file);
      }
    });

    // Filter buttons
    filterList.addEventListener('click', (e) => {
      if (e.target.classList.contains('filter-btn')) {
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        applyFilter();
      }
    });

    // Sliders
    intensitySlider.addEventListener('input', (e) => {
      intensity = parseInt(e.target.value);
      applyFilter();
    });

    grainSlider.addEventListener('input', (e) => {
      grainAmount = parseInt(e.target.value);
      applyFilter();
    });

    // Buttons
    resetBtn.addEventListener('click', resetEditor);
    downloadBtn.addEventListener('click', downloadImage);
    shareBtn.addEventListener('click', shareImage);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      loadImage(file);
    }
  }

  function loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        originalImage = img;
        setupCanvas();
        applyFilter();
        uploadArea.classList.add('hidden');
        editor.classList.remove('hidden');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setupCanvas() {
    const maxWidth = 1080;
    const maxHeight = 1350;
    let width = originalImage.width;
    let height = originalImage.height;

    // Scale down if needed
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = (width * maxHeight) / height;
      height = maxHeight;
    }

    canvas.width = width;
    canvas.height = height;
  }

  function applyFilter() {
    if (!originalImage) return;

    const filter = filters[currentFilter];
    const intensityRatio = intensity / 100;

    // Draw original image
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Apply pixel manipulations
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Brightness
      const brightnessVal = lerp(1, filter.brightness, intensityRatio);
      r *= brightnessVal;
      g *= brightnessVal;
      b *= brightnessVal;

      // Contrast
      const contrastVal = lerp(1, filter.contrast, intensityRatio);
      r = ((r / 255 - 0.5) * contrastVal + 0.5) * 255;
      g = ((g / 255 - 0.5) * contrastVal + 0.5) * 255;
      b = ((b / 255 - 0.5) * contrastVal + 0.5) * 255;

      // Saturation
      const satVal = lerp(1, filter.saturate, intensityRatio);
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray + satVal * (r - gray);
      g = gray + satVal * (g - gray);
      b = gray + satVal * (b - gray);

      // Sepia
      const sepiaVal = filter.sepia * intensityRatio;
      const tr = 0.393 * r + 0.769 * g + 0.189 * b;
      const tg = 0.349 * r + 0.686 * g + 0.168 * b;
      const tb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r + (tr - r) * sepiaVal;
      g = g + (tg - g) * sepiaVal;
      b = b + (tb - b) * sepiaVal;

      // Warmth (shift towards orange/yellow)
      const warmthVal = filter.warmth * intensityRatio;
      r += warmthVal;
      g += warmthVal * 0.4;
      b -= warmthVal * 0.3;

      // Fade black (raise black point)
      const fadeVal = filter.fadeBlack * intensityRatio;
      r = r + fadeVal;
      g = g + fadeVal;
      b = b + fadeVal;

      // Color tint overlay
      if (filter.tint) {
        const tintAlpha = filter.tint.a * intensityRatio;
        r = r * (1 - tintAlpha) + filter.tint.r * tintAlpha;
        g = g * (1 - tintAlpha) + filter.tint.g * tintAlpha;
        b = b * (1 - tintAlpha) + filter.tint.b * tintAlpha;
      }

      // Clamp values
      data[i] = clamp(r, 0, 255);
      data[i + 1] = clamp(g, 0, 255);
      data[i + 2] = clamp(b, 0, 255);
    }

    ctx.putImageData(imageData, 0, 0);

    // Apply vignette
    if (filter.vignette > 0) {
      applyVignette(filter.vignette * intensityRatio);
    }

    // Apply grain
    if (grainAmount > 0) {
      applyGrain(grainAmount);
    }

    // Add watermark
    addWatermark();
  }

  function applyVignette(strength) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.max(canvas.width, canvas.height) * 0.7;

    const gradient = ctx.createRadialGradient(
      centerX, centerY, radius * 0.3,
      centerX, centerY, radius
    );

    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${strength})`);

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
    const fontSize = Math.max(14, canvas.width * 0.025);

    ctx.save();
    ctx.font = `${fontSize}px 'Noto Sans KR', sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';

    // Shadow for readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(text, canvas.width - 15, canvas.height - 15);
    ctx.restore();
  }

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

    // Reset filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-filter="valencia"]').classList.add('active');
  }

  function downloadImage() {
    const link = document.createElement('a');
    link.download = `2016filter_${Date.now()}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.92);
    link.click();
  }

  async function shareImage() {
    try {
      // Convert canvas to blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      const file = new File([blob], '2016filter.jpg', { type: 'image/jpeg' });

      // Check if Web Share API is available
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: '2016 Filter',
          text: '2026 is the new 2016 #2016filter'
        });
      } else {
        // Fallback: copy to clipboard or download
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': canvas.toBlob.bind(canvas) })
          ]);
          alert('이미지가 클립보드에 복사되었습니다!');
        } else {
          downloadImage();
          alert('공유 기능을 지원하지 않는 브라우저입니다.\n이미지가 다운로드됩니다.');
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
        downloadImage();
      }
    }
  }

  // Utility functions
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
