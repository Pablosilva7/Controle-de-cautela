import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("keys.db");

// Initialize Database
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'available',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crqs (
      id TEXT PRIMARY KEY,
      technician TEXT NOT NULL,
      technician_phone TEXT,
      company TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crq_keys (
      crq_id TEXT NOT NULL,
      key_id TEXT NOT NULL,
      PRIMARY KEY (crq_id, key_id),
      FOREIGN KEY (crq_id) REFERENCES crqs(id),
      FOREIGN KEY (key_id) REFERENCES keys(id)
    );

    CREATE TABLE IF NOT EXISTS movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id TEXT NOT NULL,
      technician_name TEXT NOT NULL,
      company TEXT NOT NULL,
      crq TEXT NOT NULL,
      checkout_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      checkin_time DATETIME,
      expected_return DATETIME,
      FOREIGN KEY (key_id) REFERENCES keys(id)
    );
  `);
} catch (err) {
  console.error("Database initialization error:", err);
}

// Migration: Handle schema changes for existing databases
try {
  // Movements table migrations
  const movementColumns = db.prepare("PRAGMA table_info(movements)").all() as any[];
  const movementColumnNames = movementColumns.map(c => c.name);
  
  if (movementColumnNames.length > 0) {
    if (movementColumnNames.includes('user_name') && !movementColumnNames.includes('technician_name')) {
      db.exec("ALTER TABLE movements RENAME COLUMN user_name TO technician_name");
      console.log("Migrated user_name to technician_name");
    }
    if (!movementColumnNames.includes('company')) {
      db.exec("ALTER TABLE movements ADD COLUMN company TEXT DEFAULT ''");
      console.log("Added company column to movements");
    }
    if (!movementColumnNames.includes('crq')) {
      db.exec("ALTER TABLE movements ADD COLUMN crq TEXT DEFAULT ''");
      console.log("Added crq column to movements");
    }
  }

  // CRQ table migrations
  const crqColumns = db.prepare("PRAGMA table_info(crqs)").all() as any[];
  const crqColumnNames = crqColumns.map(c => c.name);
  
  if (crqColumnNames.length > 0) {
    if (!crqColumnNames.includes('technician_phone')) {
      db.exec("ALTER TABLE crqs ADD COLUMN technician_phone TEXT");
      console.log("Added technician_phone column to crqs");
    }
    if (!crqColumnNames.includes('status')) {
      db.exec("ALTER TABLE crqs ADD COLUMN status TEXT DEFAULT 'open'");
      console.log("Added status column to crqs");
    }
  }
} catch (err) {
  console.error("Migration error:", err);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  
  // Get all keys
  app.get("/api/keys", (req, res) => {
    const keys = db.prepare("SELECT * FROM keys").all();
    res.json(keys);
  });

  // Add new key
  app.post("/api/keys", (req, res) => {
    const { id, name } = req.body;
    try {
      db.prepare("INSERT INTO keys (id, name) VALUES (?, ?)").run(id, name);
      res.status(201).json({ success: true });
    } catch (err) {
      console.error("Add key error:", err);
      res.status(400).json({ error: "Key ID already exists or invalid data" });
    }
  });

  // Update existing key
  app.put("/api/keys/:id", (req, res) => {
    const { id: oldId } = req.params;
    const { id: newId, name } = req.body;
    
    try {
      const transaction = db.transaction(() => {
        if (newId !== oldId) {
          const existing = db.prepare("SELECT id FROM keys WHERE id = ?").get(newId);
          if (existing) {
            throw new Error("New ID already exists");
          }
          db.prepare("UPDATE movements SET key_id = ? WHERE key_id = ?").run(newId, oldId);
          db.prepare("UPDATE crq_keys SET key_id = ? WHERE key_id = ?").run(newId, oldId);
        }
        db.prepare("UPDATE keys SET id = ?, name = ? WHERE id = ?").run(newId, name, oldId);
      });
      transaction();
      res.json({ success: true });
    } catch (err: any) {
      console.error("Update error:", err);
      res.status(400).json({ error: err.message || "Failed to update key" });
    }
  });

  // CRQ Endpoints
  app.get("/api/crqs", (req, res) => {
    const crqs = db.prepare("SELECT * FROM crqs ORDER BY created_at DESC").all();
    res.json(crqs);
  });

  app.post("/api/crqs", (req, res) => {
    const { id, technician, technician_phone, company, keyIds } = req.body;
    try {
      const transaction = db.transaction(() => {
        db.prepare("INSERT INTO crqs (id, technician, technician_phone, company) VALUES (?, ?, ?, ?)").run(id, technician, technician_phone, company);
        const insertKey = db.prepare("INSERT INTO crq_keys (crq_id, key_id) VALUES (?, ?)");
        const updateKeyStatus = db.prepare("UPDATE keys SET status = 'in_field' WHERE id = ?");
        for (const keyId of keyIds) {
          insertKey.run(id, keyId);
          updateKeyStatus.run(keyId);
        }
      });
      transaction();
      res.status(201).json({ success: true });
    } catch (err: any) {
      console.error("Create CRQ error:", err);
      res.status(400).json({ error: err.message || "Failed to create CRQ" });
    }
  });

  app.get("/api/crqs/:id", (req, res) => {
    const { id } = req.params;
    const crq = db.prepare("SELECT * FROM crqs WHERE id = ?").get(id);
    if (!crq) return res.status(404).json({ error: "CRQ not found" });
    
    const keys = db.prepare(`
      SELECT k.* 
      FROM keys k 
      JOIN crq_keys ck ON k.id = ck.key_id 
      WHERE ck.crq_id = ?
    `).all(id);
    
    res.json({ ...crq, keys });
  });

  app.post("/api/crqs/:id/close", (req, res) => {
    const { id } = req.params;
    try {
      const transaction = db.transaction(() => {
        // Update CRQ status
        db.prepare("UPDATE crqs SET status = 'closed' WHERE id = ?").run(id);
        
        // Find all keys associated with this CRQ
        const keys = db.prepare("SELECT key_id FROM crq_keys WHERE crq_id = ?").all(id) as { key_id: string }[];
        
        // Update each key to available
        const updateKey = db.prepare("UPDATE keys SET status = 'available' WHERE id = ?");
        for (const k of keys) {
          updateKey.run(k.key_id);
        }
      });
      transaction();
      res.json({ success: true });
    } catch (err: any) {
      console.error("Close CRQ error:", err);
      res.status(400).json({ error: err.message || "Failed to close CRQ" });
    }
  });

  // Key Check-out
  app.post("/api/checkout", (req, res) => {
    const { key_id, technician_name, company, crq, expected_return } = req.body;
    const transaction = db.transaction(() => {
      db.prepare("UPDATE keys SET status = 'in_field' WHERE id = ?").run(key_id);
      db.prepare("INSERT INTO movements (key_id, technician_name, company, crq, expected_return) VALUES (?, ?, ?, ?, ?)").run(key_id, technician_name, company, crq, expected_return);
    });
    transaction();
    res.json({ success: true });
  });

  // Key Check-in
  app.post("/api/checkin", (req, res) => {
    const { key_id } = req.body;
    const transaction = db.transaction(() => {
      db.prepare("UPDATE keys SET status = 'available' WHERE id = ?").run(key_id);
      db.prepare("UPDATE movements SET checkin_time = CURRENT_TIMESTAMP WHERE key_id = ? AND checkin_time IS NULL").run(key_id);
    });
    transaction();
    res.json({ success: true });
  });

  // Get Movements History
  app.get("/api/movements", (req, res) => {
    const movements = db.prepare(`
      SELECT m.*, k.name as key_name 
      FROM movements m 
      JOIN keys k ON m.key_id = k.id 
      ORDER BY m.checkout_time DESC
    `).all();
    res.json(movements);
  });

  // Dashboard Stats
  app.get("/api/stats", (req, res) => {
    const totalKeys = db.prepare("SELECT COUNT(*) as count FROM keys").get() as any;
    const inField = db.prepare("SELECT COUNT(*) as count FROM keys WHERE status = 'in_field'").get() as any;
    const available = db.prepare("SELECT COUNT(*) as count FROM keys WHERE status = 'available'").get() as any;
    const totalCrqs = db.prepare("SELECT COUNT(*) as count FROM crqs").get() as any;
    const overdue = db.prepare(`
      SELECT COUNT(*) as count 
      FROM movements 
      WHERE checkin_time IS NULL 
      AND expected_return < CURRENT_TIMESTAMP
    `).get() as any;

    res.json({
      total: totalKeys.count,
      inField: inField.count,
      available: available.count,
      totalCrqs: totalCrqs.count,
      overdue: overdue.count
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
