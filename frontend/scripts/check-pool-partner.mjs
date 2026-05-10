import { Connection, PublicKey } from '@solana/web3.js';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';

// Configuration
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SPARK_POOLS = [
  '3odxNC8b1dPqRg2C3KpCkNBbDpLHoDtYjT6xDpjDYNxU',
  'DChxiuDQLuWBdJGgSkDH7c2MibrpxhsY9gUyFBV8JiaJ',
  'FBju6SbG13w6pTtfRJDtU7YVjjL3NK1pK1P3Mk9bzyN8'
];

async function checkPoolPartner() {
  try {
    console.log('🔍 Checking partner addresses for Spark pools...');
    console.log('RPC URL:', RPC_URL);
    console.log('');

    // Initialize connection and client
    const connection = new Connection(RPC_URL, 'confirmed');
    const cpAmm = new CpAmm(connection);

    for (const poolAddress of SPARK_POOLS) {
      console.log(`\n📊 Checking pool: ${poolAddress}`);
      
      try {
        // Fetch pool state
        const poolState = await cpAmm.fetchPoolState(new PublicKey(poolAddress));
        
        if (poolState) {
          console.log(`✅ Pool state fetched successfully`);
          console.log(`  Token A: ${poolState.tokenAMint.toString()}`);
          console.log(`  Token B: ${poolState.tokenBMint.toString()}`);
          console.log(`  Bin Step: ${poolState.binStep}`);
          console.log(`  Active ID: ${poolState.activeId}`);
          console.log(`  Protocol Fee Rate: ${poolState.protocolFeeRate}`);
          
          // Check if there's a partner fee configuration
          if (poolState.partnerFeeRate && poolState.partnerFeeRate > 0) {
            console.log(`  Partner Fee Rate: ${poolState.partnerFeeRate}`);
            console.log(`  Partner Address: ${poolState.partnerAddress?.toString() || 'Not set'}`);
          } else {
            console.log(`  Partner Fee Rate: 0 (No partner fees configured)`);
          }
          
          console.log(`  Meteora URL: https://app.meteora.ag/pool/${poolAddress}`);
        } else {
          console.log(`❌ Failed to fetch pool state`);
        }
      } catch (error) {
        console.log(`❌ Error fetching pool state: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  }
}

// Run the script
checkPoolPartner().then(() => {
  console.log('\n✅ Script completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
}); 