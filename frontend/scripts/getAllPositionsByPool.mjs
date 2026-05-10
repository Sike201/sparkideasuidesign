import {
  clusterApiUrl,
  Connection,
  PublicKey,
} from "@solana/web3.js";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";

// Configuration
const CONFIG = {
  rpcUrl: "https://mainnet.helius-rpc.com/?api-key=66c20d17-de25-4ed8-a54b-1d85c6b5a04b",
  poolAddress: new PublicKey("6sKHJTjkjE8ancNoCKuXcgNugGkEiRDxwHvVpUyTq2ZM"), // Replace with your pool address
};

async function getAllPositionsByPool() {
  try {
    console.log("🔍 Getting all positions for pool:", CONFIG.poolAddress.toString());
    console.log("📡 RPC URL:", CONFIG.rpcUrl);
    console.log("=".repeat(80));

    // Initialize connection and CP-AMM client
    const connection = new Connection(CONFIG.rpcUrl, "confirmed");
    const cpAmm = new CpAmm(connection);

    // Get all positions for the pool
    const poolPositions = await cpAmm.getAllPositionsByPool(CONFIG.poolAddress);

    console.log(`\n📊 Pool has ${poolPositions.length} positions`);
    
    if (poolPositions.length === 0) {
      console.log("❌ No positions found for this pool.");
      return;
    }

    // Display basic information about each position
    console.log("\n🏦 Position Summary:");
    console.log("=".repeat(80));

    poolPositions.forEach((position, index) => {
      console.log(`📋 Position ${index + 1}: ${position.publicKey.toString()}`);
      console.log(`   Owner: ${position.account.owner.toString()}`);
      console.log(`   Liquidity: ${Number(position.account.liquidity).toLocaleString()}`);
      console.log(`   Tick Range: ${position.account.lowerTick} to ${position.account.upperTick}`);
      console.log(`   Fee Owed A: ${Number(position.account.feeOwedA).toLocaleString()}`);
      console.log(`   Fee Owed B: ${Number(position.account.feeOwedB).toLocaleString()}`);
      console.log("");
    });

    // Summary statistics
    console.log("📈 Summary Statistics:");
    console.log("=".repeat(80));
    
    const totalLiquidity = poolPositions.reduce((sum, pos) => sum + Number(pos.account.liquidity), 0);
    const totalFeeOwedA = poolPositions.reduce((sum, pos) => sum + Number(pos.account.feeOwedA), 0);
    const totalFeeOwedB = poolPositions.reduce((sum, pos) => sum + Number(pos.account.feeOwedB), 0);
    
    const uniqueOwners = new Set(poolPositions.map(pos => pos.account.owner.toString())).size;
    
    console.log(`Total Positions: ${poolPositions.length}`);
    console.log(`Unique Owners: ${uniqueOwners}`);
    console.log(`Total Liquidity: ${totalLiquidity.toLocaleString()}`);
    console.log(`Total Fee Owed A: ${totalFeeOwedA.toLocaleString()}`);
    console.log(`Total Fee Owed B: ${totalFeeOwedB.toLocaleString()}`);

    // Find positions with the most liquidity
    const sortedByLiquidity = [...poolPositions].sort((a, b) => 
      Number(b.account.liquidity) - Number(a.account.liquidity)
    );

    console.log("\n🏆 Top 5 Positions by Liquidity:");
    console.log("=".repeat(80));
    
    sortedByLiquidity.slice(0, 5).forEach((position, index) => {
      console.log(`${index + 1}. ${position.publicKey.toString()}`);
      console.log(`   Owner: ${position.account.owner.toString()}`);
      console.log(`   Liquidity: ${Number(position.account.liquidity).toLocaleString()}`);
      console.log(`   Fee Owed A: ${Number(position.account.feeOwedA).toLocaleString()}`);
      console.log(`   Fee Owed B: ${Number(position.account.feeOwedB).toLocaleString()}`);
      console.log("");
    });

    // Find positions with unclaimed fees
    const positionsWithFees = poolPositions.filter(pos => 
      Number(pos.account.feeOwedA) > 0 || Number(pos.account.feeOwedB) > 0
    );

    if (positionsWithFees.length > 0) {
      console.log(`💰 ${positionsWithFees.length} positions have unclaimed fees:`);
      console.log("=".repeat(80));
      
      positionsWithFees.forEach((position, index) => {
        const feeA = Number(position.account.feeOwedA);
        const feeB = Number(position.account.feeOwedB);
        
        if (feeA > 0 || feeB > 0) {
          console.log(`${index + 1}. ${position.publicKey.toString()}`);
          console.log(`   Owner: ${position.account.owner.toString()}`);
          if (feeA > 0) console.log(`   Fee Owed A: ${feeA.toLocaleString()}`);
          if (feeB > 0) console.log(`   Fee Owed B: ${feeB.toLocaleString()}`);
          console.log("");
        }
      });
    } else {
      console.log("✅ No positions have unclaimed fees.");
    }

    // Export data as JSON for further processing
    console.log("💾 Exporting position data...");
    const exportData = {
      poolAddress: CONFIG.poolAddress.toString(),
      timestamp: new Date().toISOString(),
      totalPositions: poolPositions.length,
      uniqueOwners,
      totalLiquidity,
      totalFeeOwedA,
      totalFeeOwedB,
      positions: poolPositions.map(pos => ({
        publicKey: pos.publicKey.toString(),
        owner: pos.account.owner.toString(),
        pool: pos.account.pool.toString(),
        liquidity: pos.account.liquidity.toString(),
        lowerTick: pos.account.lowerTick,
        upperTick: pos.account.upperTick,
        feeOwedA: pos.account.feeOwedA.toString(),
        feeOwedB: pos.account.feeOwedB.toString(),
        positionNftMint: pos.account.positionNftMint.toString(),
      }))
    };

    // Optional: Write to file (uncomment if you want to save to file)
    // import { writeFileSync } from 'fs';
    // const filename = `pool-positions-${CONFIG.poolAddress.toString()}-${Date.now()}.json`;
    // writeFileSync(filename, JSON.stringify(exportData, null, 2));
    // console.log(`📄 Data exported to ${filename}`);

    return exportData;

  } catch (error) {
    console.error("❌ Error getting pool positions:", error);
    
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    
    console.log("\n🔧 Troubleshooting:");
    console.log("- Verify the pool address is correct");
    console.log("- Check if the pool exists on the specified network");
    console.log("- Ensure you have a stable internet connection");
    console.log("- Try a different RPC endpoint if the current one is slow");
    
    throw error;
  }
}

// Run the script
getAllPositionsByPool()
  .then((data) => {
    console.log("\n✅ Script completed successfully!");
    console.log(`📊 Found ${data.totalPositions} positions for pool ${data.poolAddress}`);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error.message);
    process.exit(1);
  }); 