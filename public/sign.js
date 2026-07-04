/* global pdfjsLib, PDFLib */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const app = document.getElementById('app');
const modalRoot = document.getElementById('modalRoot');

const docId = location.pathname.split('/').filter(Boolean).pop();

let docData = null;
let signatures = {}; // fieldId -> dataURL (transparent PNG)
let pageWrappers = {}; // pageIndex -> wrapper element (for computing pixel rects)

init();

async function init() {
  try {
    const res = await fetch(`/api/public/documents/${docId}`);
    const data = await res.json();

    if (!res.ok || data.error === 'not_found') {
      renderMessage('This link doesn\'t look right', 'It may have been mistyped, or the document was removed. Please ask the sender for a new link.');
      return;
    }

    docData = data;

    if (data.status === 'signed') {
      renderMessage('Already signed ✅', 'This document has already been signed and sent back. If that seems wrong, contact the sender.');
      return;
    }

    renderDocument();
  } catch (err) {
    console.error(err);
    renderMessage('Something went wrong', 'Please check your connection and try reloading the page.');
  }
}

function renderMessage(title, body) {
  app.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'center-note';
  const h = document.createElement('h2');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = body;
  div.appendChild(h);
  div.appendChild(p);
  app.appendChild(div);
}

async function renderDocument() {
  app.innerHTML = '';

  const introCard = document.createElement('div');
  introCard.className = 'card';
  const h = document.createElement('h2');
  h.style.marginTop = '0';
  h.textContent = docData.senderName
    ? `${docData.senderName} has asked you to sign a document`
    : 'You\'ve been asked to sign a document';
  introCard.appendChild(h);

  if (docData.message) {
    const p = document.createElement('p');
    p.style.whiteSpace = 'pre-wrap';
    p.textContent = docData.message;
    introCard.appendChild(p);
  }
  const hint = document.createElement('p');
  hint.className = 'muted';
  hint.textContent = 'Tap each highlighted box below to add your signature. When you\'re done, tap "Complete & Send Back".';
  introCard.appendChild(hint);
  app.appendChild(introCard);

  const pagesCard = document.createElement('div');
  pagesCard.className = 'card';
  app.appendChild(pagesCard);

  const fieldsByPage = {};
  for (const f of docData.fields) {
    (fieldsByPage[f.page] = fieldsByPage[f.page] || []).push(f);
  }

  if (docData.fileType === 'pdf') {
    const bytes = base64ToArrayBuffer(docData.fileBase64);
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    for (let i = 0; i < pdf.numPages; i++) {
      const page = await pdf.getPage(i + 1);
      const viewport = page.getViewport({ scale: 1 });
      const targetWidth = Math.min(680, window.innerWidth - 48);
      const scale = targetWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      addPageToDom(pagesCard, i, canvas, fieldsByPage[i] || []);
    }
  } else {
    const bytes = base64ToArrayBuffer(docData.fileBase64);
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((resolve) => { img.onload = resolve; img.src = url; });
    const canvas = document.createElement('canvas');
    const targetWidth = Math.min(680, window.innerWidth - 48);
    const scale = targetWidth / img.width;
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    addPageToDom(pagesCard, 0, canvas, fieldsByPage[0] || []);
  }

  const submitCard = document.createElement('div');
  submitCard.className = 'card';
  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn block';
  submitBtn.id = 'completeBtn';
  submitBtn.textContent = `Complete & Send Back (0/${docData.fields.length} signed)`;
  submitBtn.disabled = true;
  submitBtn.addEventListener('click', completeSigning);
  submitCard.appendChild(submitBtn);
  const err = document.createElement('p');
  err.className = 'muted';
  err.style.color = '#dc2626';
  err.style.display = 'none';
  err.id = 'completeError';
  submitCard.appendChild(err);
  app.appendChild(submitCard);
}

function addPageToDom(container, pageIndex, canvas, fields) {
  const block = document.createElement('div');
  block.className = 'page-block';
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.appendChild(canvas);
  block.appendChild(wrapper);
  container.appendChild(block);
  pageWrappers[pageIndex] = wrapper;

  for (const field of fields) {
    const target = document.createElement('div');
    target.className = 'tap-target';
    target.style.left = field.xRatio * 100 + '%';
    target.style.top = field.yRatio * 100 + '%';
    target.style.width = field.wRatio * 100 + '%';
    target.style.height = field.hRatio * 100 + '%';
    target.textContent = '✍️ Tap to Sign';
    target.dataset.fieldId = field.id;
    target.addEventListener('click', () => openSignatureModal(field, target));
    wrapper.appendChild(target);
  }
}

function updateCompleteButton() {
  const total = docData.fields.length;
  const signed = Object.keys(signatures).length;
  const btn = document.getElementById('completeBtn');
  btn.textContent = `Complete & Send Back (${signed}/${total} signed)`;
  btn.disabled = signed < total;
}

function openSignatureModal(field, targetEl) {
  modalRoot.innerHTML = '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const title = document.createElement('h3');
  title.style.marginTop = '0';
  title.textContent = 'Add your signature';
  modal.appendChild(title);

  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  const drawTab = document.createElement('button');
  drawTab.className = 'tab-btn active';
  drawTab.textContent = '✍️ Draw';
  const typeTab = document.createElement('button');
  typeTab.className = 'tab-btn';
  typeTab.textContent = '⌨️ Type';
  tabs.appendChild(drawTab);
  tabs.appendChild(typeTab);
  modal.appendChild(tabs);

  const drawPane = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.id = 'sigPad';
  drawPane.appendChild(canvas);
  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn secondary small';
  clearBtn.style.marginTop = '10px';
  clearBtn.textContent = 'Clear';
  drawPane.appendChild(clearBtn);

  const typePane = document.createElement('div');
  typePane.style.display = 'none';
  const typeInput = document.createElement('input');
  typeInput.type = 'text';
  typeInput.placeholder = 'Type your full name';
  typePane.appendChild(typeInput);
  const typePreview = document.createElement('canvas');
  typePreview.width = 640;
  typePreview.height = 160;
  typePreview.style.width = '100%';
  typePreview.style.height = '140px';
  typePreview.style.border = '2px dashed #e5e7eb';
  typePreview.style.borderRadius = '12px';
  typePreview.style.background = '#fff';
  typePane.appendChild(typePreview);

  modal.appendChild(drawPane);
  modal.appendChild(typePane);

  drawTab.addEventListener('click', () => {
    drawTab.classList.add('active');
    typeTab.classList.remove('active');
    drawPane.style.display = 'block';
    typePane.style.display = 'none';
  });
  typeTab.addEventListener('click', () => {
    typeTab.classList.add('active');
    drawTab.classList.remove('active');
    typePane.style.display = 'block';
    drawPane.style.display = 'none';
    drawTypedPreview();
  });
  typeInput.addEventListener('input', drawTypedPreview);

  function drawTypedPreview() {
    const ctx = typePreview.getContext('2d');
    ctx.clearRect(0, 0, typePreview.width, typePreview.height);
    ctx.fillStyle = '#1a3a6b';
    ctx.font = "70px 'Dancing Script', cursive";
    ctx.textBaseline = 'middle';
    ctx.fillText(typeInput.value || '', 16, typePreview.height / 2 + 10);
  }

  if (document.fonts && document.fonts.load) {
    document.fonts.load("70px 'Dancing Script'").then(drawTypedPreview).catch(() => {});
  }

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Use This Signature';
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  modalRoot.appendChild(overlay);

  // --- drawing pad setup ---
  const ctx = canvas.getContext('2d');
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1a3a6b';
  }
  requestAnimationFrame(fitCanvas);

  let drawing = false;
  let last = null;
  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect();
    last = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const r = canvas.getBoundingClientRect();
    const cur = { x: e.clientX - r.left, y: e.clientY - r.top };
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
    last = cur;
  });
  window.addEventListener('pointerup', () => { drawing = false; });

  clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });

  function closeModal() {
    modalRoot.innerHTML = '';
  }

  saveBtn.addEventListener('click', () => {
    let dataUrl;
    if (typePane.style.display !== 'none') {
      if (!typeInput.value.trim()) {
        alert('Please type your name.');
        return;
      }
      dataUrl = typePreview.toDataURL('image/png');
    } else {
      dataUrl = canvas.toDataURL('image/png');
    }
    signatures[field.id] = dataUrl;
    targetEl.classList.add('signed');
    targetEl.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'sig-preview';
    img.src = dataUrl;
    targetEl.appendChild(img);
    updateCompleteButton();
    closeModal();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
}

async function completeSigning() {
  const btn = document.getElementById('completeBtn');
  const errEl = document.getElementById('completeError');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    let signedFileBase64, signedFileName;

    if (docData.fileType === 'pdf') {
      const bytes = base64ToArrayBuffer(docData.fileBase64);
      const pdfDoc = await PDFLib.PDFDocument.load(bytes);
      for (const field of docData.fields) {
        const dataUrl = signatures[field.id];
        const pngBytes = base64ToArrayBuffer(dataUrl.split(',')[1]);
        const pngImage = await pdfDoc.embedPng(pngBytes);
        const page = pdfDoc.getPage(field.page);
        const { width, height } = page.getSize();
        const boxW = field.wRatio * width;
        const boxH = field.hRatio * height;
        const x = field.xRatio * width;
        const y = height - field.yRatio * height - boxH;
        page.drawImage(pngImage, { x, y, width: boxW, height: boxH });
      }
      const outBytes = await pdfDoc.save();
      signedFileBase64 = arrayBufferToBase64(outBytes);
      signedFileName = `${docData.originalFilename}-signed.pdf`;
    } else {
      const bytes = base64ToArrayBuffer(docData.fileBase64);
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve) => { img.onload = resolve; img.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      for (const field of docData.fields) {
        const dataUrl = signatures[field.id];
        const sigImg = new Image();
        await new Promise((resolve) => { sigImg.onload = resolve; sigImg.src = dataUrl; });
        ctx.drawImage(
          sigImg,
          field.xRatio * canvas.width,
          field.yRatio * canvas.height,
          field.wRatio * canvas.width,
          field.hRatio * canvas.height
        );
      }
      signedFileBase64 = canvas.toDataURL('image/png').split(',')[1];
      signedFileName = `${docData.originalFilename}-signed.png`;
    }

    const res = await fetch(`/api/public/documents/${docId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedFileBase64, signedFileName }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit');
    }

    showSuccess(signedFileBase64, signedFileName, docData.fileType);
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Something went wrong submitting your signature. Please try again.';
    errEl.style.display = 'block';
    btn.disabled = false;
    updateCompleteButton();
  }
}

function showSuccess(signedFileBase64, signedFileName, fileType) {
  app.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  const h = document.createElement('h2');
  h.style.marginTop = '0';
  h.textContent = '✅ Signed and sent back!';
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = docData.senderName
    ? `${docData.senderName} has been notified. You can keep a copy for your records below.`
    : 'The sender has been notified. You can keep a copy for your records below.';
  card.appendChild(h);
  card.appendChild(p);

  const mime = fileType === 'pdf' ? 'application/pdf' : 'image/png';
  const bytes = base64ToArrayBuffer(signedFileBase64);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);

  const dlBtn = document.createElement('a');
  dlBtn.className = 'btn block';
  dlBtn.href = url;
  dlBtn.download = signedFileName;
  dlBtn.textContent = 'Download my copy';
  card.appendChild(dlBtn);

  if (navigator.canShare) {
    const file = new File([blob], signedFileName, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      const shareBtn = document.createElement('button');
      shareBtn.className = 'btn secondary block';
      shareBtn.style.marginTop = '10px';
      shareBtn.textContent = 'Share a copy…';
      shareBtn.addEventListener('click', () => {
        navigator.share({ files: [file], title: signedFileName }).catch(() => {});
      });
      card.appendChild(shareBtn);
    }
  }

  app.appendChild(card);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
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
