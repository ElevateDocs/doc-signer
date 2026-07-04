/* global pdfjsLib, PDFLib */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const fileInput = document.getElementById('fileInput');
const setupFields = document.getElementById('setupFields');
const pagesCard = document.getElementById('pagesCard');
const pagesContainer = document.getElementById('pagesContainer');
const submitCard = document.getElementById('submitCard');
const submitBtn = document.getElementById('submitBtn');
const submitError = document.getElementById('submitError');
const successCard = document.getElementById('successCard');
const addFieldModeBtn = document.getElementById('addFieldModeBtn');

let originalFilename = '';
let fileType = null; // 'pdf' | 'image'
let originalArrayBuffer = null;
let pages = []; // { pageNumber (1-based), included, wrapperEl, widthPx, heightPx, fields: [{id, xRatio, yRatio, wRatio, hRatio}] }
let addFieldMode = false;
let fieldCounter = 0;

addFieldModeBtn.addEventListener('click', () => {
  addFieldMode = !addFieldMode;
  addFieldModeBtn.textContent = addFieldMode ? '✅ Tap a page to place a box' : '➕ Place signature box';
  addFieldModeBtn.classList.toggle('secondary', !addFieldMode);
});

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  originalFilename = file.name.replace(/\.[^/.]+$/, '');
  pages = [];
  pagesContainer.innerHTML = '';
  pagesCard.style.display = 'none';
  submitCard.style.display = 'none';
  successCard.style.display = 'none';

  if (file.type === 'application/pdf') {
    fileType = 'pdf';
    originalArrayBuffer = await file.arrayBuffer();
    await renderPdf(originalArrayBuffer.slice(0));
  } else if (file.type.startsWith('image/')) {
    fileType = 'image';
    originalArrayBuffer = await file.arrayBuffer();
    await renderImage(file);
  } else {
    alert('Please choose a PDF or an image (JPG/PNG).');
    return;
  }

  setupFields.style.display = 'block';
  pagesCard.style.display = 'block';
  submitCard.style.display = 'block';
});

async function renderPdf(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const targetWidth = 680;
    const scale = targetWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

    addPageBlock(i, canvas);
  }
}

async function renderImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((resolve) => {
    img.onload = resolve;
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  const targetWidth = 680;
  const scale = targetWidth / img.width;
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  addPageBlock(1, canvas);
}

function addPageBlock(pageNumber, canvas) {
  const block = document.createElement('div');
  block.className = 'page-block';

  const toolbar = document.createElement('div');
  toolbar.className = 'page-toolbar';

  const checkLabel = document.createElement('label');
  checkLabel.className = 'thumb-check';
  checkLabel.style.margin = '0';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = true;
  const pageState = { pageNumber, included: true, wrapperEl: null, widthPx: canvas.width, heightPx: canvas.height, fields: [] };
  check.addEventListener('change', () => {
    pageState.included = check.checked;
    wrapper.style.opacity = check.checked ? '1' : '0.35';
  });
  checkLabel.appendChild(check);
  checkLabel.appendChild(document.createTextNode(fileType === 'pdf' ? `Include page ${pageNumber}` : 'Include this image'));

  toolbar.appendChild(checkLabel);
  block.appendChild(toolbar);

  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.appendChild(canvas);
  pageState.wrapperEl = wrapper;
  block.appendChild(wrapper);

  wrapper.addEventListener('click', (evt) => {
    if (!addFieldMode) return;
    if (evt.target !== wrapper && evt.target !== canvas) return; // ignore clicks on existing boxes
    const rect = wrapper.getBoundingClientRect();
    const xRatio = (evt.clientX - rect.left) / rect.width;
    const yRatio = (evt.clientY - rect.top) / rect.height;
    const wRatio = 0.34;
    const hRatio = 0.09;
    const field = {
      id: 'f' + ++fieldCounter,
      xRatio: clamp(xRatio - wRatio / 2, 0, 1 - wRatio),
      yRatio: clamp(yRatio - hRatio / 2, 0, 1 - hRatio),
      wRatio,
      hRatio,
    };
    pageState.fields.push(field);
    renderFieldBox(wrapper, pageState, field);
  });

  pagesContainer.appendChild(block);
  pages.push(pageState);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function renderFieldBox(wrapper, pageState, field) {
  const box = document.createElement('div');
  box.className = 'field-box';
  box.textContent = 'Signature';
  positionBox(box, field);

  const removeX = document.createElement('div');
  removeX.className = 'remove-x';
  removeX.textContent = '×';
  removeX.addEventListener('click', (evt) => {
    evt.stopPropagation();
    pageState.fields = pageState.fields.filter((f) => f.id !== field.id);
    box.remove();
  });
  box.appendChild(removeX);

  let dragging = false;
  let startX, startY, startXRatio, startYRatio;

  box.addEventListener('pointerdown', (evt) => {
    if (evt.target === removeX) return;
    dragging = true;
    box.setPointerCapture(evt.pointerId);
    startX = evt.clientX;
    startY = evt.clientY;
    startXRatio = field.xRatio;
    startYRatio = field.yRatio;
    evt.stopPropagation();
  });
  box.addEventListener('pointermove', (evt) => {
    if (!dragging) return;
    const rect = wrapper.getBoundingClientRect();
    const dx = (evt.clientX - startX) / rect.width;
    const dy = (evt.clientY - startY) / rect.height;
    field.xRatio = clamp(startXRatio + dx, 0, 1 - field.wRatio);
    field.yRatio = clamp(startYRatio + dy, 0, 1 - field.hRatio);
    positionBox(box, field);
  });
  box.addEventListener('pointerup', () => { dragging = false; });
  box.addEventListener('pointercancel', () => { dragging = false; });

  wrapper.appendChild(box);
}

function positionBox(box, field) {
  box.style.left = field.xRatio * 100 + '%';
  box.style.top = field.yRatio * 100 + '%';
  box.style.width = field.wRatio * 100 + '%';
  box.style.height = field.hRatio * 100 + '%';
}

submitBtn.addEventListener('click', async () => {
  submitError.style.display = 'none';
  const includedPages = pages.filter((p) => p.included);
  if (includedPages.length === 0) {
    showError('Include at least one page.');
    return;
  }
  const totalFields = includedPages.reduce((sum, p) => sum + p.fields.length, 0);
  if (totalFields === 0) {
    showError('Add at least one signature box (tap "Place signature box", then tap on the page).');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Preparing…';

  try {
    let fileBase64, flatFields;

    if (fileType === 'pdf') {
      const srcDoc = await PDFLib.PDFDocument.load(originalArrayBuffer);
      const newDoc = await PDFLib.PDFDocument.create();
      flatFields = [];
      for (let newIndex = 0; newIndex < includedPages.length; newIndex++) {
        const p = includedPages[newIndex];
        const [copiedPage] = await newDoc.copyPages(srcDoc, [p.pageNumber - 1]);
        newDoc.addPage(copiedPage);
        for (const f of p.fields) {
          flatFields.push({ id: f.id, page: newIndex, xRatio: f.xRatio, yRatio: f.yRatio, wRatio: f.wRatio, hRatio: f.hRatio, label: 'Signature' });
        }
      }
      const bytes = await newDoc.save();
      fileBase64 = arrayBufferToBase64(bytes);
    } else {
      // Single image - already just one "page"
      flatFields = includedPages[0].fields.map((f) => ({
        id: f.id, page: 0, xRatio: f.xRatio, yRatio: f.yRatio, wRatio: f.wRatio, hRatio: f.hRatio, label: 'Signature',
      }));
      fileBase64 = arrayBufferToBase64(originalArrayBuffer);
    }

    const payload = {
      senderName: document.getElementById('senderName').value.trim(),
      recipientLabel: document.getElementById('recipientLabel').value.trim(),
      message: document.getElementById('message').value.trim(),
      originalFilename,
      fileType,
      fileBase64,
      fields: flatFields,
    };

    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Something went wrong.');
      return;
    }

    const link = `${location.origin}/sign/${data.id}`;
    document.getElementById('linkOutput').value = link;
    const emailBtn = document.getElementById('emailLinkBtn');
    const subject = encodeURIComponent(`Please sign: ${originalFilename}`);
    const body = encodeURIComponent(
      `Hi,\n\nPlease review and sign this document:\n${link}\n\nThanks!`
    );
    emailBtn.href = `mailto:?subject=${subject}&body=${body}`;

    submitCard.style.display = 'none';
    successCard.style.display = 'block';
  } catch (err) {
    console.error(err);
    showError('Something went wrong preparing the document.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Signing Link';
  }
});

document.getElementById('copyLinkBtn').addEventListener('click', () => {
  const input = document.getElementById('linkOutput');
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = document.getElementById('copyLinkBtn');
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => (btn.textContent = original), 1500);
  });
});

function showError(msg) {
  submitError.textContent = msg;
  submitError.style.display = 'block';
}

function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
