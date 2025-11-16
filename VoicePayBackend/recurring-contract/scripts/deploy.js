const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contract with:", deployer.address);

    const EXECUTOR = process.env.EXECUTOR_ADDRESS;
    if (!EXECUTOR) throw new Error("Missing EXECUTOR_ADDRESS in .env");

    const RecurringPull = await ethers.getContractFactory("RecurringPull");

    console.log("Sending deployment tx...");
    const contract = await RecurringPull.deploy(EXECUTOR);

    // NEW: get the deployment transaction (v6)
    const tx = contract.deploymentTransaction();
    console.log("Transaction hash:", tx.hash);

    console.log("Waiting for deployment...");
    await contract.waitForDeployment();

    console.log("RecurringPull deployed to:", await contract.getAddress());
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});