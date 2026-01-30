#!/usr/bin/env node

/**
 * Entity Identity CLI
 *
 * Usage:
 *   eid prove --type AI.CA --context session123
 *   eid verify --proof proof.json --vkey verification_key.json
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, '..', 'build');

// Entity type codes
const EntityTypes = {
    'AI.CA': 0x0101,
    'AI.PO': 0x0102,
    'AI.WS': 0x0103,
    'AI.OS': 0x0104,
    'AI.GN': 0x0105,
    'AI.AA': 0x0106,
    'AI.LM': 0x0107,
    'AI.DB': 0x0108,
    'AI.JG': 0x0109,
    'AI.SY': 0x010A,
    'AR.RB': 0x0201,
    'AR.DR': 0x0202,
    'AR.VH': 0x0203,
    'HU.US': 0x0301,
    'HY.CP': 0x0401,
    'HY.HS': 0x0402,
};

const PhoneticNames = {
    'AI.CA': 'Kah',
    'AI.PO': 'Poe',
    'AI.WS': 'Wiz',
    'AI.OS': 'Aus',
    'AI.GN': 'Jen',
    'AI.AA': 'Ahh',
    'AI.LM': 'Elm',
    'AI.DB': 'Deb',
    'AI.JG': 'Jig',
    'AI.SY': 'Sigh',
    'AR.RB': 'Rob',
    'AR.DR': 'Dar',
    'AR.VH': 'Vee',
    'HU.US': 'Who',
    'HY.CP': 'Kip',
    'HY.HS': 'His',
};

const program = new Command();

program
    .name('eid')
    .description('Entity Identity - ZK proof system for AI/robot/human identification')
    .version('0.1.0');

// Prove command
program
    .command('prove')
    .description('Generate a ZK proof of entity type')
    .requiredOption('-t, --type <type>', 'Entity type (e.g., AI.CA, AR.RB, HU.US)')
    .requiredOption('-c, --context <context>', 'Context ID for nullifier (e.g., session ID)')
    .option('-o, --output <file>', 'Output file for proof', 'proof.json')
    .option('-s, --secret <secret>', 'Entity secret (hex). Generated if not provided')
    .option('--wasm <path>', 'Path to circuit WASM')
    .option('--zkey <path>', 'Path to proving key')
    .action(async (options) => {
        try {
            console.log(chalk.blue('Generating entity type proof...\n'));

            // Validate type
            if (!EntityTypes[options.type]) {
                console.error(chalk.red(`Unknown entity type: ${options.type}`));
                console.log('Valid types:', Object.keys(EntityTypes).join(', '));
                process.exit(1);
            }

            const typeCode = EntityTypes[options.type];
            const phonetic = PhoneticNames[options.type];

            console.log(`  Type: ${chalk.green(options.type)} (${phonetic})`);
            console.log(`  Code: ${chalk.yellow('0x' + typeCode.toString(16))}`);
            console.log(`  Context: ${chalk.cyan(options.context)}`);

            // Generate or use provided secret
            const secret = options.secret
                ? BigInt(options.secret)
                : BigInt('0x' + [...crypto.getRandomValues(new Uint8Array(32))]
                    .map(b => b.toString(16).padStart(2, '0')).join(''));

            const salt = BigInt('0x' + [...crypto.getRandomValues(new Uint8Array(32))]
                .map(b => b.toString(16).padStart(2, '0')).join(''));

            // Load snarkjs dynamically
            const snarkjs = await import('snarkjs');

            // Paths
            const wasmPath = options.wasm || path.join(BUILD_DIR, 'entity_type_proof_js', 'entity_type_proof.wasm');
            const zkeyPath = options.zkey || path.join(BUILD_DIR, 'setup', 'entity_type_proof_final.zkey');

            // Check files exist
            try {
                await fs.access(wasmPath);
                await fs.access(zkeyPath);
            } catch {
                console.error(chalk.red('\nBuild files not found. Run: make build setup'));
                process.exit(1);
            }

            // For demo: create minimal inputs
            // In production: would include real attestation and merkle proofs
            const inputs = {
                claimedType: typeCode.toString(),
                attestersRoot: "12345678901234567890", // Placeholder
                contextId: BigInt('0x' + Buffer.from(options.context).toString('hex')).toString(),
                entitySecret: secret.toString(),
                entitySalt: salt.toString(),
                // ... attestation inputs would go here
            };

            console.log(chalk.blue('\n  Note: Using placeholder attestation for demo'));
            console.log(chalk.blue('  Production requires real attester signature + merkle proof\n'));

            // In production, generate actual proof:
            // const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasmPath, zkeyPath);

            // For now, output structure
            const output = {
                entityType: options.type,
                typeCode: typeCode,
                phonetic: phonetic,
                context: options.context,
                timestamp: new Date().toISOString(),
                inputs: {
                    claimedType: inputs.claimedType,
                    contextId: inputs.contextId,
                },
                // proof: proof,
                // publicSignals: publicSignals,
                note: "Run 'make setup' then regenerate for actual ZK proof",
            };

            await fs.writeFile(options.output, JSON.stringify(output, null, 2));
            console.log(chalk.green(`Proof written to: ${options.output}`));

        } catch (error) {
            console.error(chalk.red('Error generating proof:'), error.message);
            process.exit(1);
        }
    });

// Verify command
program
    .command('verify')
    .description('Verify a ZK proof of entity type')
    .requiredOption('-p, --proof <file>', 'Proof file to verify')
    .option('-v, --vkey <file>', 'Verification key file')
    .action(async (options) => {
        try {
            console.log(chalk.blue('Verifying entity type proof...\n'));

            const proofData = JSON.parse(await fs.readFile(options.proof, 'utf-8'));

            console.log(`  Type: ${chalk.green(proofData.entityType)} (${proofData.phonetic})`);
            console.log(`  Context: ${chalk.cyan(proofData.context)}`);
            console.log(`  Generated: ${proofData.timestamp}`);

            if (!proofData.proof) {
                console.log(chalk.yellow('\n  Demo proof - no ZK data to verify'));
                console.log(chalk.yellow('  Run full setup for cryptographic verification'));
                return;
            }

            // Load snarkjs
            const snarkjs = await import('snarkjs');

            const vkeyPath = options.vkey || path.join(BUILD_DIR, 'setup', 'verification_key.json');
            const vkey = JSON.parse(await fs.readFile(vkeyPath, 'utf-8'));

            const valid = await snarkjs.groth16.verify(vkey, proofData.publicSignals, proofData.proof);

            if (valid) {
                console.log(chalk.green('\n✓ Proof is VALID'));
                console.log(`  Entity is verified as: ${proofData.entityType}`);
            } else {
                console.log(chalk.red('\n✗ Proof is INVALID'));
                process.exit(1);
            }

        } catch (error) {
            console.error(chalk.red('Error verifying proof:'), error.message);
            process.exit(1);
        }
    });

// List types command
program
    .command('types')
    .description('List all entity types')
    .action(() => {
        console.log(chalk.blue('Entity Types:\n'));
        console.log('  Code     Phonetic  Description');
        console.log('  ──────   ────────  ───────────');

        const descriptions = {
            'AI.CA': 'Conversational Agent',
            'AI.PO': 'Program Orchestrator',
            'AI.WS': 'Web Site',
            'AI.OS': 'Operating System',
            'AI.GN': 'Generative Model',
            'AI.AA': 'Autonomous Agent',
            'AI.LM': 'Language Model',
            'AI.DB': 'Data Broker',
            'AI.JG': 'Judge/Evaluator',
            'AI.SY': 'Synthetic Media',
            'AR.RB': 'Robot Bot',
            'AR.DR': 'Drone',
            'AR.VH': 'Vehicle',
            'HU.US': 'Human User',
            'HY.CP': 'Copilot (Human-AI)',
            'HY.HS': 'Hive Swarm',
        };

        for (const [code, value] of Object.entries(EntityTypes)) {
            const phonetic = PhoneticNames[code] || '???';
            const desc = descriptions[code] || '';
            console.log(`  ${chalk.green(code.padEnd(7))} ${chalk.yellow(phonetic.padEnd(8))} ${desc}`);
        }
    });

program.parse();
