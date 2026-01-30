/**
 * Deploy EntityTypeVerifier to testnet
 *
 * Usage: npx hardhat run scripts/deploy.js --network sepolia
 */

import pkg from "hardhat";
const { ethers, run } = pkg;
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    console.log("Deploying EntityTypeVerifier...\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH\n");

    // Check if verifier contract exists
    const verifierPath = path.join(__dirname, "..", "contracts", "EntityTypeVerifier.sol");
    if (!fs.existsSync(verifierPath)) {
        console.error("Verifier contract not found. Run: make solidity");
        process.exit(1);
    }

    // Deploy the verifier
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const verifierAddress = await verifier.getAddress();
    console.log("Verifier deployed to:", verifierAddress);

    // Deploy the registry contract
    const Registry = await ethers.getContractFactory("EntityTypeRegistry");
    const registry = await Registry.deploy(verifierAddress);
    await registry.waitForDeployment();

    const registryAddress = await registry.getAddress();
    console.log("Registry deployed to:", registryAddress);

    // Save deployment info
    const deployment = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: (await ethers.provider.getNetwork()).chainId.toString(),
        deployer: deployer.address,
        verifier: verifierAddress,
        registry: registryAddress,
        timestamp: new Date().toISOString(),
    };

    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir);
    }

    const deploymentFile = path.join(deploymentsDir, `${deployment.network}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
    console.log("\nDeployment saved to:", deploymentFile);

    // Verify on Etherscan if API key is set
    if (process.env.ETHERSCAN_API_KEY) {
        console.log("\nWaiting for block confirmations...");
        await verifier.deploymentTransaction()?.wait(5);

        console.log("Verifying on Etherscan...");
        try {
            await run("verify:verify", {
                address: verifierAddress,
                constructorArguments: [],
            });
            await run("verify:verify", {
                address: registryAddress,
                constructorArguments: [verifierAddress],
            });
        } catch (e) {
            console.log("Verification failed:", e.message);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
