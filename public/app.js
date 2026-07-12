/* ========================================
   三米生图 - Application Logic
   ======================================== */

// ---- State ----
const state = {
  activeTab: 'text-to-image',
  styleT2I: 'photography',
  styleI2I: 'photography',
  ratio: '1:1',
  ratioW: 1,
  ratioH: 1,
  count: 4,
  quality: 'hd',
  creativity: 7.5,
  countI2I: 2,
  strength: 50,
  creativityI2I: 7.5,
  uploadedImage: null,
  gallery: [],
  favorites: [],
  usageUsed: 0,
  galleryFilter: 'all',
  currentModalItem: null,
};

// ========================================
// IndexedDB 本地持久化存储
// ========================================
const DB_NAME = 'sanmi-gallery';
const DB_VERSION = 1;
const STORE_NAME = 'images';
let db = null;

function initDB() {
  return new Promise(resolve => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => { console.warn('[三米生图] IndexedDB不可用'); resolve(null); };
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onupgradeneeded = e => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// 保存单张图片到本地（URL图片自动fetch转blob）
async function saveImageToDB(img) {
  if (!db) return;
  try {
    let storedSrc = img.src;
    // 如果是HTTP URL，fetch后存为blob（避免URL过期）
    if (img.src.startsWith('http')) {
      const res = await fetch(img.src);
      storedSrc = await res.blob();
    }
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      id: img.id,
      storedSrc: storedSrc,
      prompt: img.prompt,
      type: img.type,
      style: img.style,
      styleName: img.styleName,
      ratio: img.ratio,
      ratioStr: img.ratioStr,
      time: img.time,
      favorited: img.favorited || false,
    });
  } catch (err) {
    console.error('[三米生图] 保存失败:', err);
  }
}

// 加载所有本地图片
function loadImagesFromDB() {
  return new Promise(resolve => {
    if (!db) { resolve([]); return; }
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const images = (req.result || []).map(r => {
        let src = (typeof r.storedSrc === 'string')
          ? r.storedSrc
          : URL.createObjectURL(r.storedSrc);
        return {
          id: r.id, src, prompt: r.prompt, type: r.type,
          style: r.style, styleName: r.styleName, ratio: r.ratio,
          ratioStr: r.ratioStr, time: r.time, favorited: r.favorited || false,
        };
      });
      resolve(images);
    };
    req.onerror = () => resolve([]);
  });
}

// 删除单张
function deleteImageFromDB(id) {
  if (!db) return;
  try { db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id); }
  catch (e) { console.error('[三米生图] 删除失败:', e); }
}

// 更新元数据（如收藏状态）
function updateImageInDB(id, updates) {
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.get(id).onsuccess = e => {
      const r = e.target.result;
      if (r) { Object.assign(r, updates); store.put(r); }
    };
  } catch (e) { console.error('[三米生图] 更新失败:', e); }
}

// 清空全部
function clearAllDB() {
  if (!db) return;
  try { db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear(); }
  catch (e) { console.error('[三米生图] 清空失败:', e); }
}

// 使用额度持久化（localStorage）
function saveUsage() {
  try { localStorage.setItem('sanmi-usage', String(state.usageUsed)); } catch (e) {}
}
function loadUsage() {
  try { state.usageUsed = parseInt(localStorage.getItem('sanmi-usage') || '0'); }
  catch (e) { state.usageUsed = 0; }
}

// ========================================
// API 配置（Key 已移至后端服务器，前端不再暴露）
// ========================================
const API_CONFIG = {
  // 调用本地后端代理（API Key 安全保存在服务器端 .env 中）
  endpoint: '/api/generate',
  // 比例 → 像素尺寸映射（豆包API要求传像素值或2K/4K，不支持"1:1"格式）
  sizeMap: {
    '1:1':  '2048x2048',
    '4:3':  '2304x1728',
    '3:4':  '1728x2304',
    '16:9': '2560x1440',
    '9:16': '1440x2560',
  },
};

// ---- Style Names Map ----
const styleNames = {
  photography: '商业摄影',
  illustration: '插画艺术',
  '3drender': '3D渲染',
  anime: '动漫风格',
  oilpaint: '油画风格',
  minimal: '极简主义',
};

const qualityNames = {
  standard: '标准',
  hd: '高清',
  ultra: '超清',
};

// ========================================
// Tab Navigation
// ========================================
const tabTitles = {
  'text-to-image': { title: '文生图', desc: '输入文字描述，AI自动生成精美图片' },
  'image-to-image': { title: '图生图', desc: '上传参考图片，AI基于原图进行创作' },
  'gallery': { title: '作品库', desc: '查看和管理所有生成的作品' },
  'favorites': { title: '收藏夹', desc: '你收藏的精选作品' },
  'settings': { title: '设置', desc: '账户和偏好设置' },
};

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const tab = item.dataset.tab;
    if (!tab) return;
    switchTab(tab);
  });
});

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  const info = tabTitles[tab];
  if (info) {
    document.getElementById('page-title').textContent = info.title;
    document.getElementById('page-desc').textContent = info.desc;
  }
}

// ========================================
// Prompt Input
// ========================================
const promptInput = document.getElementById('prompt-input');
const promptCount = document.getElementById('prompt-count');
const promptInputI2I = document.getElementById('prompt-input-i2i');
const promptCountI2I = document.getElementById('prompt-count-i2i');

promptInput.addEventListener('input', () => {
  promptCount.textContent = promptInput.value.length;
});

if (promptInputI2I) {
  promptInputI2I.addEventListener('input', () => {
    promptCountI2I.textContent = promptInputI2I.value.length;
  });
}

// Prompt tags
document.querySelectorAll('.tag-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const prompt = btn.dataset.prompt;
    promptInput.value = prompt;
    promptCount.textContent = prompt.length;
    promptInput.focus();
  });
});

// Prompt enhance (mock)
document.getElementById('prompt-enhance').addEventListener('click', () => {
  const original = promptInput.value.trim();
  if (!original) {
    showToast('请先输入提示词', 'error');
    return;
  }
  const enhanced = original + '，8K超高清，专业摄影，柔和光影，浅景深，高级色彩，商业级画质';
  promptInput.value = enhanced;
  promptCount.textContent = enhanced.length;
  showToast('提示词已优化', 'success');
});

document.getElementById('prompt-enhance-i2i').addEventListener('click', () => {
  const original = promptInputI2I.value.trim();
  if (!original) {
    showToast('请先输入修改描述', 'error');
    return;
  }
  const enhanced = original + '，保持原图构图，8K超高清，专业质感，高级色彩';
  promptInputI2I.value = enhanced;
  promptCountI2I.textContent = enhanced.length;
  showToast('描述已优化', 'success');
});

// ========================================
// Style Selection
// ========================================
function setupStyleGrid(gridId, stateKey) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.querySelectorAll('.style-card').forEach(card => {
    card.addEventListener('click', () => {
      grid.querySelectorAll('.style-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state[stateKey] = card.dataset.style;
    });
  });
}
setupStyleGrid('style-grid', 'styleT2I');
setupStyleGrid('style-grid-i2i', 'styleI2I');

// ========================================
// Ratio Selection
// ========================================
document.querySelectorAll('.ratio-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.ratio = btn.dataset.ratio;
    state.ratioW = parseFloat(btn.dataset.w);
    state.ratioH = parseFloat(btn.dataset.h);
  });
});

// ========================================
// Segmented Controls
// ========================================
function setupSegmented(gridId, stateKey, valueId, formatter) {
  const seg = document.getElementById(gridId);
  if (!seg) return;
  seg.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.count || btn.dataset.quality;
      state[stateKey] = isNaN(val) ? val : parseInt(val);
      if (valueId) {
        const display = formatter ? formatter(val) : val;
        document.getElementById(valueId).textContent = display;
      }
    });
  });
}

setupSegmented('count-segmented', 'count', 'count-value');
setupSegmented('quality-segmented', 'quality', 'quality-value', v => qualityNames[v] || v);
setupSegmented('count-segmented-i2i', 'countI2I', 'count-value-i2i');

// ========================================
// Sliders
// ========================================
const creativitySlider = document.getElementById('creativity-slider');
creativitySlider.addEventListener('input', () => {
  state.creativity = creativitySlider.value / 2;
  document.getElementById('creativity-value').textContent = state.creativity.toFixed(1);
});

const strengthSlider = document.getElementById('strength-slider');
strengthSlider.addEventListener('input', () => {
  state.strength = parseInt(strengthSlider.value);
  document.getElementById('strength-value').textContent = state.strength + '%';
});

const creativitySliderI2I = document.getElementById('creativity-slider-i2i');
creativitySliderI2I.addEventListener('input', () => {
  state.creativityI2I = creativitySliderI2I.value / 2;
  document.getElementById('creativity-value-i2i').textContent = state.creativityI2I.toFixed(1);
});

// ========================================
// Image Upload (图生图)
// ========================================
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const uploadPreview = document.getElementById('upload-preview');
const uploadedImage = document.getElementById('uploaded-image');
const btnRemoveUpload = document.getElementById('btn-remove-upload');

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    handleFileUpload(file);
  } else {
    showToast('请上传图片文件', 'error');
  }
});

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) handleFileUpload(file);
});

function handleFileUpload(file) {
  const reader = new FileReader();
  reader.onload = e => {
    state.uploadedImage = e.target.result;
    uploadedImage.src = e.target.result;
    uploadPlaceholder.style.display = 'none';
    uploadPreview.style.display = 'block';
    showToast('图片上传成功', 'success');
  };
  reader.readAsDataURL(file);
}

btnRemoveUpload.addEventListener('click', e => {
  e.stopPropagation();
  state.uploadedImage = null;
  fileInput.value = '';
  uploadPlaceholder.style.display = '';
  uploadPreview.style.display = 'none';
  showToast('已移除图片', 'info');
});

// ========================================
// Generate Images (Mock)
// ========================================

// Gradient palettes for mock images
const palettes = [
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#30cfd0', '#330867'],
  ['#a8edea', '#fed6e3'],
  ['#ff9a9e', '#fecfef'],
  ['#ffecd2', '#fcb69f'],
  ['#a18cd1', '#fbc2eb'],
  ['#ff6a00', '#ee0979'],
  ['#2193b0', '#6dd5ed'],
  ['#ee9ca7', '#ffdde1'],
  ['#84fab0', '#8fd3f4'],
  ['#c471f5', '#fa71cd'],
  ['#fdbb2d', '#22c1c3'],
];

function generateMockImage(style, seed) {
  const canvas = document.createElement('canvas');
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Pick palette based on seed
  const palette = palettes[seed % palettes.length];

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, palette[0]);
  grad.addColorStop(1, palette[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Add shapes based on style
  const rng = mulberry32(seed * 1000);

  if (style === '3drender') {
    // 3D-like spheres
    for (let i = 0; i < 5; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 40 + rng() * 80;
      const g = ctx.createRadialGradient(x - r/3, y - r/3, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,0.8)`);
      g.addColorStop(0.5, palette[rng() > 0.5 ? 0 : 1]);
      g.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 'anime') {
    // Soft circles with glow
    for (let i = 0; i < 8; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 30 + rng() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.3 + rng() * 0.4})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 'oilpaint') {
    // Brush stroke-like shapes
    for (let i = 0; i < 15; i++) {
      ctx.save();
      ctx.translate(rng() * size, rng() * size);
      ctx.rotate(rng() * Math.PI);
      ctx.fillStyle = `rgba(${rng()*255|0},${rng()*255|0},${rng()*255|0},${0.2 + rng() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 30 + rng() * 50, 10 + rng() * 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (style === 'minimal') {
    // Simple geometric shapes
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    if (rng() > 0.5) {
      ctx.beginPath();
      ctx.arc(size/2, size/2, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6);
    }
  } else {
    // Photography / illustration - abstract patterns
    for (let i = 0; i < 6; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const w = 50 + rng() * 150;
      const h = 50 + rng() * 150;
      ctx.fillStyle = `rgba(${rng()*255|0},${rng()*255|0},${rng()*255|0},${0.1 + rng() * 0.2})`;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng() * Math.PI);
      ctx.beginPath();
      ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Add subtle noise overlay
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rng() - 0.5) * 15;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
    data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  // Add vignette
  const vGrad = ctx.createRadialGradient(size/2, size/2, size * 0.3, size/2, size/2, size * 0.7);
  vGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, size, size);

  return canvas.toDataURL('image/jpeg', 0.85);
}

// Seeded random
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Generate button - Text to Image
document.getElementById('btn-generate-t2i').addEventListener('click', () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    showToast('请输入提示词', 'error');
    promptInput.focus();
    return;
  }
  generateImages('text-to-image', prompt, state.styleT2I, state.count);
});

// Generate button - Image to Image
document.getElementById('btn-generate-i2i').addEventListener('click', () => {
  const prompt = promptInputI2I.value.trim();
  if (!state.uploadedImage) {
    showToast('请先上传参考图片', 'error');
    return;
  }
  if (!prompt) {
    showToast('请输入修改描述', 'error');
    promptInputI2I.focus();
    return;
  }
  generateImages('image-to-image', prompt, state.styleI2I, state.countI2I);
});

// ========================================
// ★★★ API 调用函数 - 在这里接入你的API ★★★
// ========================================

/**
 * 调用真实API生成单张图片
 * @param {string} prompt      - 提示词
 * @param {string} style       - 风格 (photography/illustration/3drender/anime/oilpaint/minimal)
 * @param {string} ratio       - 比例 "1:1"
 * @param {string} type        - "text-to-image" 或 "image-to-image"
 * @param {string|null} refImg - 图生图的参考图(base64)，文生图时为null
 * @returns {Promise<string>}  - 返回图片URL或base64字符串
 */
async function callImageAPI(prompt, style, ratio, type, refImg) {
  // 调用后端代理（API Key 安全保存在服务器端）
  try {
    const size = API_CONFIG.sizeMap[ratio] || '2048x2048';

    // 构建发送给后端的请求体（不含 API Key）
    const reqBody = {
      prompt: prompt,
      size: size,
      watermark: true,
    };

    // 图生图：添加参考图（base64）
    if (type === 'image-to-image' && refImg) {
      reqBody.image = refImg;
    }

    const res = await fetch(API_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[三米生图] API错误:', res.status, errText);
      showToast(`生成失败 ${res.status}: ${errText.slice(0, 200)}`, 'error');
      return generateMockImage(style, Date.now());
    }

    const data = await res.json();
    // 后端返回豆包API原始格式: { data: [{ url: "https://..." }] }
    if (data.data && data.data[0] && data.data[0].url) {
      return data.data[0].url;
    }
    console.error('[三米生图] 返回格式异常:', data);
    showToast('返回格式异常，请检查控制台', 'error');
    return generateMockImage(style, Date.now());

  } catch (err) {
    console.error('[三米生图] 请求失败:', err);
    showToast('请求失败: ' + err.message, 'error');
    return generateMockImage(style, Date.now());
  }
}

// 辅助：base64 转 File 对象（图生图上传需要）
function dataURLtoFile(dataURL, filename) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
  return new File([u8arr], filename, { type: mime });
}

function generateImages(type, prompt, style, count) {
  const resultArea = document.getElementById(type === 'text-to-image' ? 'result-area-t2i' : 'result-area-i2i');
  const ratioStr = `${state.ratioW} / ${state.ratioH}`;

  // Show loading state
  let progressHTML = `
    <div class="gen-progress">
      <div class="gen-progress-bar">
        <div class="spinner"></div>
        <span>AI正在创作中...</span>
        <span class="progress-percent" id="gen-percent">0%</span>
      </div>
    </div>
    <div class="skeleton-grid" style="--ratio: ${ratioStr}">
  `;

  for (let i = 0; i < count; i++) {
    progressHTML += `
      <div class="skeleton-item" style="--ratio: ${ratioStr}">
        <div class="loading-icon">
          <div class="spinner"></div>
          <span>生成中 ${i + 1}/${count}</span>
        </div>
      </div>
    `;
  }
  progressHTML += '</div>';

  resultArea.innerHTML = progressHTML;

  // Animate progress
  let progress = 0;
  const percentEl = document.getElementById('gen-percent');
  const progressInterval = setInterval(() => {
    progress += Math.random() * 15 + 5;
    if (progress >= 100) {
      progress = 100;
      clearInterval(progressInterval);
    }
    if (percentEl) percentEl.textContent = Math.floor(progress) + '%';
  }, 300);

  // ★ 调用API生成图片（自动判断真实API / 模拟生成）
  const refImg = type === 'image-to-image' ? state.uploadedImage : null;
  const baseSeed = Date.now();
  const imagePromises = [];

  for (let i = 0; i < count; i++) {
    imagePromises.push(
      callImageAPI(prompt, style, state.ratio, type, refImg).then(src => ({
        id: 'img_' + baseSeed + '_' + i,
        src: src,
        prompt: prompt,
        type: type,
        style: style,
        styleName: styleNames[style] || style,
        ratio: state.ratio,
        ratioStr: ratioStr,
        time: new Date().toLocaleString('zh-CN'),
        favorited: false,
      }))
    );
  }

  Promise.all(imagePromises).then(images => {
    clearInterval(progressInterval);
    if (percentEl) percentEl.textContent = '100%';

    // Display results
    displayResults(resultArea, images, ratioStr);

    // Add to gallery
    state.gallery.unshift(...images);
    updateGalleryCount();
    updateUsage(count);

    // 保存到本地 IndexedDB
    images.forEach(img => saveImageToDB(img));

    showToast(`成功生成 ${count} 张图片`, 'success');
  }).catch(err => {
    clearInterval(progressInterval);
    console.error('[三米生图] 生成失败:', err);
    showToast('生成失败，请重试', 'error');
  });
}

function displayResults(container, images, ratioStr) {
  let html = '<div class="result-grid" style="--ratio: ' + ratioStr + '">';
  images.forEach((img, i) => {
    html += `
      <div class="result-item" style="--ratio: ${ratioStr}; animation-delay: ${i * 0.1}s" data-id="${img.id}">
        <img src="${img.src}" alt="生成结果">
        <div class="result-overlay">
          <div class="result-actions">
            <button class="result-action" data-action="view" title="查看">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M21 3l-9 9M9 21H3v-6M3 21l9-9"/></svg>
            </button>
            <button class="result-action ${img.favorited ? 'favorited' : ''}" data-action="favorite" title="收藏">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </button>
            <button class="result-action" data-action="download" title="下载">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  });
  html += '</div>';

  // Add "generate more" button
  html += `
    <div style="text-align: center; margin-top: 8px;">
      <button class="ghost-btn" id="btn-regenerate" style="display: inline-flex;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        再生成一组
      </button>
    </div>
  `;

  container.innerHTML = html;

  // Bind result actions
  container.querySelectorAll('.result-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelectorAll('.result-action').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const action = btn.dataset.action;
        handleImageAction(action, id, btn);
      });
    });
    item.addEventListener('click', () => {
      const img = findImage(id);
      if (img) openModal(img);
    });
  });

  const regenBtn = document.getElementById('btn-regenerate');
  if (regenBtn) {
    regenBtn.addEventListener('click', () => {
      const activeBtn = state.activeTab === 'text-to-image'
        ? document.getElementById('btn-generate-t2i')
        : document.getElementById('btn-generate-i2i');
      activeBtn.click();
    });
  }
}

function handleImageAction(action, id, btn) {
  const img = findImage(id);
  if (!img) return;

  if (action === 'view') {
    openModal(img);
  } else if (action === 'favorite') {
    img.favorited = !img.favorited;
    btn.classList.toggle('favorited', img.favorited);
    if (img.favorited) {
      state.favorites.unshift(img);
      showToast('已收藏', 'success');
    } else {
      state.favorites = state.favorites.filter(f => f.id !== id);
      showToast('已取消收藏', 'info');
    }
    updateImageInDB(id, { favorited: img.favorited });
    renderGallery();
    renderFavorites();
  } else if (action === 'download') {
    downloadImage(img.src, `三米生图_${id}.jpg`);
    showToast('图片已下载', 'success');
  }
}

function findImage(id) {
  return state.gallery.find(g => g.id === id) || state.favorites.find(f => f.id === id);
}

function downloadImage(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ========================================
// Gallery
// ========================================
function updateGalleryCount() {
  document.getElementById('gallery-count').textContent = state.gallery.length;
}

function updateUsage(count) {
  state.usageUsed += count;
  const max = 100;
  const percent = Math.min(100, (state.usageUsed / max) * 100);
  document.getElementById('usage-used').textContent = state.usageUsed;
  document.getElementById('usage-fill').style.width = percent + '%';
  document.getElementById('settings-used').textContent = state.usageUsed + ' 次';
  document.getElementById('settings-remaining').textContent = Math.max(0, max - state.usageUsed) + ' 次';
  saveUsage();
}

function renderGallery() {
  const grid = document.getElementById('gallery-grid');
  let items = state.gallery;

  if (state.galleryFilter === 'text-to-image') {
    items = state.gallery.filter(i => i.type === 'text-to-image');
  } else if (state.galleryFilter === 'image-to-image') {
    items = state.gallery.filter(i => i.type === 'image-to-image');
  } else if (state.galleryFilter === 'favorites') {
    items = state.gallery.filter(i => i.favorited);
  }

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state full">
        <div class="empty-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        </div>
        <h3>暂无作品</h3>
        <p>${state.galleryFilter === 'all' ? '生成图片后，作品将自动保存到此处' : '该分类下暂无作品'}</p>
      </div>
    `;
    return;
  }

  let html = '';
  items.forEach((img, i) => {
    html += `
      <div class="gallery-item" style="animation-delay: ${i * 0.05}s" data-id="${img.id}">
        <img src="${img.src}" alt="作品">
        <span class="badge">${img.type === 'text-to-image' ? '文生图' : '图生图'}</span>
        ${img.favorited ? `<div class="fav-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>` : ''}
        <div class="result-overlay">
          <div class="result-actions">
            <button class="result-action" data-action="view" title="查看">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M21 3l-9 9M9 21H3v-6M3 21l9-9"/></svg>
            </button>
            <button class="result-action ${img.favorited ? 'favorited' : ''}" data-action="favorite" title="收藏">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </button>
            <button class="result-action" data-action="download" title="下载">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            </button>
            <button class="result-action" data-action="delete" title="删除">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  });
  grid.innerHTML = html;

  // Bind gallery item actions
  grid.querySelectorAll('.gallery-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelectorAll('.result-action').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'delete') {
          deleteImage(id);
        } else {
          handleImageAction(action, id, btn);
        }
      });
    });
    item.addEventListener('click', () => {
      const img = findImage(id);
      if (img) openModal(img);
    });
  });
}

function renderFavorites() {
  const grid = document.getElementById('favorites-grid');
  const items = state.gallery.filter(i => i.favorited);

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state full">
        <div class="empty-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </div>
        <h3>暂无收藏</h3>
        <p>点击图片上的收藏按钮，将喜欢的作品保存到这里</p>
      </div>
    `;
    return;
  }

  let html = '';
  items.forEach((img, i) => {
    html += `
      <div class="gallery-item" style="animation-delay: ${i * 0.05}s" data-id="${img.id}">
        <img src="${img.src}" alt="收藏作品">
        <span class="badge">${img.type === 'text-to-image' ? '文生图' : '图生图'}</span>
        <div class="fav-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>
        <div class="result-overlay">
          <div class="result-actions">
            <button class="result-action" data-action="view" title="查看">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M21 3l-9 9M9 21H3v-6M3 21l9-9"/></svg>
            </button>
            <button class="result-action favorited" data-action="favorite" title="取消收藏">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </button>
            <button class="result-action" data-action="download" title="下载">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  });
  grid.innerHTML = html;

  grid.querySelectorAll('.gallery-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelectorAll('.result-action').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        handleImageAction(btn.dataset.action, id, btn);
      });
    });
    item.addEventListener('click', () => {
      const img = findImage(id);
      if (img) openModal(img);
    });
  });
}

function deleteImage(id) {
  state.gallery = state.gallery.filter(g => g.id !== id);
  state.favorites = state.favorites.filter(f => f.id !== id);
  deleteImageFromDB(id);
  updateGalleryCount();
  renderGallery();
  renderFavorites();
  showToast('已删除', 'info');
}

// Gallery filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.galleryFilter = btn.dataset.filter;
    renderGallery();
  });
});

// Clear gallery
document.getElementById('btn-clear-gallery').addEventListener('click', () => {
  if (state.gallery.length === 0) {
    showToast('作品库已经是空的', 'info');
    return;
  }
  if (confirm('确定要清空所有作品吗？此操作不可恢复。')) {
    state.gallery = [];
    state.favorites = [];
    state.usageUsed = 0;
    clearAllDB();
    localStorage.removeItem('sanmi-usage');
    updateGalleryCount();
    document.getElementById('usage-used').textContent = '0';
    document.getElementById('usage-fill').style.width = '0%';
    document.getElementById('settings-used').textContent = '0 次';
    document.getElementById('settings-remaining').textContent = '100 次';
    renderGallery();
    renderFavorites();
    showToast('作品库已清空', 'success');
  }
});

// ========================================
// Modal
// ========================================
const modal = document.getElementById('image-modal');
const modalClose = document.getElementById('modal-close');
const modalImg = document.getElementById('modal-img');

function openModal(img) {
  state.currentModalItem = img;
  modalImg.src = img.src;
  document.getElementById('modal-type').textContent = img.type === 'text-to-image' ? '文生图' : '图生图';
  document.getElementById('modal-style').textContent = img.styleName;
  document.getElementById('modal-ratio').textContent = img.ratio;
  document.getElementById('modal-time').textContent = img.time;
  document.getElementById('modal-prompt-text').textContent = img.prompt;
  modal.classList.add('active');
}

function closeModal() {
  modal.classList.remove('active');
  state.currentModalItem = null;
}

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', e => {
  if (e.target === modal) closeModal();
});

document.getElementById('btn-favorite-modal').addEventListener('click', () => {
  if (!state.currentModalItem) return;
  const img = state.currentModalItem;
  img.favorited = !img.favorited;
  if (img.favorited) {
    state.favorites.unshift(img);
    showToast('已收藏', 'success');
  } else {
    state.favorites = state.favorites.filter(f => f.id !== img.id);
    showToast('已取消收藏', 'info');
  }
  updateImageInDB(img.id, { favorited: img.favorited });
  renderGallery();
  renderFavorites();
});

document.getElementById('btn-download-modal').addEventListener('click', () => {
  if (!state.currentModalItem) return;
  downloadImage(state.currentModalItem.src, `三米生图_${state.currentModalItem.id}.jpg`);
  showToast('图片已下载', 'success');
});

document.getElementById('btn-delete-modal').addEventListener('click', () => {
  if (!state.currentModalItem) return;
  deleteImage(state.currentModalItem.id);
  closeModal();
});

// ========================================
// Toast Notifications
// ========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// ========================================
// Keyboard Shortcuts
// ========================================
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.classList.contains('active')) {
    closeModal();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (state.activeTab === 'text-to-image') {
      document.getElementById('btn-generate-t2i').click();
    } else if (state.activeTab === 'image-to-image') {
      document.getElementById('btn-generate-i2i').click();
    }
  }
});

// ========================================
// Init - 页面加载时读取本地历史数据
// ========================================
(async () => {
  // 初始化数据库
  await initDB();

  // 加载本地保存的图片
  const saved = await loadImagesFromDB();
  if (saved.length > 0) {
    state.gallery = saved;
    updateGalleryCount();
  }

  // 加载使用额度
  loadUsage();
  if (state.usageUsed > 0) {
    const max = 100;
    const percent = Math.min(100, (state.usageUsed / max) * 100);
    document.getElementById('usage-used').textContent = state.usageUsed;
    document.getElementById('usage-fill').style.width = percent + '%';
    document.getElementById('settings-used').textContent = state.usageUsed + ' 次';
    document.getElementById('settings-remaining').textContent = Math.max(0, max - state.usageUsed) + ' 次';
  }

  // 渲染作品库和收藏夹
  renderGallery();
  renderFavorites();

  showToast(saved.length > 0 ? `欢迎回来，已加载 ${saved.length} 张历史作品` : '欢迎使用三米生图', 'success');
})();
