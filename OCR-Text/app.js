/* OCR | استخراج متن
 * Tesseract.js 7 + official 4.0.0_best_int compressed language data (fas + eng)
 * This file also serves as the service worker when requested with ?sw=1.
 */
(function () {
  'use strict';

  const APP_VERSION = '5.0.1-standalone';
  const SHELL_CACHE = `ocr-shell-${APP_VERSION}`;
  const ASSET_CACHE = `ocr-assets-${APP_VERSION}`;
  const RUNTIME_SEGMENT = '__ocr_runtime__/';
  const TESSERACT_VERSION = '7.0.0';
  const CORE_VERSION = '7.0.0';
  const TESSDATA_PACKAGE_VERSION = '1.0.0';
  const TESSDATA_MODEL_FOLDER = '4.0.0_best_int';
  const TESSDATA_CDN = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data';
  const TESSDATA_FALLBACK_CDN = 'https://unpkg.com/@tesseract.js-data';

  // Service-worker mode: same app.js file, no fifth project file required.
  if (typeof document === 'undefined' && typeof self !== 'undefined' && self.registration) {
    installServiceWorker();
    return;
  }
  if (typeof document === 'undefined') return;

  const scriptElement = document.currentScript;
  const APP_BASE = new URL('./', scriptElement && scriptElement.src ? scriptElement.src : location.href);
  const RUNTIME_BASE = new URL(RUNTIME_SEGMENT, APP_BASE);
  const REMOTE = {
    'tesseract.min.js': `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.min.js`,
    'worker.min.js': `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js`,
    'core/tesseract-core-simd-lstm.wasm.js': `https://cdn.jsdelivr.net/npm/tesseract.js-core@${CORE_VERSION}/tesseract-core-simd-lstm.wasm.js`,
    'core/tesseract-core-simd-lstm.wasm': `https://cdn.jsdelivr.net/npm/tesseract.js-core@${CORE_VERSION}/tesseract-core-simd-lstm.wasm`,
    'core/tesseract-core-lstm.wasm.js': `https://cdn.jsdelivr.net/npm/tesseract.js-core@${CORE_VERSION}/tesseract-core-lstm.wasm.js`,
    'core/tesseract-core-lstm.wasm': `https://cdn.jsdelivr.net/npm/tesseract.js-core@${CORE_VERSION}/tesseract-core-lstm.wasm`,
    'lang/fas.traineddata.gz': `${TESSDATA_CDN}/fas@${TESSDATA_PACKAGE_VERSION}/${TESSDATA_MODEL_FOLDER}/fas.traineddata.gz`,
    'lang/eng.traineddata.gz': `${TESSDATA_CDN}/eng@${TESSDATA_PACKAGE_VERSION}/${TESSDATA_MODEL_FOLDER}/eng.traineddata.gz`
  };

  function installServiceWorker() {
    const base = new URL('./', self.location.href);
    const runtimePath = new URL(RUNTIME_SEGMENT, base).pathname;
    const shellFiles = ['index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'assets/font/AradVF.ttf', 'assets/favicon/OCR.png'];

    self.addEventListener('install', event => {
      event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        await Promise.all(shellFiles.map(async name => {
          const url = new URL(name, base).href;
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) await cache.put(url, response);
          } catch (_) { /* The current page can still finish this first online visit. */ }
        }));
        await self.skipWaiting();
      })());
    });

    self.addEventListener('activate', event => {
      event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
          .filter(name => name.startsWith('ocr-') && name !== SHELL_CACHE && name !== ASSET_CACHE)
          .map(name => caches.delete(name)));
        await self.clients.claim();
      })());
    });

    self.addEventListener('fetch', event => {
      const request = event.request;
      if (request.method !== 'GET') return;
      const url = new URL(request.url);
      if (url.origin !== self.location.origin) return;

      if (url.pathname.startsWith(runtimePath)) {
        event.respondWith(serveRuntimeAsset(request, url.pathname.slice(runtimePath.length)));
        return;
      }

      if (url.origin === self.location.origin && (request.mode === 'navigate' || /\.(?:html|css|js|ttf|woff2?)$/i.test(url.pathname))) {
        event.respondWith((async () => {
          const cache = await caches.open(SHELL_CACHE);
          const cached = await cache.match(request, { ignoreSearch: true });
          if (cached) return cached;
          try {
            const response = await fetch(request);
            if (response.ok) await cache.put(request, response.clone());
            return response;
          } catch (_) {
            if (request.mode === 'navigate') {
              const fallback = await cache.match(new URL('index.html', base).href);
              if (fallback) return fallback;
            }
            return new Response('این فایل هنوز برای استفادهٔ آفلاین ذخیره نشده است.', {
              status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          }
        })());
      }
    });

    async function serveRuntimeAsset(request, relativePath) {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      const candidates = runtimeCandidates(relativePath);
      if (!candidates.length) {
        return new Response('فایل درخواستی جزو منابع تعریف‌شدهٔ OCR نیست.', { status: 404 });
      }

      let lastError = '';
      for (const remoteUrl of candidates) {
        try {
          const response = await fetch(remoteUrl, { mode: 'cors', cache: 'force-cache' });
          if (!response.ok) {
            lastError = `HTTP ${response.status} از ${new URL(remoteUrl).host}`;
            continue;
          }
          const contentType = response.headers.get('content-type') || '';
          if (/text\/html/i.test(contentType)) {
            lastError = 'به‌جای فایل موتور، صفحهٔ خطای وب دریافت شد.';
            continue;
          }
          const bytes = await response.clone().arrayBuffer();
          const minimumSize = relativePath.endsWith('.traineddata.gz') ? 50000
            : relativePath.endsWith('.traineddata') ? 300000
            : relativePath.endsWith('.wasm') ? 500000
            : 15000;
          if (relativePath.endsWith('.traineddata.gz') && !(bytes.byteLength > 2 && new Uint8Array(bytes, 0, 2)[0] === 0x1f && new Uint8Array(bytes, 0, 2)[1] === 0x8b)) {
            lastError = 'فایل مدل دریافت‌شده، قالب GZIP معتبر ندارد.';
            continue;
          }
          if (bytes.byteLength < minimumSize) {
            lastError = `فایل دریافتی ناقص است (${bytes.byteLength} بایت).`;
            continue;
          }
          const mime = relativePath.endsWith('.wasm') ? 'application/wasm'
            : relativePath.endsWith('.traineddata.gz') ? 'application/gzip'
            : relativePath.endsWith('.traineddata') ? 'application/octet-stream'
            : 'application/javascript; charset=utf-8';
          const localResponse = new Response(bytes, {
            status: 200,
            headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000' }
          });
          await cache.put(request, localResponse.clone());
          return localResponse;
        } catch (error) {
          lastError = error && error.message ? error.message : 'خطای شبکه';
        }
      }
      return new Response(`دریافت منبع OCR ناموفق بود: ${relativePath}. ${lastError}`, {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    function runtimeCandidates(path) {
      const url = REMOTE[path];
      if (!url) return [];
      const bundled = new URL(`assets/ocr-runtime/${path}`, base).href;
      if (url.startsWith(`${TESSDATA_CDN}/`)) {
        const packagePath = url.slice(`${TESSDATA_CDN}/`.length);
        return [bundled, url, `${TESSDATA_FALLBACK_CDN}/${packagePath}`];
      }
      if (url.includes('cdn.jsdelivr.net/npm/')) {
        const packagePath = url.split('/npm/')[1];
        return [bundled, url, `https://unpkg.com/${packagePath}`];
      }
      return [bundled, url];
    }
  }

  function startApp() {
    const $ = id => document.getElementById(id);
    const ui = {
      networkBadge: $('networkBadge'), engineBadge: $('engineBadge'), fileInput: $('fileInput'),
      dropZone: $('dropZone'), emptyState: $('emptyState'), previewWrap: $('previewWrap'),
      previewImage: $('previewImage'), imageName: $('imageName'), imageDimensions: $('imageDimensions'),
      chooseButton: $('chooseButton'), clearButton: $('clearButton'), runButton: $('runButton'),
      languageMode: $('languageMode'), accuracyMode: $('accuracyMode'), normalizeText: $('normalizeText'),
      progressArea: $('progressArea'), progressLabel: $('progressLabel'), progressPercent: $('progressPercent'),
      progressFill: $('progressFill'), statusText: $('statusText'), resultText: $('resultText'),
      emptyOutput: $('emptyOutput'), confidenceBadge: $('confidenceBadge'), resultStats: $('resultStats'),
      resultSource: $('resultSource'), alternativeRow: $('alternativeRow'), showAlternativeButton: $('showAlternativeButton'),
      copyButton: $('copyButton'), downloadButton: $('downloadButton'), prepareButton: $('prepareButton'),
      offlineStatus: $('offlineStatus'), toast: $('toast')
    };

    const state = {
      file: null, previewUrl: null, worker: null, workerLanguage: '', busy: false,
      swReady: false, alternatives: [], activeResult: 0, toastTimer: null, tesseractLoading: null
    };

    function toast(message) {
      ui.toast.textContent = message;
      ui.toast.classList.add('show');
      clearTimeout(state.toastTimer);
      state.toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 3000);
    }

    function digitsFa(value) { return String(value).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]); }

    function setBadge(element, text, type = 'neutral') {
      element.textContent = text;
      element.className = `badge ${type}`;
    }

    function setProgress(label, percent = null, detail = '') {
      ui.progressArea.hidden = false;
      ui.progressLabel.textContent = label;
      ui.progressPercent.textContent = percent == null ? '' : `${digitsFa(Math.round(percent))}٪`;
      if (percent != null) ui.progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
      ui.statusText.textContent = detail;
    }

    function setBusy(value) {
      state.busy = value;
      ui.runButton.disabled = value || !state.file;
      ui.prepareButton.disabled = value;
      ui.chooseButton.disabled = value;
      ui.clearButton.disabled = value || !state.file;
      ui.languageMode.disabled = value;
      ui.accuracyMode.disabled = value;
      ui.normalizeText.disabled = value;
      ui.runButton.textContent = value ? 'در حال پردازش…' : '✦ استخراج متن';
    }

    function updateNetworkBadge() {
      if (!navigator.onLine) setBadge(ui.networkBadge, 'بدون اینترنت', state.swReady ? 'good' : 'warn');
      else setBadge(ui.networkBadge, 'اتصال اینترنت برقرار', 'good');
    }

    function appAsset(name) { return new URL(name, APP_BASE).href; }
    function runtimeAsset(name) { return new URL(name, RUNTIME_BASE).href; }

    async function waitForController(timeoutMs = 7000) {
      if (navigator.serviceWorker.controller) return true;
      return new Promise(resolve => {
        let done = false;
        const finish = value => {
          if (done) return;
          done = true;
          navigator.serviceWorker.removeEventListener('controllerchange', onChange);
          clearTimeout(timer);
          resolve(value);
        };
        const onChange = () => finish(!!navigator.serviceWorker.controller);
        const timer = setTimeout(() => finish(!!navigator.serviceWorker.controller), timeoutMs);
        navigator.serviceWorker.addEventListener('controllerchange', onChange, { once: true });
      });
    }

    async function ensureServiceWorker() {
      if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') return false;
      try {
        const swUrl = new URL('app.js?sw=1', APP_BASE);
        let registration = await navigator.serviceWorker.getRegistration(APP_BASE.pathname);
        if (!registration) {
          registration = await navigator.serviceWorker.register(swUrl.href, { scope: APP_BASE.pathname, updateViaCache: 'none' });
        } else if (registration.waiting || registration.installing) {
          await navigator.serviceWorker.ready;
        }
        await navigator.serviceWorker.ready;
        const controlled = await waitForController();
        state.swReady = controlled;
        updateNetworkBadge();
        if (controlled) {
          ui.offlineStatus.textContent = 'ذخیره‌سازی آفلاین فعال است؛ منابع در اولین آماده‌سازی دریافت می‌شوند.';
          return true;
        }
        ui.offlineStatus.textContent = 'سرویس آفلاین فعال نشد. صفحه را یک‌بار تازه‌سازی کن و دوباره آماده‌سازی را بزن.';
        return false;
      } catch (error) {
        state.swReady = false;
        ui.offlineStatus.textContent = `فعال‌سازی حالت آفلاین ممکن نشد: ${error.message || error}`;
        updateNetworkBadge();
        return false;
      }
    }

    function supportsWasmSimd() {
      try {
        const probe = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]);
        return typeof WebAssembly !== 'undefined' && WebAssembly.validate(probe);
      } catch (_) { return false; }
    }

    function remoteRuntimeAsset(path) {
      return REMOTE[path] || '';
    }

    function isNativeApp() {
      return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    }

    function bundledRuntimeAsset(path) {
      return new URL(`assets/ocr-runtime/${path}`, APP_BASE).href;
    }

    function asset(path) {
      if (isNativeApp()) return bundledRuntimeAsset(path);
      return state.swReady ? runtimeAsset(path) : remoteRuntimeAsset(path);
    }

    function loadTesseractScript() {
      if (window.Tesseract) return Promise.resolve(window.Tesseract);
      if (state.tesseractLoading) return state.tesseractLoading;
      state.tesseractLoading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = asset('tesseract.min.js');
        script.async = true;
        script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('کتابخانه بارگذاری شد اما شیء Tesseract پیدا نشد.'));
        script.onerror = () => reject(new Error('دریافت کتابخانه Tesseract.js ناموفق بود. اتصال اینترنت یا دسترسی به CDN را بررسی کن.'));
        document.head.appendChild(script);
      }).catch(error => { state.tesseractLoading = null; throw error; });
      return state.tesseractLoading;
    }

    function selectedLanguage() {
      const mode = ui.languageMode.value;
      if (mode === 'fas') return 'fas';
      if (mode === 'eng') return 'eng';
      return 'fas+eng';
    }

    async function getWorker() {
      const language = selectedLanguage();
      if (state.worker && state.workerLanguage === language) return state.worker;
      if (state.worker) {
        await state.worker.terminate();
        state.worker = null;
        state.workerLanguage = '';
      }
      const Tesseract = await loadTesseractScript();
      const simd = supportsWasmSimd();
      const coreFile = simd ? 'core/tesseract-core-simd-lstm.wasm.js' : 'core/tesseract-core-lstm.wasm.js';
      setProgress('راه‌اندازی موتور OCR…', 8, 'در حال بارگذاری هستهٔ WebAssembly و مدل دقیق زبان.');
      const workerOptions = {
        workerPath: asset('worker.min.js'),
        corePath: asset(coreFile),
        gzip: true,
        cacheMethod: 'write',
        cachePath: `ocr-tessdata-best-int-${APP_VERSION}`,
        workerBlobURL: true,
        logger: message => {
          const ratio = typeof message.progress === 'number' ? message.progress : 0;
          const labels = {
            'loading tesseract core': 'بارگذاری هستهٔ OCR…',
            'initializing tesseract': 'راه‌اندازی موتور تشخیص…',
            'loading language traineddata': 'دریافت مدل دقیق فارسی/انگلیسی…',
            'initializing api': 'آماده‌سازی مدل زبان…',
            'recognizing text': 'در حال خواندن متن تصویر…'
          };
          const base = message.status === 'recognizing text' ? 45 : 5;
          const span = message.status === 'recognizing text' ? 54 : 38;
          setProgress(labels[message.status] || 'آماده‌سازی موتور…', base + ratio * span,
            message.status === 'loading language traineddata' ? 'مدل فشردهٔ best-int در اولین اجرا دریافت و ذخیره می‌شود.' : 'پردازش داخل مرورگر انجام می‌شود.');
        },
        errorHandler: error => console.error('OCR Tesseract:', error)
      };
      // Capacitor APKs must always prefer their packaged language files.
      // A Service Worker may also be registered in Android WebView, but its
      // virtual runtime path is not the APK's bundled assets directory.
      if (isNativeApp()) workerOptions.langPath = bundledRuntimeAsset('lang');
      else if (state.swReady) workerOptions.langPath = runtimeAsset('lang');
      state.worker = await Tesseract.createWorker(language, 1, workerOptions);
      state.workerLanguage = language;
      setBadge(ui.engineBadge, 'موتور آماده است', 'good');
      return state.worker;
    }

    function normalizeText(text) {
      let output = String(text || '').normalize('NFC');
      if (ui.normalizeText.checked) {
        output = output.replace(/[ك]/g, 'ک').replace(/[يى]/g, 'ی').replace(/[٠-٩]/g, digit => '۰۱۲۳۴۵۶۷۸۹'[digit.charCodeAt(0) - 0x0660]);
      }
      return output.replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    function loadImage(file) {
      if (typeof createImageBitmap === 'function') return createImageBitmap(file, { imageOrientation: 'from-image' });
      return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('بازکردن تصویر ناموفق بود.')); };
        image.src = url;
      });
    }

    async function prepareImage(file, mode) {
      const bitmap = await loadImage(file);
      const originalWidth = bitmap.width || bitmap.naturalWidth;
      const originalHeight = bitmap.height || bitmap.naturalHeight;
      const maxSide = 2500;
      const scale = Math.min(2, maxSide / Math.max(originalWidth, originalHeight));
      const width = Math.max(1, Math.round(originalWidth * scale));
      const height = Math.max(1, Math.round(originalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      if (bitmap.close) bitmap.close();

      const image = context.getImageData(0, 0, width, height);
      const data = image.data;
      const gray = new Uint8Array(width * height);
      const histogram = new Uint32Array(256);
      for (let pixel = 0, i = 0; pixel < gray.length; pixel++, i += 4) {
        const value = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        gray[pixel] = value;
        histogram[value]++;
      }

      // Percentile contrast stretch reduces gray paper/background noise.
      let low = 0, high = 255;
      const total = gray.length;
      const lowTarget = total * 0.015;
      const highTarget = total * 0.985;
      let cumulative = 0;
      for (let value = 0; value < 256; value++) {
        cumulative += histogram[value];
        if (cumulative >= lowTarget) { low = value; break; }
      }
      cumulative = 0;
      for (let value = 0; value < 256; value++) {
        cumulative += histogram[value];
        if (cumulative >= highTarget) { high = value; break; }
      }
      const range = Math.max(40, high - low);

      if (mode === 'adaptive') {
        // Local-mean thresholding handles uneven lighting better than one global threshold.
        // A bounded canvas size keeps memory use reasonable on older laptops.
        const stride = width + 1;
        const integral = new Float64Array((width + 1) * (height + 1));
        for (let y = 1; y <= height; y++) {
          let rowSum = 0;
          const sourceOffset = (y - 1) * width;
          const targetOffset = y * stride;
          const previousOffset = (y - 1) * stride;
          for (let x = 1; x <= width; x++) {
            rowSum += gray[sourceOffset + x - 1];
            integral[targetOffset + x] = integral[previousOffset + x] + rowSum;
          }
        }
        const radius = Math.max(12, Math.round(Math.min(width, height) * 0.012));
        for (let y = 0; y < height; y++) {
          const y1 = Math.max(0, y - radius), y2 = Math.min(height, y + radius + 1);
          for (let x = 0; x < width; x++) {
            const x1 = Math.max(0, x - radius), x2 = Math.min(width, x + radius + 1);
            const sum = integral[y2 * stride + x2] - integral[y1 * stride + x2] - integral[y2 * stride + x1] + integral[y1 * stride + x1];
            const mean = sum / ((x2 - x1) * (y2 - y1));
            const normalized = Math.max(0, Math.min(255, ((gray[y * width + x] - low) * 255) / range));
            const output = normalized > Math.max(0, ((mean - low) * 255) / range - 10) ? 255 : 0;
            const i = (y * width + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = output;
            data[i + 3] = 255;
          }
        }
      } else {
        for (let pixel = 0, i = 0; pixel < gray.length; pixel++, i += 4) {
          const value = Math.max(0, Math.min(255, Math.round(((gray[pixel] - low) * 255) / range)));
          data[i] = data[i + 1] = data[i + 2] = value;
          data[i + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
      return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('آماده‌سازی تصویر ناموفق بود.')), 'image/png'));
    }

    function setResultText(text) {
      ui.emptyOutput.hidden = !!text;
      ui.resultText.hidden = !text;
      ui.resultText.value = text || '';
      const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
      ui.resultStats.textContent = `${digitsFa(words)} کلمه`;
      ui.copyButton.disabled = !text.trim();
      ui.downloadButton.disabled = !text.trim();
    }

    function showCandidate(index) {
      const candidate = state.alternatives[index];
      if (!candidate) return;
      state.activeResult = index;
      setResultText(candidate.text);
      ui.confidenceBadge.textContent = Number.isFinite(candidate.confidence)
        ? `اطمینان موتور: ${digitsFa(Math.round(candidate.confidence))}٪`
        : 'اطمینان موتور: —';
      ui.resultSource.textContent = candidate.label;
      if (state.alternatives.length > 1) {
        ui.alternativeRow.hidden = false;
        ui.showAlternativeButton.textContent = index === 0 ? 'نمایش نتیجهٔ دوم' : 'بازگشت به نتیجهٔ اول';
      } else ui.alternativeRow.hidden = true;
    }

    function addCandidate(data, label) {
      const text = normalizeText(data && data.text);
      if (!text) return null;
      return {
        text,
        confidence: Number.isFinite(data.confidence) ? data.confidence : 0,
        label
      };
    }

    async function recognizeOnce(worker, blob, psm, label) {
      const params = {
        tessedit_pageseg_mode: String(psm),
        preserve_interword_spaces: '1',
        user_defined_dpi: '300'

      };
      await worker.setParameters(params);
      const result = await worker.recognize(blob);
      return addCandidate(result.data, label);
    }

    async function runOCR() {
      if (!state.file || state.busy) return;
      setBusy(true);
      setProgress('آماده‌سازی OCR…', 2, 'در اولین اجرا، موتور و مدل فشردهٔ زبان انتخاب‌شده دریافت می‌شود.');
      ui.engineBadge.textContent = 'در حال آماده‌سازی…';
      state.alternatives = [];
      ui.alternativeRow.hidden = true;
      setResultText('');
      ui.confidenceBadge.textContent = 'اطمینان موتور: در حال سنجش…';
      const started = performance.now();
      try {
        if (!state.swReady && location.protocol !== 'file:') {
          await ensureServiceWorker();
        }
        if (!navigator.onLine && !state.swReady) {
          throw new Error('این مرورگر هنوز منابع OCR را برای آفلاین ذخیره نکرده است. یک بار با اینترنت، روی «آماده‌سازی برای استفاده آفلاین» بزن.');
        }
        const worker = await getWorker();
        const firstBlob = await prepareImage(state.file, 'contrast');
        setProgress('بررسی اول: تصویر با کنتراست تقویت‌شده', 46, 'خواندن متن چاپی با مدل فشردهٔ best-int با دقت نزدیک به Best.');
        const first = await recognizeOnce(worker, firstBlob, 6, 'کنتراست بیشتر · چیدمان بلوکی');
        let second = null;
        if (ui.accuracyMode.value === 'smart') {
          const secondBlob = await prepareImage(state.file, 'adaptive');
          setProgress('بررسی دوم: حذف سایه و زمینهٔ ناهموار', 70, 'یک بار دیگر متن با آستانه‌گذاری محلی خوانده می‌شود.');
          second = await recognizeOnce(worker, secondBlob, 11, 'سیاه‌وسفید هوشمند · متن پراکنده');
        }
        const candidates = [first, second].filter(Boolean);
        candidates.sort((a, b) => b.confidence - a.confidence);
        state.alternatives = candidates;
        if (!candidates.length) {
          setResultText('');
          ui.confidenceBadge.textContent = 'متنی شناسایی نشد';
          setProgress('متنی پیدا نشد', 100, 'تصویر واضح‌تر، بزرگ‌تر یا با نور بهتر را امتحان کن.');
          setBadge(ui.engineBadge, 'موتور آماده است', 'good');
          return;
        }
        showCandidate(0);
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        const selected = candidates[0];
        const confidenceNote = selected.confidence < 60 ? ' اطمینان پایین است؛ متن را حتماً بازبینی کن.' : ' متن را بازبینی کن، مخصوصاً شماره‌ها و مبلغ‌ها.';
        setProgress('استخراج تمام شد ✓', 100, `زمان: ${digitsFa(seconds)} ثانیه · ${selected.label}.${confidenceNote}`);
        setBadge(ui.engineBadge, 'موتور آماده است', 'good');
        toast('استخراج انجام شد.');
      } catch (error) {
        console.error(error);
        const message = error && error.message ? error.message : String(error);
        setProgress('استخراج ناموفق بود', 0, message);
        setBadge(ui.engineBadge, 'خطا در موتور OCR', 'bad');
        ui.confidenceBadge.textContent = 'اطمینان موتور: —';
        toast('OCR اجرا نشد؛ جزئیات خطا زیر نوار پیشرفت آمده است.');
      } finally {
        setBusy(false);
      }
    }

    async function prepareOffline() {
      if (state.busy) return;
      setBusy(true);
      try {
        const language = selectedLanguage();
        const selected = language === 'fas+eng' ? ['fas', 'eng'] : [language];
        if (!isNativeApp()) {
          if (location.protocol === 'file:') {
            throw new Error('برای ذخیره‌سازی آفلاین، سایت باید روی HTTPS یا localhost اجرا شود؛ بازکردن مستقیم فایل کافی نیست.');
          }
          setProgress('فعال‌سازی ذخیره‌سازی آفلاین…', 5, 'در حال آماده‌سازی Service Worker.');
          const ready = await ensureServiceWorker();
          if (!ready) throw new Error('مرورگر هنوز صفحه را تحت کنترل Service Worker قرار نداده است. صفحه را تازه‌سازی کن و دوباره تلاش کن.');
        } else {
          setProgress('بررسی فایل‌های همراه برنامه…', 8, 'در نسخهٔ APK منابع OCR باید داخل خود برنامه باشند.');
        }

        const simd = supportsWasmSimd();
        const core = simd ? 'core/tesseract-core-simd-lstm.wasm' : 'core/tesseract-core-lstm.wasm';
        const coreJs = `${core}.js`;
        const resources = ['tesseract.min.js', 'worker.min.js', coreJs, core, ...selected.map(code => `lang/${code}.traineddata.gz`)];
        setProgress('ذخیرهٔ موتور و مدل‌ها…', 12, `در حال بررسی ${digitsFa(resources.length)} فایل موردنیاز.`);

        if (!isNativeApp()) {
          for (let index = 0; index < resources.length; index++) {
            const path = resources[index];
            const url = runtimeAsset(path);
            const response = await fetch(url, { cache: 'reload' });
            if (!response.ok) throw new Error(`دریافت ${path} ناموفق بود (HTTP ${response.status}). اتصال یا دسترسی به CDN را بررسی کن.`);
            const cache = await caches.open(ASSET_CACHE);
            const cached = await cache.match(url);
            if (!cached) throw new Error(`فایل ${path} دریافت شد اما در حافظهٔ آفلاین ذخیره نشد.`);
            setProgress('ذخیرهٔ موتور و مدل‌ها…', 12 + ((index + 1) / resources.length) * 58, `ذخیره شد: ${path}`);
          }
        } else {
          for (let index = 0; index < resources.length; index++) {
            const path = resources[index];
            const response = await fetch(bundledRuntimeAsset(path));
            if (!response.ok) throw new Error(`فایل همراه برنامه پیدا نشد: ${path}. این APK مدل OCR را در خود ندارد؛ نسخهٔ جدید را از Artifact آخرین اجرای موفق GitHub Actions نصب کن.`);
            setProgress('بررسی فایل‌های همراه برنامه…', 12 + ((index + 1) / resources.length) * 58, `بررسی شد: ${path}`);
          }
        }

        setProgress('آزمایش اجرای موتور…', 76, 'در حال راه‌اندازی واقعی OCR با زبان انتخاب‌شده.');
        const worker = await getWorker();
        await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
        state.offlineReady = true;
        const languageLabel = language === 'fas+eng' ? 'فارسی و انگلیسی' : language === 'fas' ? 'فارسی' : 'انگلیسی';
        ui.offlineStatus.textContent = `آماده شد ✓ فایل‌های موتور و مدل ${languageLabel} ${isNativeApp() ? 'داخل برنامه موجودند' : 'در حافظهٔ همین مرورگر ذخیره شدند'}.`;
        setProgress('آمادهٔ استفاده آفلاین ✓', 100, 'منابع لازم بررسی و موتور OCR با موفقیت راه‌اندازی شد.');
        toast('آماده‌سازی آفلاین کامل شد.');
      } catch (error) {
        console.error(error);
        ui.offlineStatus.textContent = error.message || String(error);
        setProgress('آماده‌سازی کامل نشد', 0, error.message || String(error));
        toast('آماده‌سازی آفلاین ناموفق بود؛ جزئیات نمایش داده شده است.');
      } finally {
        setBusy(false);
      }
    }

    function setFile(file) {
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast('لطفاً یک فایل تصویری انتخاب کن.'); return; }
      if (file.size > 20 * 1024 * 1024) { toast('حجم تصویر باید کمتر از ۲۰ مگابایت باشد.'); return; }
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.file = file;
      state.previewUrl = URL.createObjectURL(file);
      ui.previewImage.src = state.previewUrl;
      ui.imageName.textContent = file.name;
      ui.previewImage.onload = () => { ui.imageDimensions.textContent = `${digitsFa(ui.previewImage.naturalWidth)} × ${digitsFa(ui.previewImage.naturalHeight)}`; };
      ui.emptyState.hidden = true;
      ui.previewWrap.hidden = false;
      ui.runButton.disabled = false;
      ui.clearButton.disabled = false;
      ui.progressArea.hidden = true;
      toast('تصویر آمادهٔ پردازش است.');
    }

    function clearImage() {
      state.file = null;
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = null;
      ui.fileInput.value = '';
      ui.previewImage.removeAttribute('src');
      ui.previewWrap.hidden = true;
      ui.emptyState.hidden = false;
      ui.runButton.disabled = true;
      ui.clearButton.disabled = true;
      ui.progressArea.hidden = true;
      state.alternatives = [];
      ui.alternativeRow.hidden = true;
      setResultText('');
      ui.confidenceBadge.textContent = 'اطمینان موتور: —';
      ui.resultSource.textContent = '';
    }

    async function copyResult() {
      const text = ui.resultText.value;
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
        toast('متن کپی شد.');
      } catch (_) {
        ui.resultText.focus();
        ui.resultText.select();
        const success = document.execCommand('copy');
        toast(success ? 'متن کپی شد.' : 'متن را انتخاب و دستی کپی کن.');
      }
    }

    function downloadResult() {
      const text = ui.resultText.value;
      if (!text.trim()) return;
      const blob = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'OCR-Text.txt';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function bindEvents() {
      ui.chooseButton.addEventListener('click', event => { event.stopPropagation(); ui.fileInput.click(); });
      ui.dropZone.addEventListener('click', () => { if (!state.file) ui.fileInput.click(); });
      ui.dropZone.addEventListener('keydown', event => {
        if (!state.file && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); ui.fileInput.click(); }
      });
      ui.fileInput.addEventListener('change', event => setFile(event.target.files && event.target.files[0]));
      ['dragenter', 'dragover'].forEach(name => ui.dropZone.addEventListener(name, event => { event.preventDefault(); ui.dropZone.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(name => ui.dropZone.addEventListener(name, event => { event.preventDefault(); ui.dropZone.classList.remove('over'); }));
      ui.dropZone.addEventListener('drop', event => {
        const file = Array.from(event.dataTransfer && event.dataTransfer.files || []).find(item => item.type.startsWith('image/'));
        setFile(file);
      });
      document.addEventListener('paste', event => {
        const item = Array.from(event.clipboardData && event.clipboardData.items || []).find(entry => entry.type.startsWith('image/'));
        if (item) setFile(item.getAsFile());
      });
      ui.runButton.addEventListener('click', runOCR);
      ui.prepareButton.addEventListener('click', prepareOffline);
      ui.clearButton.addEventListener('click', clearImage);
      ui.copyButton.addEventListener('click', copyResult);
      ui.downloadButton.addEventListener('click', downloadResult);
      ui.showAlternativeButton.addEventListener('click', () => showCandidate(state.activeResult === 0 ? 1 : 0));
      ui.resultText.addEventListener('input', () => {
        const text = ui.resultText.value;
        const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
        ui.resultStats.textContent = `${digitsFa(words)} کلمه`;
        ui.copyButton.disabled = !text.trim();
        ui.downloadButton.disabled = !text.trim();
      });
      window.addEventListener('online', updateNetworkBadge);
      window.addEventListener('offline', updateNetworkBadge);
      window.addEventListener('beforeunload', () => {
        if (state.worker) state.worker.terminate();
        if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      });
    }

    async function boot() {
      bindEvents();
      updateNetworkBadge();
      setBadge(ui.engineBadge, 'برای شروع آماده است', 'neutral');
      if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
        ui.offlineStatus.textContent = 'در حال فعال‌کردن ذخیره‌سازی آفلاین…';
        ensureServiceWorker().catch(() => {});
      } else {
        ui.offlineStatus.textContent = 'برای استفادهٔ آفلاین، صفحه باید روی HTTPS یا localhost باشد. با بازکردن مستقیم فایل، فقط حالت آنلاین ممکن است.';
      }
    }

    boot();
  }

  startApp();
})();
