import express from "express";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
let firebaseInitialized = false;
let firebaseError = "";

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    if (admin.apps.length === 0) {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY.trim();
      
      // Remove quotes if the user pasted them by mistake
      privateKey = privateKey.replace(/^["']|["']$/g, '');
      
      // Handle escaped newlines (both \n and literal newlines)
      privateKey = privateKey.replace(/\\n/g, '\n');
      
      // Ensure headers are present
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID.trim(),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
          privateKey: privateKey,
        }),
      });
      console.log("Firebase Admin initialized successfully");
    }
    firebaseInitialized = true;
  } catch (error: any) {
    firebaseError = error.message;
    console.error("Firebase initialization error:", error);
  }
} else {
  const missing = [];
  if (!process.env.FIREBASE_PROJECT_ID) missing.push("FIREBASE_PROJECT_ID");
  if (!process.env.FIREBASE_CLIENT_EMAIL) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!process.env.FIREBASE_PRIVATE_KEY) missing.push("FIREBASE_PRIVATE_KEY");
  firebaseError = `Missing environment variables: ${missing.join(", ")}`;
  console.warn(firebaseError);
}

const getFirestore = () => {
  if (!firebaseInitialized) {
    throw new Error(`Firebase not initialized: ${firebaseError}`);
  }
  return admin.firestore();
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    const pk = process.env.FIREBASE_PRIVATE_KEY || "";
    const email = process.env.FIREBASE_CLIENT_EMAIL || "";
    const pid = process.env.FIREBASE_PROJECT_ID || "";
    
    const pkValid = pk.includes("BEGIN PRIVATE KEY") && pk.includes("END PRIVATE KEY");
    const isJson = pk.trim().startsWith("{") || email.trim().startsWith("{") || pid.trim().startsWith("{");
    
    res.json({ 
      status: "ok", 
      firebase: {
        initialized: firebaseInitialized,
        error: firebaseError || null,
        config: {
          projectId: !!pid,
          clientEmail: !!email,
          privateKeyPresent: !!pk,
          privateKeyFormatValid: pkValid,
          pastedWholeJson: isJson
        }
      }
    });
  });
  
  // Get all keys
  app.get("/api/keys", async (req, res) => {
    try {
      const firestore = getFirestore();
      const snapshot = await firestore.collection("keys").get();
      const keys = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(keys);
    } catch (err: any) {
      console.error("Fetch keys error:", err);
      res.status(500).json({ error: err.message || "Failed to fetch keys" });
    }
  });

  // Add new key
  app.post("/api/keys", async (req, res) => {
    const { id, name, description } = req.body;
    console.log(`[POST /api/keys] Tentando cadastrar chave: ID=${id}, Nome=${name}`);
    
    try {
      const firestore = getFirestore();
      console.log(`[POST /api/keys] Firestore obtido. Verificando se ID=${id} existe...`);
      
      const docRef = firestore.collection("keys").doc(id);
      const doc = await docRef.get();
      
      if (doc.exists) {
        console.log(`[POST /api/keys] Erro: ID=${id} já existe.`);
        return res.status(400).json({ error: "Key ID already exists" });
      }
      
      console.log(`[POST /api/keys] ID disponível. Salvando no Firestore...`);
      await docRef.set({
        name,
        description: description || '',
        status: 'available',
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`[POST /api/keys] Chave ID=${id} salva com sucesso!`);
      res.status(201).json({ success: true });
    } catch (err: any) {
      console.error("[POST /api/keys] Erro fatal:", err);
      res.status(400).json({ error: err.message || "Failed to add key" });
    }
  });

  // Update existing key
  app.put("/api/keys/:id", async (req, res) => {
    const { id: oldId } = req.params;
    const { id: newId, name, description } = req.body;
    
    try {
      const firestore = getFirestore();
      await firestore.runTransaction(async (transaction) => {
        const oldDocRef = firestore.collection("keys").doc(oldId);
        const oldDoc = await transaction.get(oldDocRef);
        
        if (!oldDoc.exists) {
          throw new Error("Key not found");
        }

        if (newId !== oldId) {
          const newDocRef = firestore.collection("keys").doc(newId);
          const newDoc = await transaction.get(newDocRef);
          if (newDoc.exists) {
            throw new Error("New ID already exists");
          }
          
          // Move data to new ID
          transaction.set(newDocRef, {
            ...oldDoc.data(),
            name,
            description: description || ''
          });
          transaction.delete(oldDocRef);

          // Update related collections (movements, crq_keys)
          // In Firestore, we might need to query and update these separately or use a different schema
          // For simplicity in this migration, we'll just update the key itself
        } else {
          transaction.update(oldDocRef, { name, description: description || '' });
        }
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error("Update error:", err);
      res.status(400).json({ error: err.message || "Failed to update key" });
    }
  });

  // CRQ Endpoints
  app.get("/api/crqs", async (req, res) => {
    try {
      const firestore = getFirestore();
      const snapshot = await firestore.collection("crqs").orderBy("created_at", "desc").get();
      const crqs = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        created_at: doc.data().created_at?.toDate?.() || doc.data().created_at
      }));
      res.json(crqs);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch CRQs" });
    }
  });

  app.post("/api/crqs", async (req, res) => {
    const { id, technician, technician_phone, company, keyIds } = req.body;
    try {
      const firestore = getFirestore();
      await firestore.runTransaction(async (transaction) => {
        const crqRef = firestore.collection("crqs").doc(id);
        const crqDoc = await transaction.get(crqRef);
        if (crqDoc.exists) {
          throw new Error("CRQ ID already exists");
        }

        transaction.set(crqRef, {
          technician,
          technician_phone,
          company,
          status: 'open',
          keyIds,
          created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        for (const keyId of keyIds) {
          const keyRef = firestore.collection("keys").doc(keyId);
          transaction.update(keyRef, { status: 'in_field' });
        }
      });
      res.status(201).json({ success: true });
    } catch (err: any) {
      console.error("Create CRQ error:", err);
      res.status(400).json({ error: err.message || "Failed to create CRQ" });
    }
  });

  app.get("/api/crqs/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const firestore = getFirestore();
      const crqDoc = await firestore.collection("crqs").doc(id).get();
      if (!crqDoc.exists) return res.status(404).json({ error: "CRQ not found" });
      
      const crqData = crqDoc.data()!;
      const keyIds = crqData.keyIds || [];
      
      const keys: any[] = [];
      if (keyIds.length > 0) {
        const keysSnapshot = await firestore.collection("keys").where(admin.firestore.FieldPath.documentId(), "in", keyIds).get();
        keysSnapshot.forEach(doc => keys.push({ id: doc.id, ...doc.data() }));
      }
      
      res.json({ 
        id: crqDoc.id, 
        ...crqData, 
        keys,
        created_at: crqData.created_at?.toDate?.() || crqData.created_at
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch CRQ details" });
    }
  });

  app.post("/api/crqs/:id/close", async (req, res) => {
    const { id } = req.params;
    try {
      const firestore = getFirestore();
      await firestore.runTransaction(async (transaction) => {
        const crqRef = firestore.collection("crqs").doc(id);
        const crqDoc = await transaction.get(crqRef);
        if (!crqDoc.exists) throw new Error("CRQ not found");

        transaction.update(crqRef, { status: 'closed' });
        
        const keyIds = crqDoc.data()?.keyIds || [];
        for (const keyId of keyIds) {
          const keyRef = firestore.collection("keys").doc(keyId);
          transaction.update(keyRef, { status: 'available' });
        }
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error("Close CRQ error:", err);
      res.status(400).json({ error: err.message || "Failed to close CRQ" });
    }
  });

  // Key Check-out
  app.post("/api/checkout", async (req, res) => {
    const { key_id, technician_name, company, crq, expected_return } = req.body;
    try {
      const firestore = getFirestore();
      await firestore.runTransaction(async (transaction) => {
        const keyRef = firestore.collection("keys").doc(key_id);
        transaction.update(keyRef, { status: 'in_field' });
        
        const movementRef = firestore.collection("movements").doc();
        transaction.set(movementRef, {
          key_id,
          technician_name,
          company,
          crq,
          expected_return,
          checkout_time: admin.firestore.FieldValue.serverTimestamp(),
          checkin_time: null
        });
      });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to checkout key" });
    }
  });

  // Key Check-in
  app.post("/api/checkin", async (req, res) => {
    const { key_id } = req.body;
    try {
      const firestore = getFirestore();
      await firestore.runTransaction(async (transaction) => {
        const keyRef = firestore.collection("keys").doc(key_id);
        transaction.update(keyRef, { status: 'available' });
        
        const movementSnapshot = await firestore.collection("movements")
          .where("key_id", "==", key_id)
          .where("checkin_time", "==", null)
          .limit(1)
          .get();
          
        if (!movementSnapshot.empty) {
          const movementRef = movementSnapshot.docs[0].ref;
          transaction.update(movementRef, { checkin_time: admin.firestore.FieldValue.serverTimestamp() });
        }
      });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to checkin key" });
    }
  });

  // Get Movements History
  app.get("/api/movements", async (req, res) => {
    try {
      const firestore = getFirestore();
      const snapshot = await firestore.collection("movements").orderBy("checkout_time", "desc").get();
      const movements = await Promise.all(snapshot.docs.map(async doc => {
        const data = doc.data();
        const keyDoc = await firestore.collection("keys").doc(data.key_id).get();
        return {
          id: doc.id,
          ...data,
          key_name: keyDoc.exists ? keyDoc.data()?.name : 'Unknown',
          checkout_time: data.checkout_time?.toDate?.() || data.checkout_time,
          checkin_time: data.checkin_time?.toDate?.() || data.checkin_time,
          expected_return: data.expected_return
        };
      }));
      res.json(movements);
    } catch (err) {
      console.error("Fetch movements error:", err);
      res.status(500).json({ error: "Failed to fetch movements" });
    }
  });

  // Dashboard Stats
  app.get("/api/stats", async (req, res) => {
    try {
      const firestore = getFirestore();
      const keysSnapshot = await firestore.collection("keys").get();
      const crqsSnapshot = await firestore.collection("crqs").get();
      const movementsSnapshot = await firestore.collection("movements").where("checkin_time", "==", null).get();

      const keys = keysSnapshot.docs.map(doc => doc.data());
      const totalKeys = keys.length;
      const inField = keys.filter(k => k.status === 'in_field').length;
      const available = keys.filter(k => k.status === 'available').length;
      const totalCrqs = crqsSnapshot.size;
      
      let overdue = 0;
      const now = new Date();
      movementsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.expected_return && new Date(data.expected_return) < now) {
          overdue++;
        }
      });

      res.json({
        total: totalKeys,
        inField,
        available,
        totalCrqs,
        overdue
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
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
