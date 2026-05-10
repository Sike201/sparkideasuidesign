#!/usr/bin/env node

import { Connection, PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';

// Configuration
const DAO_ADDRESS = '7tf9gzTYGNY6Cmsk1thS2H858Sexq6BzwoJQpNTdLb3y';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(`🏛️  ${title}`, 'cyan');
  console.log('='.repeat(60));
}

function logSubSection(title) {
  console.log('\n' + '-'.repeat(40));
  log(`📋 ${title}`, 'yellow');
  console.log('-'.repeat(40));
}

async function getGovernanceProgramAccounts() {
  try {
    const governanceProgramId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
    
    // Get all accounts owned by the governance program
    const accounts = await connection.getProgramAccounts(governanceProgramId, {
      filters: [
        {
          dataSize: 276 // Size of governance account data
        }
      ]
    });

    return accounts;
  } catch (error) {
    log(`❌ Error fetching governance accounts: ${error.message}`, 'red');
    return [];
  }
}

async function getProposals(governanceAddress) {
  try {
    const governanceProgramId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
    
    // Get all proposal accounts for this governance
    const proposals = await connection.getProgramAccounts(governanceProgramId, {
      filters: [
        {
          dataSize: 1024 // Approximate size of proposal account data
        },
        {
          memcmp: {
            offset: 0,
            bytes: governanceAddress
          }
        }
      ]
    });

    return proposals;
  } catch (error) {
    log(`❌ Error fetching proposals: ${error.message}`, 'red');
    return [];
  }
}

async function getVoteRecords(proposalAddress) {
  try {
    const governanceProgramId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
    
    // Get all vote records for this proposal
    const voteRecords = await connection.getProgramAccounts(governanceProgramId, {
      filters: [
        {
          dataSize: 512 // Approximate size of vote record account data
        },
        {
          memcmp: {
            offset: 0,
            bytes: proposalAddress
          }
        }
      ]
    });

    return voteRecords;
  } catch (error) {
    log(`❌ Error fetching vote records: ${error.message}`, 'red');
    return [];
  }
}

async function getTokenMetadata(mintAddress) {
  try {
    const response = await fetch(`https://public-api.solscan.io/token/meta?tokenAddress=${mintAddress}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    log(`❌ Error fetching token metadata for ${mintAddress}: ${error.message}`, 'red');
    return null;
  }
}

async function getSolscanTokenInfo(mintAddress) {
  try {
    const response = await fetch(`https://public-api.solscan.io/token/meta?tokenAddress=${mintAddress}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    log(`❌ Error fetching Solscan token info for ${mintAddress}: ${error.message}`, 'red');
    return null;
  }
}

async function getBirdeyeTokenInfo(mintAddress) {
  try {
    const response = await fetch(`https://public-api.birdeye.so/public/token_list?address=${mintAddress}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    log(`❌ Error fetching Birdeye token info for ${mintAddress}: ${error.message}`, 'red');
    return null;
  }
}

async function getJupiterTokenInfo(mintAddress) {
  try {
    const response = await fetch(`https://price.jup.ag/v4/price?ids=${mintAddress}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    log(`❌ Error fetching Jupiter token info for ${mintAddress}: ${error.message}`, 'red');
    return null;
  }
}

async function main() {
  logSection('DAO Governance Information Gathering Script');
  log(`Target DAO Address: ${DAO_ADDRESS}`, 'green');
  log(`RPC Endpoint: ${RPC_URL}`, 'green');

  // 1. Governance Program Analysis
  logSubSection('Governance Program Analysis');
  const governanceAccounts = await getGovernanceProgramAccounts();
  log(`📊 Found ${governanceAccounts.length} governance accounts`, 'green');
  
  // Find our specific governance account
  const ourGovernance = governanceAccounts.find(acc => 
    acc.pubkey.toString() === DAO_ADDRESS
  );
  
  if (ourGovernance) {
    log(`✅ Found our governance account!`, 'green');
    log(`🔑 Public Key: ${ourGovernance.pubkey.toString()}`, 'blue');
    log(`📊 Data Size: ${ourGovernance.account.data.length} bytes`, 'blue');
  } else {
    log(`❌ Our governance account not found in program accounts`, 'red');
  }

  // 2. Token Analysis (SPaRKoVUfuj8FSnmbZmwAD1xP1jPEB4Vik8sgVxnJPq)
  logSubSection('Governance Token Analysis');
  const governanceTokenMint = 'SPaRKoVUfuj8FSnmbZmwAD1xP1jPEB4Vik8sgVxnJPq';
  
  log(`🪙 Governance Token Mint: ${governanceTokenMint}`, 'blue');
  
  // Get token metadata from multiple sources
  const solscanInfo = await getSolscanTokenInfo(governanceTokenMint);
  if (solscanInfo && solscanInfo.data) {
    log(`📊 Solscan Token Info:`, 'green');
    log(`   Name: ${solscanInfo.data.name || 'Unknown'}`, 'cyan');
    log(`   Symbol: ${solscanInfo.data.symbol || 'Unknown'}`, 'cyan');
    log(`   Decimals: ${solscanInfo.data.decimals || 'Unknown'}`, 'cyan');
    log(`   Logo: ${solscanInfo.data.logoURI || 'None'}`, 'cyan');
    log(`   Website: ${solscanInfo.data.website || 'None'}`, 'cyan');
    log(`   Description: ${solscanInfo.data.description || 'None'}`, 'cyan');
  }

  const birdeyeInfo = await getBirdeyeTokenInfo(governanceTokenMint);
  if (birdeyeInfo && birdeyeInfo.data && birdeyeInfo.data.length > 0) {
    const token = birdeyeInfo.data[0];
    log(`📊 Birdeye Token Info:`, 'green');
    log(`   Name: ${token.name || 'Unknown'}`, 'cyan');
    log(`   Symbol: ${token.symbol || 'Unknown'}`, 'cyan');
    log(`   Price: $${token.price || 'Unknown'}`, 'cyan');
    log(`   Market Cap: $${token.mc || 'Unknown'}`, 'cyan');
    log(`   Volume 24h: $${token.volume24h || 'Unknown'}`, 'cyan');
  }

  const jupiterInfo = await getJupiterTokenInfo(governanceTokenMint);
  if (jupiterInfo && jupiterInfo.data && jupiterInfo.data[governanceTokenMint]) {
    const tokenData = jupiterInfo.data[governanceTokenMint];
    log(`📊 Jupiter Token Info:`, 'green');
    log(`   Price: $${tokenData.price || 'Unknown'}`, 'cyan');
    log(`   Price Change 24h: ${tokenData.priceChange24h || 'Unknown'}%`, 'cyan');
  }

  // 3. Proposals Analysis
  logSubSection('Proposals Analysis');
  const proposals = await getProposals(DAO_ADDRESS);
  log(`📊 Found ${proposals.length} proposals for this governance`, 'green');
  
  if (proposals.length > 0) {
    for (let i = 0; i < Math.min(proposals.length, 5); i++) {
      const proposal = proposals[i];
      log(`\n📋 Proposal ${i + 1}:`, 'blue');
      log(`   Address: ${proposal.pubkey.toString()}`, 'white');
      log(`   Data Size: ${proposal.account.data.length} bytes`, 'white');
      
      // Get vote records for this proposal
      const voteRecords = await getVoteRecords(proposal.pubkey.toString());
      log(`   Vote Records: ${voteRecords.length}`, 'white');
    }
  }

  // 4. Transaction Analysis
  logSubSection('Recent Governance Transactions');
  try {
    const signatures = await connection.getSignaturesForAddress(new PublicKey(DAO_ADDRESS), { limit: 20 });
    
    log(`📊 Found ${signatures.length} recent transactions:`, 'green');
    
    // Group transactions by date
    const transactionsByDate = {};
    for (const sig of signatures) {
      const date = new Date(sig.blockTime * 1000).toLocaleDateString();
      if (!transactionsByDate[date]) {
        transactionsByDate[date] = [];
      }
      transactionsByDate[date].push(sig);
    }
    
    for (const [date, txs] of Object.entries(transactionsByDate)) {
      log(`\n📅 ${date}: ${txs.length} transactions`, 'yellow');
      for (const tx of txs.slice(0, 3)) { // Show max 3 per day
        const time = new Date(tx.blockTime * 1000).toLocaleTimeString();
        log(`   ${time}: ${tx.signature.slice(0, 8)}...${tx.signature.slice(-8)}`, 'white');
      }
      if (txs.length > 3) {
        log(`   ... and ${txs.length - 3} more`, 'white');
      }
    }
  } catch (error) {
    log(`❌ Error analyzing transactions: ${error.message}`, 'red');
  }

  // 5. Token Distribution Analysis
  logSubSection('Token Distribution Analysis');
  try {
    // Get all token accounts for the governance token
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(governanceTokenMint),
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );
    
    log(`📊 Found ${tokenAccounts.value.length} token holders`, 'green');
    
    // Analyze top holders
    const holders = tokenAccounts.value
      .map(acc => ({
        address: acc.pubkey.toString(),
        amount: acc.account.data.parsed.info.tokenAmount.uiAmount,
        decimals: acc.account.data.parsed.info.tokenAmount.decimals
      }))
      .filter(holder => holder.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    
    if (holders.length > 0) {
      log(`\n🏆 Top 10 Token Holders:`, 'yellow');
      for (let i = 0; i < Math.min(holders.length, 10); i++) {
        const holder = holders[i];
        log(`   ${i + 1}. ${holder.address.slice(0, 8)}...${holder.address.slice(-8)}: ${holder.amount}`, 'white');
      }
      
      const totalSupply = holders.reduce((sum, holder) => sum + holder.amount, 0);
      log(`\n📊 Total Supply: ${totalSupply}`, 'green');
      
      if (holders.length > 0) {
        const topHolderPercentage = (holders[0].amount / totalSupply) * 100;
        log(`🏆 Top Holder: ${topHolderPercentage.toFixed(2)}% of total supply`, 'cyan');
      }
    }
  } catch (error) {
    log(`❌ Error analyzing token distribution: ${error.message}`, 'red');
  }

  // 6. Summary
  logSubSection('Governance Summary');
  log(`🏛️  DAO Address: ${DAO_ADDRESS}`, 'cyan');
  log(`🪙 Governance Token: ${governanceTokenMint}`, 'cyan');
  log(`📊 Total Proposals: ${proposals.length}`, 'green');
  log(`📊 Governance Accounts: ${governanceAccounts.length}`, 'green');
  
  // Check if this is a Spark DAO
  if (governanceTokenMint === 'SPaRKoVUfuj8FSnmbZmwAD1xP1jPEB4Vik8sgVxnJPq') {
    log(`✨ This appears to be the Spark DAO!`, 'magenta');
  }

  logSection('Governance Analysis Completed');
  log(`✅ All governance information gathered successfully!`, 'green');
}

// Run the script
main().catch(error => {
  log(`❌ Script failed: ${error.message}`, 'red');
  process.exit(1);
}); 