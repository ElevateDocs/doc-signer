// Simple Document Signing App
// - You (the sender) prepare a document at /new and get a link
// - You send that link to your client any way you like (email, text, WhatsApp...)
// - Your client opens the link on their phone, signs, and it's submitted back automatically
// - You check /  (the dashboard) to see what's pending and download signed documents

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();

// Signed PDFs/images are base64 text, so allow reasonably large JSON bodies.
app.use(express.json({ limit: '20mb' }));

// ---------- Database ----------

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI environment variable. See .env.example / README.md.');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });

const fieldSchema = new mongoose.Schema(
  {
    id: String,
    page: Number, // 0-based index into the (already trimmed) document
    xRatio: Number,
    yRatio: Number,
    wRatio: Number,
    hRatio: Number,
    label: String,
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now },
  senderName: { type: String, default: '' },
  recipientLabel: { type: String, default: '' },
  message: { type: String, default: '' },
  originalFilename: String,
  fileType: { type: String, enum: ['pdf', 'image'], required: true },
  fileBase64: { type: String, required: true }, // the (already trimmed) document sent for signing
  fields: [fieldSchema],
  status: { type: String, enum: ['pending', 'signed'], default: 'pending' },
  signedAt: Date,
  signedFileBase64: String,
  signedFileName: String,
});

const Document = mongoose.model('Document', documentSchema);

// MongoDB caps a single document at 16MB, and we store the original AND the
// signed copy in the same record, so each one gets its own independent
// budget with headroom to spare (rather than one cap doubled, which could
// push the pair of them over the 16MB ceiling).
const MAX_FILE_BASE64_CHARS = 6 * 1024 * 1024; // ~4.5MB raw file
const MAX_SIGNED_BASE64_CHARS = 6 * 1024 * 1024; // ~4.5MB raw file

// ---------- Auth for your private pages (dashboard + "new document") ----------

const DASHBOARD_USER = process.env.DASHBOARD_USER || 'erold';
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'changeme123';

if (!process.env.DASHBOARD_PASSWORD) {
  console.warn(
    'WARNING: DASHBOARD_PASSWORD is not set - using an insecure default. Set it before sharing your app URL with anyone.'
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const sepIndex = decoded.indexOf(':');
    const user = decoded.slice(0, sepIndex);
    const pass = decoded.slice(sepIndex + 1);
    if (user === DASHBOARD_USER && pass === DASHBOARD_PASSWORD) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="Document Signer"');
  return res.status(401).send('Authentication required.');
}

// ---------- Private pages (yours only) ----------

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'private', 'dashboard.html'));
});

app.get('/new', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'private', 'new.html'));
});

app.use('/private-assets', requireAuth, express.static(path.join(__dirname, 'private')));

// ---------- Private API (yours only) ----------

// List all documents (without the heavy base64 payloads)
app.get('/api/documents', requireAuth, async (req, res) => {
  const docs = await Document.find(
    {},
    {
      fileBase64: 0,
      signedFileBase64: 0,
    }
  ).sort({ createdAt: -1 });
  res.json(docs);
});

// Download the signed file for one document
app.get('/api/documents/:id/signed-file', requireAuth, async (req, res) => {
  const doc = await Document.findById(req.params.id);
  if (!doc || doc.status !== 'signed') {
    return res.status(404).send('Not found');
  }
  const buffer = Buffer.from(doc.signedFileBase64, 'base64');
  res.setHeader('Content-Disposition', `attachment; filename="${doc.signedFileName}"`);
  res.setHeader(
    'Content-Type',
    doc.fileType === 'pdf' ? 'application/pdf' : 'image/png'
  );
  res.send(buffer);
});

// Create a new document to be signed
app.post('/api/documents', requireAuth, async (req, res) => {
  try {
    const {
      senderName,
      recipientLabel,
      message,
      originalFilename,
      fileType,
      fileBase64,
      fields,
    } = req.body;

    if (!fileBase64 || !fileType) {
      return res.status(400).json({ error: 'Missing document data.' });
    }
    if (fileBase64.length > MAX_FILE_BASE64_CHARS) {
      return res.status(400).json({
        error: 'That document is too large. Try sending fewer pages, or keep it under ~4-5MB.',
      });
    }
    if (!Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: 'Add at least one signature field.' });
    }

    const doc = await Document.create({
      senderName: senderName || '',
      recipientLabel: recipientLabel || '',
      message: message || '',
      originalFilename: originalFilename || 'document',
      fileType,
      fileBase64,
      fields,
    });

    res.json({ id: doc._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the document.' });
  }
});

// Delete a document from the dashboard
app.delete('/api/documents/:id', requireAuth, async (req, res) => {
  await Document.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ---------- Public signing page (your client uses this - no login) ----------

app.get('/sign/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sign.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Public API (your client's browser calls this) ----------

app.get('/api/public/documents/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not_found' });

    res.json({
      id: doc._id,
      senderName: doc.senderName,
      recipientLabel: doc.recipientLabel,
      message: doc.message,
      originalFilename: doc.originalFilename,
      fileType: doc.fileType,
      fileBase64: doc.status === 'pending' ? doc.fileBase64 : undefined,
      fields: doc.fields,
      status: doc.status,
    });
  } catch (err) {
    res.status(404).json({ error: 'not_found' });
  }
});

app.post('/api/public/documents/:id/complete', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not_found' });
    if (doc.status === 'signed') {
      return res.status(409).json({ error: 'already_signed' });
    }

    const { signedFileBase64, signedFileName } = req.body;
    if (!signedFileBase64) {
      return res.status(400).json({ error: 'Missing signed file.' });
    }
    if (signedFileBase64.length > MAX_SIGNED_BASE64_CHARS) {
      return res.status(400).json({ error: 'Signed file is too large.' });
    }

    doc.status = 'signed';
    doc.signedAt = new Date();
    doc.signedFileBase64 = signedFileBase64;
    doc.signedFileName = signedFileName || `${doc.originalFilename}-signed`;
    await doc.save();

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong submitting your signature.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Document Signer running on port ${PORT}`);
});
