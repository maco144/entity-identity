# Entity Identity ZK - Build System
# Usage: make <target>

.PHONY: all install build setup test clean deploy help

# Default target
all: install build setup test

# Install dependencies
install:
	@echo "Installing dependencies..."
	npm install
	@echo "Checking for circom..."
	@which circom || (echo "circom not found. Install from https://docs.circom.io/getting-started/installation/" && exit 1)

# Build circuits
build: build/entity_type_proof.wasm build/dual_identity_proof.wasm

build/entity_type_proof.wasm: circuits/entity_type_proof.circom
	@echo "Compiling entity_type_proof circuit..."
	@mkdir -p build
	circom circuits/entity_type_proof.circom \
		--r1cs --wasm --sym \
		-o build \
		-l node_modules

build/dual_identity_proof.wasm: circuits/dual_identity_proof.circom
	@echo "Compiling dual_identity_proof circuit..."
	@mkdir -p build
	circom circuits/dual_identity_proof.circom \
		--r1cs --wasm --sym \
		-o build \
		-l node_modules

# Download powers of tau and run trusted setup
setup: build
	@echo "Running trusted setup..."
	@mkdir -p build/setup
	@if [ ! -f build/setup/pot16_final.ptau ]; then \
		echo "Downloading powers of tau (this may take a minute)..."; \
		curl -L -o build/setup/pot16_final.ptau \
			https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_16.ptau; \
	fi
	@echo "Phase 2 setup for entity_type_proof..."
	npx snarkjs groth16 setup \
		build/entity_type_proof.r1cs \
		build/setup/pot16_final.ptau \
		build/setup/entity_type_proof_0000.zkey
	@echo "Contributing randomness..."
	npx snarkjs zkey contribute \
		build/setup/entity_type_proof_0000.zkey \
		build/setup/entity_type_proof_final.zkey \
		--name="Dev contribution" -v -e="random entropy here"
	@echo "Exporting verification key..."
	npx snarkjs zkey export verificationkey \
		build/setup/entity_type_proof_final.zkey \
		build/setup/verification_key.json

# Export Solidity verifier
solidity: setup
	@echo "Exporting Solidity verifier..."
	@mkdir -p contracts
	npx snarkjs zkey export solidityverifier \
		build/setup/entity_type_proof_final.zkey \
		contracts/EntityTypeVerifier.sol
	@echo "Verifier exported to contracts/EntityTypeVerifier.sol"

# Run tests
test:
	@echo "Running tests..."
	npm test

# Run SDK tests with Jest
test-sdk:
	@echo "Running SDK tests..."
	npx jest

# Generate a test proof
prove-test: setup
	@echo "Generating test proof..."
	node src/cli.js prove \
		--type AI.CA \
		--context test-session-123 \
		--output build/proof.json

# Verify test proof
verify-test: prove-test
	@echo "Verifying test proof..."
	node src/cli.js verify \
		--proof build/proof.json \
		--vkey build/setup/verification_key.json

# Deploy to Sepolia testnet
deploy: solidity
	@echo "Deploying to Sepolia..."
	@test -f .env || (echo "Create .env with SEPOLIA_RPC_URL and PRIVATE_KEY" && exit 1)
	npx hardhat run scripts/deploy.js --network sepolia

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf build/ artifacts/ cache/ typechain-types/

# Circuit info
info: build
	@echo "Circuit information:"
	@echo "===================="
	npx snarkjs r1cs info build/entity_type_proof.r1cs
	@echo ""
	npx snarkjs r1cs info build/dual_identity_proof.r1cs

# Help
help:
	@echo "Entity Identity ZK - Available targets:"
	@echo ""
	@echo "  make install     - Install npm dependencies"
	@echo "  make build       - Compile circom circuits"
	@echo "  make setup       - Run Groth16 trusted setup"
	@echo "  make solidity    - Export Solidity verifier"
	@echo "  make test        - Run test suite"
	@echo "  make test-sdk    - Run SDK unit tests (Jest)"
	@echo "  make prove-test  - Generate a test proof"
	@echo "  make verify-test - Verify test proof"
	@echo "  make deploy      - Deploy to Sepolia testnet"
	@echo "  make clean       - Remove build artifacts"
	@echo "  make info        - Show circuit constraint counts"
	@echo "  make help        - Show this help"
	@echo ""
	@echo "Quick start:"
	@echo "  make install build setup test"
