const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const db = new Database('ivo.db');
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    pricing_mode TEXT DEFAULT 'klassisch',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER REFERENCES bookings(id),
    started_at DATETIME,
    ended_at DATETIME,
    duration_minutes INTEGER,
    final_price_cents INTEGER,
    roulette_result TEXT,
    invoice_number TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT 1
  );
`);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Pricing algorithms
const pricing = {
  klassisch: (minutes) => {
    if (minutes <= 30) return 10000; // €100.00 in cents
    if (minutes <= 60) return 15000;
    if (minutes <= 120) return 22000;
    if (minutes <= 180) return 33000;
    if (minutes <= 240) return 42000;
    if (minutes <= 300) return 50000;
    return 58000; // max 6h
  },

  vertrauen: (minutes) => {
    if (minutes <= 180) return 30000; // €300 for up to 3h
    return 50000; // €500 for up to 6h
  },

  roulette: (minutes) => {
    const roll = Math.random() * 100;
    let multiplier;
    let category;

    if (roll < 70) {
      multiplier = 0.8 + Math.random() * 0.7; // 80-150%
      category = 'günstig';
    } else if (roll < 95) {
      multiplier = 2 + Math.random() * 2; // 200-400%
      category = 'fair';
    } else if (roll < 99) {
      multiplier = 0.5; // Jackpot: 50%
      category = 'jackpot';
    } else {
      return { price: 100000, category: 'der eine Prozent' }; // €1000 fixed
    }

    const basePrice = pricing.klassisch(minutes);
    return {
      price: Math.round(basePrice * multiplier),
      category
    };
  }
};

// Calculate price for given duration and mode
app.post('/api/calculate-price', (req, res) => {
  const { minutes, mode = 'klassisch' } = req.body;

  if (mode === 'roulette') {
    const result = pricing.roulette(minutes);
    res.json({
      price: result.price / 100,
      category: result.category,
      mode: 'roulette'
    });
  } else {
    const price = pricing[mode](minutes);
    res.json({
      price: price / 100,
      mode
    });
  }
});

// Get availability for a date range
app.get('/api/availability', (req, res) => {
  const { start, end } = req.query;
  const slots = db.prepare(`
    SELECT * FROM availability
    WHERE date BETWEEN ? AND ? AND is_available = 1
    ORDER BY date, start_time
  `).all(start, end);
  res.json(slots);
});

// Create a booking
app.post('/api/bookings', (req, res) => {
  const { client_name, client_email, client_phone, booking_date, start_time, pricing_mode } = req.body;

  const result = db.prepare(`
    INSERT INTO bookings (client_name, client_email, client_phone, booking_date, start_time, pricing_mode)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(client_name, client_email, client_phone, booking_date, start_time, pricing_mode);

  res.json({ id: result.lastInsertRowid, status: 'pending' });
});

// Start a session (for Ivo's app)
app.post('/api/sessions/start', (req, res) => {
  const { booking_id } = req.body;

  const result = db.prepare(`
    INSERT INTO sessions (booking_id, started_at)
    VALUES (?, datetime('now'))
  `).run(booking_id);

  res.json({ session_id: result.lastInsertRowid, started_at: new Date().toISOString() });
});

// Stop a session and calculate final price
app.post('/api/sessions/:id/stop', (req, res) => {
  const { id } = req.params;

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(session.booking_id);

  const startedAt = new Date(session.started_at);
  const endedAt = new Date();
  const durationMinutes = Math.ceil((endedAt - startedAt) / 60000);

  let finalPrice, rouletteResult = null;

  if (booking.pricing_mode === 'roulette') {
    const result = pricing.roulette(durationMinutes);
    finalPrice = result.price;
    rouletteResult = result.category;
  } else {
    finalPrice = pricing[booking.pricing_mode](durationMinutes);
  }

  const invoiceNumber = `IVO-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;

  db.prepare(`
    UPDATE sessions
    SET ended_at = datetime('now'),
        duration_minutes = ?,
        final_price_cents = ?,
        roulette_result = ?,
        invoice_number = ?
    WHERE id = ?
  `).run(durationMinutes, finalPrice, rouletteResult, invoiceNumber, id);

  res.json({
    session_id: id,
    duration_minutes: durationMinutes,
    final_price: finalPrice / 100,
    roulette_result: rouletteResult,
    invoice_number: invoiceNumber
  });
});

// Generate invoice PDF
app.get('/api/sessions/:id/invoice', (req, res) => {
  const { id } = req.params;

  const session = db.prepare(`
    SELECT s.*, b.client_name, b.client_email, b.booking_date, b.pricing_mode
    FROM sessions s
    JOIN bookings b ON s.booking_id = b.id
    WHERE s.id = ?
  `).get(id);

  if (!session) return res.status(404).json({ error: 'Session not found' });

  const doc = new PDFDocument({ margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${session.invoice_number}.pdf`);

  doc.pipe(res);

  // Header
  doc.fontSize(24).text('IVO', { align: 'right' });
  doc.fontSize(10).text('Aufmerksamkeit & Präsenz', { align: 'right' });
  doc.moveDown(2);

  // Invoice details
  doc.fontSize(16).text('RECHNUNG', { align: 'left' });
  doc.fontSize(10);
  doc.text(`Rechnungsnummer: ${session.invoice_number}`);
  doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`);
  doc.moveDown();

  // Client
  doc.text(`Kunde: ${session.client_name}`);
  if (session.client_email) doc.text(`E-Mail: ${session.client_email}`);
  doc.moveDown();

  // Service details
  doc.text('─'.repeat(50));
  doc.moveDown();
  doc.text(`Leistung: Persönliche Begleitung & Aufmerksamkeit`);
  doc.text(`Datum: ${session.booking_date}`);
  doc.text(`Dauer: ${session.duration_minutes} Minuten`);
  doc.text(`Tarifmodell: ${session.pricing_mode}`);
  if (session.roulette_result) {
    doc.text(`Roulette-Ergebnis: ${session.roulette_result}`);
  }
  doc.moveDown();
  doc.text('─'.repeat(50));
  doc.moveDown();

  // Total
  doc.fontSize(14).text(`Gesamtbetrag: €${(session.final_price_cents / 100).toFixed(2)}`, { align: 'right' });
  doc.fontSize(8).text('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', { align: 'right' });

  doc.moveDown(4);
  doc.fontSize(10).text('Zahlbar innerhalb von 14 Tagen.', { align: 'center' });

  doc.end();
});

// Serve the main app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
