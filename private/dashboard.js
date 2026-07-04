async function load() {
  const res = await fetch('/api/documents');
  if (!res.ok) return;
  const docs = await res.json();

  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  list.innerHTML = '';

  if (docs.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  for (const doc of docs) {
    const item = document.createElement('div');
    item.className = 'doc-item';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const fname = document.createElement('div');
    fname.className = 'fname';
    fname.textContent = doc.originalFilename + (doc.fileType === 'pdf' ? '.pdf' : '');
    const sub = document.createElement('div');
    sub.className = 'muted';
    const created = new Date(doc.createdAt).toLocaleString();
    const recipient = doc.recipientLabel ? ` · to ${doc.recipientLabel}` : '';
    sub.textContent = `${created}${recipient}`;
    meta.appendChild(fname);
    meta.appendChild(sub);

    const badge = document.createElement('span');
    badge.className = 'badge ' + (doc.status === 'signed' ? 'signed' : 'pending');
    badge.textContent = doc.status === 'signed' ? 'Signed' : 'Pending';
    meta.appendChild(document.createElement('br'));
    meta.appendChild(badge);
    if (doc.status === 'signed') {
      const signedSub = document.createElement('span');
      signedSub.className = 'muted';
      signedSub.style.marginLeft = '8px';
      signedSub.textContent = 'on ' + new Date(doc.signedAt).toLocaleString();
      meta.appendChild(signedSub);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (doc.status === 'signed') {
      const dl = document.createElement('a');
      dl.className = 'btn small';
      dl.href = `/api/documents/${doc._id}/signed-file`;
      dl.textContent = 'Download';
      actions.appendChild(dl);
    } else {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn small secondary';
      copyBtn.textContent = 'Copy link';
      copyBtn.addEventListener('click', () => {
        const link = `${location.origin}/sign/${doc._id}`;
        navigator.clipboard.writeText(link).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => (copyBtn.textContent = 'Copy link'), 1500);
        });
      });
      actions.appendChild(copyBtn);

      const openBtn = document.createElement('a');
      openBtn.className = 'btn small';
      openBtn.href = `/sign/${doc._id}`;
      openBtn.target = '_blank';
      openBtn.textContent = 'Open';
      actions.appendChild(openBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'btn small danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this document? This cannot be undone.')) return;
      await fetch(`/api/documents/${doc._id}`, { method: 'DELETE' });
      load();
    });
    actions.appendChild(delBtn);

    item.appendChild(meta);
    item.appendChild(actions);
    list.appendChild(item);
  }
}

load();
