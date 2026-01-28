/**
 * Entity Identity API Server - Phase 1
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import { buildPoseidon } from 'circomlibjs';
import { buildEddsa } from 'circomlibjs';
import * as snarkjs from 'snarkjs';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { randomBytes, createHash } from 'crypto';
import https from 'https';
import http from 'http';

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
    port: process.env.PORT || 3000,
    httpsPort: process.env.HTTPS_PORT || 3443,
    adminApiKey: process.env.ADMIN_API_KEY || 'dev-admin-key-change-me',
    dbPath: process.env.DB_PATH || './data/ei.db',
    assetsBaseUrl: process.env.ASSETS_URL || null, // Auto-detect if not set
    merkleDepth: 20,

    // HTTPS configuration
    https: {
        enabled: process.env.HTTPS_ENABLED === 'true',
        keyPath: process.env.HTTPS_KEY || './certs/key.pem',
        certPath: process.env.HTTPS_CERT || './certs/cert.pem',
    },

    // Railway / production detection
    isProduction: process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT,
};

// ============================================================================
// DATABASE SETUP
// ============================================================================

function initDatabase(dbPath) {
    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        console.log(`Created database directory: ${dir}`);
    }

    const db = new Database(dbPath);

    db.exec(`
        CREATE TABLE IF NOT EXISTS attesters (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            public_key_x TEXT NOT NULL,
            public_key_y TEXT NOT NULL,
            private_key_encrypted TEXT,
            merkle_index INTEGER,
            allowed_types TEXT NOT NULL,
            api_key_hash TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            revoked_at TEXT
        );

        CREATE TABLE IF NOT EXISTS nullifiers (
            nullifier TEXT PRIMARY KEY,
            context_id TEXT NOT NULL,
            domain TEXT,
            recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS registry_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            root TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            attester_id TEXT,
            details TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);

    return db;
}

// ============================================================================
// ENTITY TYPES
// ============================================================================

const EntityTypes = {
    'AI.CA': { code: 0x0101, name: 'Conversational Agent', phonetic: 'Kah' },
    'AI.PO': { code: 0x0102, name: 'Program Orchestrator', phonetic: 'Poe' },
    'AI.WS': { code: 0x0103, name: 'Web Site', phonetic: 'Wiz' },
    'AI.OS': { code: 0x0104, name: 'Operating System', phonetic: 'Aus' },
    'AI.GN': { code: 0x0105, name: 'Generative Model', phonetic: 'Jen' },
    'AI.AA': { code: 0x0106, name: 'Autonomous Agent', phonetic: 'Ahh' },
    'AR.RB': { code: 0x0201, name: 'Robot Bot', phonetic: 'Rob' },
    'AR.DR': { code: 0x0202, name: 'Drone', phonetic: 'Dar' },
    'AR.VH': { code: 0x0203, name: 'Vehicle', phonetic: 'Vee' },
    'HU.US': { code: 0x0301, name: 'Human User', phonetic: 'Who' },
    'HY.CP': { code: 0x0401, name: 'Copilot', phonetic: 'Kip' },
    'HY.HS': { code: 0x0402, name: 'Hive Swarm', phonetic: 'His' },
};

// ============================================================================
// MERKLE TREE
// ============================================================================

class MerkleTree {
    constructor(depth, hash) {
        this.depth = depth;
        this.hash = hash;
        this.leaves = [];
        this.layers = [];
        this.zeros = [BigInt(0)];
        for (let i = 1; i <= depth; i++) {
            this.zeros[i] = this.hash([this.zeros[i-1], this.zeros[i-1]]);
        }
    }

    addLeaf(leaf) {
        const index = this.leaves.length;
        this.leaves.push(BigInt(leaf));
        this._rebuild();
        return index;
    }

    getRoot() {
        if (this.layers.length === 0) return this.zeros[this.depth];
        return this.layers[this.layers.length - 1][0];
    }

    getProof(index) {
        const pathElements = [];
        const pathIndices = [];
        let currentIndex = index;

        for (let level = 0; level < this.depth; level++) {
            const isRight = currentIndex % 2 === 1;
            const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
            pathIndices.push(isRight ? 1 : 0);

            if (level < this.layers.length && siblingIndex < this.layers[level].length) {
                pathElements.push(this.layers[level][siblingIndex]);
            } else {
                pathElements.push(this.zeros[level]);
            }
            currentIndex = Math.floor(currentIndex / 2);
        }
        return { pathElements, pathIndices };
    }

    _rebuild() {
        this.layers = [this.leaves.slice()];
        let currentLayer = this.layers[0];

        for (let level = 0; level < this.depth; level++) {
            const nextLayer = [];
            for (let i = 0; i < currentLayer.length; i += 2) {
                const left = currentLayer[i];
                const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : this.zeros[level];
                nextLayer.push(this.hash([left, right]));
            }
            if (nextLayer.length === 0) nextLayer.push(this.zeros[level + 1]);
            this.layers.push(nextLayer);
            currentLayer = nextLayer;
        }
    }
}

// ============================================================================
// API SERVER
// ============================================================================

async function createServer() {
    // Initialize crypto
    const poseidon = await buildPoseidon();
    const eddsa = await buildEddsa();

    const hash = (inputs) => {
        const h = poseidon(inputs.map(x => BigInt(x)));
        return poseidon.F.toObject(h);
    };

    // Initialize database
    const db = initDatabase(config.dbPath);

    // Initialize merkle tree from database
    const attesterTree = new MerkleTree(config.merkleDepth, hash);
    const attesters = db.prepare('SELECT * FROM attesters WHERE revoked_at IS NULL ORDER BY merkle_index').all();
    for (const a of attesters) {
        const leaf = hash([BigInt(a.public_key_x), BigInt(a.public_key_y)]);
        attesterTree.addLeaf(leaf);
    }

    // Update registry root
    const currentRoot = attesterTree.getRoot().toString();
    db.prepare('INSERT OR REPLACE INTO registry_state (id, root, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)')
      .run(currentRoot);

    // Load verification key
    let verificationKey;
    const vkeyPaths = [
        './setup/verification_key.json',      // From project root (production)
        '../setup/verification_key.json',     // From api/ directory (development)
        '/app/setup/verification_key.json',   // Absolute path in Docker
    ];

    for (const vkeyPath of vkeyPaths) {
        try {
            if (existsSync(vkeyPath)) {
                verificationKey = JSON.parse(readFileSync(vkeyPath, 'utf-8'));
                console.log(`Loaded verification key from: ${vkeyPath}`);
                break;
            }
        } catch (e) {
            // Try next path
        }
    }

    if (!verificationKey) {
        console.warn('Warning: verification_key.json not found. Verification disabled.');
        console.warn('Searched paths:', vkeyPaths.join(', '));
    }

    // Express app
    const app = express();

    // Middleware
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Rate limiting
    const verifyLimiter = rateLimit({ windowMs: 60000, max: 100 });
    const attestLimiter = rateLimit({ windowMs: 60000, max: 10 });
    const registryLimiter = rateLimit({ windowMs: 60000, max: 60 });

    // ========================================================================
    // MIDDLEWARE
    // ========================================================================

    function adminAuth(req, res, next) {
        const auth = req.headers.authorization;
        if (!auth || auth !== `Bearer ${config.adminApiKey}`) {
            return res.status(401).json({ error: 'unauthorized', message: 'Invalid admin key' });
        }
        next();
    }

    function attesterAuth(req, res, next) {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'unauthorized', message: 'Missing API key' });
        }

        const apiKey = auth.slice(7);
        const keyHash = createHash('sha256').update(apiKey).digest('hex');

        const attester = db.prepare('SELECT * FROM attesters WHERE api_key_hash = ? AND revoked_at IS NULL').get(keyHash);
        if (!attester) {
            return res.status(401).json({ error: 'unauthorized', message: 'Invalid API key' });
        }

        req.attester = attester;
        next();
    }

    // ========================================================================
    // ROUTES: Registry
    // ========================================================================

    app.get('/api/v1/registry', registryLimiter, (req, res) => {
        const state = db.prepare('SELECT * FROM registry_state WHERE id = 1').get();
        const count = db.prepare('SELECT COUNT(*) as count FROM attesters WHERE revoked_at IS NULL').get();

        res.json({
            root: state?.root || '0',
            attestersCount: count.count,
            updatedAt: state?.updated_at
        });
    });

    app.get('/api/v1/registry/attesters', registryLimiter, (req, res) => {
        const attesters = db.prepare(
            'SELECT id, name, public_key_x, public_key_y, merkle_index, allowed_types, created_at FROM attesters WHERE revoked_at IS NULL'
        ).all();

        res.json({
            attesters: attesters.map(a => ({
                id: a.id,
                name: a.name,
                publicKeyX: a.public_key_x,
                publicKeyY: a.public_key_y,
                index: a.merkle_index,
                types: JSON.parse(a.allowed_types),
                createdAt: a.created_at
            }))
        });
    });

    app.get('/api/v1/registry/attesters/:id/proof', registryLimiter, (req, res) => {
        const attester = db.prepare('SELECT * FROM attesters WHERE id = ? AND revoked_at IS NULL').get(req.params.id);

        if (!attester) {
            return res.status(404).json({ error: 'attester_not_found', message: 'Attester not found' });
        }

        const proof = attesterTree.getProof(attester.merkle_index);
        const leaf = hash([BigInt(attester.public_key_x), BigInt(attester.public_key_y)]);

        res.json({
            attesterId: attester.id,
            index: attester.merkle_index,
            leaf: leaf.toString(),
            pathElements: proof.pathElements.map(e => e.toString()),
            pathIndices: proof.pathIndices
        });
    });

    // ========================================================================
    // ROUTES: Attestation
    // ========================================================================

    app.post('/api/v1/attest', attestLimiter, attesterAuth, (req, res) => {
        const { entityCommitment, entityType } = req.body;

        // Validate type
        if (!EntityTypes[entityType]) {
            return res.status(400).json({ error: 'invalid_type', message: `Unknown entity type: ${entityType}` });
        }

        // Check attester is allowed for this type
        const allowedTypes = JSON.parse(req.attester.allowed_types);
        if (!allowedTypes.includes(entityType)) {
            return res.status(403).json({
                error: 'forbidden',
                message: `Attester not authorized for type ${entityType}`
            });
        }

        // Validate commitment
        let commitment;
        try {
            commitment = BigInt(entityCommitment);
        } catch (e) {
            return res.status(400).json({ error: 'invalid_commitment', message: 'Invalid commitment format' });
        }

        // Sign attestation
        const typeCode = EntityTypes[entityType].code;
        const message = hash([commitment, BigInt(typeCode)]);
        const msgF = poseidon.F.e(message);

        // For Phase 1, attesters provide their private key via encrypted storage
        // In production, this would use HSM or the attester signs externally
        let signature;
        try {
            const privKey = Buffer.from(req.attester.private_key_encrypted, 'hex');
            signature = eddsa.signPoseidon(privKey, msgF);
        } catch (e) {
            return res.status(500).json({ error: 'signing_error', message: 'Failed to sign attestation' });
        }

        // Get merkle proof
        const merkleProof = attesterTree.getProof(req.attester.merkle_index);

        // Audit log
        db.prepare('INSERT INTO audit_log (action, attester_id, details) VALUES (?, ?, ?)')
          .run('attest', req.attester.id, JSON.stringify({ entityType, commitment: entityCommitment.slice(0, 20) + '...' }));

        res.json({
            attestation: {
                entityCommitment: entityCommitment,
                entityType: entityType,
                typeCode: typeCode,
                attesterPubKeyX: req.attester.public_key_x,
                attesterPubKeyY: req.attester.public_key_y,
                signatureR8X: eddsa.F.toObject(signature.R8[0]).toString(),
                signatureR8Y: eddsa.F.toObject(signature.R8[1]).toString(),
                signatureS: signature.S.toString(),
                attesterIndex: req.attester.merkle_index,
                createdAt: new Date().toISOString()
            },
            merkleProof: {
                pathElements: merkleProof.pathElements.map(e => e.toString()),
                pathIndices: merkleProof.pathIndices
            },
            registryRoot: attesterTree.getRoot().toString()
        });
    });

    // ========================================================================
    // ROUTES: Proving Assets
    // ========================================================================

    app.get('/api/v1/proving/assets', (req, res) => {
        // Auto-detect base URL from request if not configured
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const baseUrl = config.assetsBaseUrl || `${protocol}://${host}/assets`;

        res.json({
            circuit: 'entity_type_proof',
            assets: {
                wasm: `${baseUrl}/entity_type_proof.wasm`,
                zkey: `${baseUrl}/entity_type_final.zkey`,
                verificationKey: `${baseUrl}/verification_key.json`
            },
            merkleDepth: config.merkleDepth,
            circuitHash: 'ce4b4dda a33748ab b942171b 617e3c39'
        });
    });

    // ========================================================================
    // ROUTES: Verification
    // ========================================================================

    app.post('/api/v1/verify', verifyLimiter, async (req, res) => {
        const { proof, publicSignals } = req.body;

        if (!verificationKey) {
            return res.status(500).json({ error: 'internal_error', message: 'Verification not configured' });
        }

        if (!proof || !publicSignals || publicSignals.length !== 5) {
            return res.status(400).json({ error: 'invalid_request', message: 'Missing proof or publicSignals' });
        }

        // Verify proof cryptographically
        let valid;
        try {
            valid = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
        } catch (e) {
            return res.status(400).json({ error: 'proof_invalid', message: 'Proof verification failed' });
        }

        if (!valid) {
            return res.status(400).json({ error: 'proof_invalid', message: 'Cryptographic verification failed' });
        }

        // Check registry root
        const [nullifier, entityCommitment, claimedType, attestersRoot, contextId] = publicSignals;
        const currentRoot = attesterTree.getRoot().toString();

        if (attestersRoot !== currentRoot) {
            // Could also check against recent historical roots
            return res.status(400).json({
                error: 'root_mismatch',
                message: 'Proof uses outdated registry root'
            });
        }

        // Check nullifier
        const existingNullifier = db.prepare('SELECT * FROM nullifiers WHERE nullifier = ?').get(nullifier);

        // Look up entity type
        const typeCode = parseInt(claimedType);
        const typeEntry = Object.entries(EntityTypes).find(([k, v]) => v.code === typeCode);

        res.json({
            valid: true,
            entityType: typeEntry ? typeEntry[0] : null,
            entityTypeName: typeEntry ? typeEntry[1].name : null,
            phoneticName: typeEntry ? typeEntry[1].phonetic : null,
            entityCommitment,
            nullifier,
            registryRootValid: true,
            nullifierStatus: existingNullifier ? 'used' : 'new'
        });
    });

    app.post('/api/v1/verify/record', verifyLimiter, (req, res) => {
        const { nullifier, contextId, domain } = req.body;

        if (!nullifier) {
            return res.status(400).json({ error: 'invalid_request', message: 'Missing nullifier' });
        }

        // Check if already used
        const existing = db.prepare('SELECT * FROM nullifiers WHERE nullifier = ?').get(nullifier);
        if (existing) {
            return res.status(409).json({ error: 'nullifier_used', message: 'Nullifier already recorded' });
        }

        // Record it
        db.prepare('INSERT INTO nullifiers (nullifier, context_id, domain) VALUES (?, ?, ?)')
          .run(nullifier, contextId || '', domain || '');

        res.json({ recorded: true, nullifier });
    });

    // ========================================================================
    // ROUTES: Admin
    // ========================================================================

    app.post('/api/v1/admin/attesters', adminAuth, (req, res) => {
        const { id, name, allowedTypes, contact } = req.body;

        if (!id || !name || !allowedTypes) {
            return res.status(400).json({ error: 'invalid_request', message: 'Missing required fields' });
        }

        // Check ID doesn't exist
        const existing = db.prepare('SELECT id FROM attesters WHERE id = ?').get(id);
        if (existing) {
            return res.status(409).json({ error: 'already_exists', message: 'Attester ID already exists' });
        }

        // Generate keypair
        const privKey = randomBytes(32);
        const pubKey = eddsa.prv2pub(privKey);
        const pubKeyX = eddsa.F.toObject(pubKey[0]).toString();
        const pubKeyY = eddsa.F.toObject(pubKey[1]).toString();

        // Generate API key
        const apiKey = randomBytes(32).toString('hex');
        const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

        // Add to merkle tree
        const leaf = hash([BigInt(pubKeyX), BigInt(pubKeyY)]);
        const merkleIndex = attesterTree.addLeaf(leaf);

        // Update registry root
        const newRoot = attesterTree.getRoot().toString();
        db.prepare('UPDATE registry_state SET root = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(newRoot);

        // Store attester
        db.prepare(`
            INSERT INTO attesters (id, name, public_key_x, public_key_y, private_key_encrypted, merkle_index, allowed_types, api_key_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, name, pubKeyX, pubKeyY, privKey.toString('hex'), merkleIndex, JSON.stringify(allowedTypes), apiKeyHash);

        // Audit log
        db.prepare('INSERT INTO audit_log (action, attester_id, details) VALUES (?, ?, ?)')
          .run('attester_created', id, JSON.stringify({ name, allowedTypes }));

        res.json({
            attester: {
                id,
                name,
                publicKeyX: pubKeyX,
                publicKeyY: pubKeyY,
                index: merkleIndex,
                types: allowedTypes
            },
            apiKey: apiKey,  // Only returned once!
            registryRoot: newRoot,
            warning: 'Store the API key securely. It cannot be retrieved again.'
        });
    });

    app.delete('/api/v1/admin/attesters/:id', adminAuth, (req, res) => {
        const attester = db.prepare('SELECT * FROM attesters WHERE id = ? AND revoked_at IS NULL').get(req.params.id);

        if (!attester) {
            return res.status(404).json({ error: 'attester_not_found', message: 'Attester not found' });
        }

        // Mark as revoked (don't delete for audit trail)
        db.prepare('UPDATE attesters SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

        // Rebuild merkle tree without this attester
        const activeAttesters = db.prepare('SELECT * FROM attesters WHERE revoked_at IS NULL ORDER BY merkle_index').all();

        // Reset tree
        attesterTree.leaves = [];
        attesterTree.layers = [];

        for (let i = 0; i < activeAttesters.length; i++) {
            const a = activeAttesters[i];
            const leaf = hash([BigInt(a.public_key_x), BigInt(a.public_key_y)]);
            attesterTree.addLeaf(leaf);

            // Update merkle index
            db.prepare('UPDATE attesters SET merkle_index = ? WHERE id = ?').run(i, a.id);
        }

        const newRoot = attesterTree.getRoot().toString();
        db.prepare('UPDATE registry_state SET root = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(newRoot);

        // Audit log
        db.prepare('INSERT INTO audit_log (action, attester_id, details) VALUES (?, ?, ?)')
          .run('attester_revoked', req.params.id, '{}');

        res.json({
            revoked: true,
            attesterId: req.params.id,
            registryRoot: newRoot
        });
    });

    // ========================================================================
    // HEALTH CHECK
    // ========================================================================

    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: config.isProduction ? 'production' : 'development'
        });
    });

    // ========================================================================
    // STATIC ASSETS (for proving files)
    // ========================================================================

    app.use('/assets', express.static('../build/entity_type_proof_js'));
    app.use('/assets', express.static('../setup'));

    return app;
}

// ============================================================================
// START SERVER
// ============================================================================

async function startServer() {
    const app = await createServer();

    // Railway handles TLS termination, so we just use HTTP there
    if (config.isProduction) {
        const server = http.createServer(app);
        server.listen(config.port, '0.0.0.0', () => {
            console.log(`Entity Identity API running on port ${config.port} (production)`);
        });
        return;
    }

    // Development: optionally start HTTPS
    if (config.https.enabled) {
        if (!existsSync(config.https.keyPath) || !existsSync(config.https.certPath)) {
            console.log('HTTPS enabled but certificates not found. Generating self-signed...');
            await generateSelfSignedCert();
        }

        const httpsOptions = {
            key: readFileSync(config.https.keyPath),
            cert: readFileSync(config.https.certPath),
        };

        // Start HTTPS server
        https.createServer(httpsOptions, app).listen(config.httpsPort, () => {
            console.log(`Entity Identity API (HTTPS) running on port ${config.httpsPort}`);
        });

        // Also start HTTP with redirect
        http.createServer((req, res) => {
            res.writeHead(301, { Location: `https://${req.headers.host?.replace(`:${config.port}`, `:${config.httpsPort}`)}${req.url}` });
            res.end();
        }).listen(config.port, () => {
            console.log(`HTTP redirect running on port ${config.port} -> ${config.httpsPort}`);
        });
    } else {
        // HTTP only (development default)
        app.listen(config.port, () => {
            console.log(`Entity Identity API running on http://localhost:${config.port}`);
            console.log('Tip: Set HTTPS_ENABLED=true for HTTPS support');
        });
    }
}

// ============================================================================
// SELF-SIGNED CERTIFICATE GENERATION
// ============================================================================

async function generateSelfSignedCert() {
    const { execSync } = await import('child_process');
    const { mkdirSync } = await import('fs');

    try {
        mkdirSync('./certs', { recursive: true });

        execSync(`openssl req -x509 -newkey rsa:4096 -keyout ./certs/key.pem -out ./certs/cert.pem -days 365 -nodes -subj "/CN=localhost"`, {
            stdio: 'pipe'
        });

        console.log('Self-signed certificate generated in ./certs/');
    } catch (e) {
        console.error('Failed to generate certificate. Install OpenSSL or provide certs manually.');
        console.error('Error:', e.message);
        process.exit(1);
    }
}

// Start
startServer().catch(console.error);
