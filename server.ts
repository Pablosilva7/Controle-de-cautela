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
      crq TEXT,
      status TEXT DEFAULT 'available',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  const columns = db.prepare("PRAGMA table_info(movements)").all() as any[];
  const columnNames = columns.map(c => c.name);
  
  if (columnNames.length > 0) {
    if (columnNames.includes('user_name') && !columnNames.includes('technician_name')) {
      db.exec("ALTER TABLE movements RENAME COLUMN user_name TO technician_name");
      console.log("Migrated user_name to technician_name");
    }
    if (!columnNames.includes('company')) {
      db.exec("ALTER TABLE movements ADD COLUMN company TEXT DEFAULT ''");
      console.log("Added company column to movements");
    }
    if (!columnNames.includes('crq')) {
      db.exec("ALTER TABLE movements ADD COLUMN crq TEXT DEFAULT ''");
      console.log("Added crq column to movements");
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
    const { id, name, crq } = req.body;
    try {
      db.prepare("INSERT INTO keys (id, name, crq) VALUES (?, ?, ?)").run(id, name, crq);
      res.status(201).json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Key ID already exists" });
    }
  });

  // Update existing key
  app.put("/api/keys/:id", (req, res) => {
    const { id: oldId } = req.params;
    const { id: newId, name, crq } = req.body;
    
    try {
      const transaction = db.transaction(() => {
        // If ID is changing, check if new ID already exists
        if (newId !== oldId) {
          const existing = db.prepare("SELECT id FROM keys WHERE id = ?").get(newId);
          if (existing) {
            throw new Error("New ID already exists");
          }
          
          // Update movements first to maintain integrity if FK constraints are strict (though SQLite defaults are loose unless enabled)
          db.prepare("UPDATE movements SET key_id = ? WHERE key_id = ?").run(newId, oldId);
        }
        
        db.prepare("UPDATE keys SET id = ?, name = ?, crq = ? WHERE id = ?").run(newId, name, crq, oldId);
      });
      
      transaction();
      res.json({ success: true });
    } catch (err: any) {
      console.error("Update error:", err);
      res.status(400).json({ error: err.message || "Failed to update key" });
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
