#!/usr/bin/env node

import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
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
  log(`💰 ${title}`, 'cyan');
  console.log('='.repeat(60));
}

function logSubSection(title) {
  console.log('\n' + '-'.repeat(40));
  log(`📋 ${title}`, 'yellow');
  console.log('-'.repeat(40));
}

async function getGovernanceAccountData(address) {
  try {
    const pubKey = new PublicKey(address);
    const accountInfo = await connection.getAccountInfo(pubKey);
    
    if (!accountInfo) {
      return null;
    }

    // Parse governance account data
    // Governance account structure: https://github.com/solana-labs/solana-program-library/blob/master/governance/program/src/state/governance.rs
    const data = accountInfo.data;
    
    // Basic parsing of governance account
    return {
      address: address,
      dataLength: data.length,
      rawData: data,
      // Governance account typically contains:
      // - Account type discriminator (8 bytes)
      // - Governance config
      // - Realm address
      // - Governing token mint
      // - Governing token supply
      // - Is frozen
      // - Active proposals count
      // - etc.
    };
  } catch (error) {
    log(`❌ Error fetching governance account data: ${error.message}`, 'red');
    return null;
  }
}

async function findTreasuryAccounts(governanceAddress) {
  try {
    const governanceProgramId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
    
    // Get all accounts owned by the governance program that might be treasury accounts
    const accounts = await connection.getProgramAccounts(governanceProgramId, {
      filters: [
        {
          dataSize: 512 // Approximate size of treasury account data
        }
      ]
    });

    // Filter accounts that might be related to our governance
    const relatedAccounts = [];
    for (const account of accounts) {
      try {
        // Check if account data contains our governance address
        const accountData = account.account.data;
        const governanceAddressBytes = new PublicKey(governanceAddress).toBytes();
        
        // Simple check: look for governance address in account data
        for (let i = 0; i <= accountData.length - governanceAddressBytes.length; i++) {
          let match = true;
          for (let j = 0; j < governanceAddressBytes.length; j++) {
            if (accountData[i + j] !== governanceAddressBytes[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            relatedAccounts.push({
              pubkey: account.pubkey.toString(),
              dataSize: accountData.length,
              governanceAddressFound: true
            });
            break;
          }
        }
      } catch (error) {
        // Skip accounts that can't be parsed
        continue;
      }
    }

    return relatedAccounts;
  } catch (error) {
    log(`❌ Error finding treasury accounts: ${error.message}`, 'red');
    return [];
  }
}

async function getTokenAccountsByOwner(ownerAddress) {
  try {
    const pubKey = new PublicKey(ownerAddress);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubKey, {
      programId: TOKEN_PROGRAM_ID
    });

    return tokenAccounts.value.map(account => ({
      pubkey: account.pubkey.toString(),
      mint: account.account.data.parsed.info.mint,
      owner: account.account.data.parsed.info.owner,
      amount: account.account.data.parsed.info.tokenAmount.uiAmount,
      decimals: account.account.data.parsed.info.tokenAmount.decimals,
      isFrozen: account.account.data.parsed.info.state === 'frozen'
    }));
  } catch (error) {
    log(`❌ Error fetching token accounts for ${ownerAddress}: ${error.message}`, 'red');
    return [];
  }
}

async function getSolanaBalance(address) {
  try {
    const pubKey = new PublicKey(address);
    const balance = await connection.getBalance(pubKey);
    return balance / 1e9; // Convert lamports to SOL
  } catch (error) {
    log(`❌ Error fetching SOL balance for ${address}: ${error.message}`, 'red');
    return 0;
  }
}

async function getTransactionHistory(address, limit = 10) {
  try {
    const pubKey = new PublicKey(address);
    const signatures = await connection.getSignaturesForAddress(pubKey, { limit });
    
    return signatures.map(sig => ({
      signature: sig.signature,
      slot: sig.slot,
      blockTime: sig.blockTime,
      err: sig.err
    }));
  } catch (error) {
    log(`❌ Error fetching transaction history for ${address}: ${error.message}`, 'red');
    return [];
  }
}

async function findRelatedWallets(governanceAddress) {
  try {
    // Get recent transactions for the governance address
    const signatures = await connection.getSignaturesForAddress(new PublicKey(governanceAddress), { limit: 50 });
    
    const relatedWallets = new Set();
    
    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0
        });
        
        if (tx && tx.transaction && tx.transaction.message) {
          // Extract all account keys from the transaction
          const accountKeys = tx.transaction.message.accountKeys;
          for (const account of accountKeys) {
            const accountAddress = account.pubkey.toString();
            if (accountAddress !== governanceAddress) {
              relatedWallets.add(accountAddress);
            }
          }
        }
      } catch (error) {
        // Skip failed transaction fetches
        continue;
      }
    }
    
    return Array.from(relatedWallets);
  } catch (error) {
    log(`❌ Error finding related wallets: ${error.message}`, 'red');
    return [];
  }
}

async function analyzeWallet(address, label = 'Wallet') {
  logSubSection(`${label} Analysis: ${address}`);
  
  const solBalance = await getSolanaBalance(address);
  const tokenAccounts = await getTokenAccountsByOwner(address);
  const transactions = await getTransactionHistory(address, 5);
  
  log(`💰 SOL Balance: ${solBalance} SOL`, 'green');
  log(`🪙 Token Accounts: ${tokenAccounts.length}`, 'blue');
  
  if (tokenAccounts.length > 0) {
    log(`\n📊 Token Holdings:`, 'yellow');
    for (const token of tokenAccounts) {
      if (token.amount > 0) {
        log(`   ${token.mint}: ${token.amount}`, 'white');
      }
    }
  }
  
  if (transactions.length > 0) {
    log(`\n📊 Recent Transactions: ${transactions.length}`, 'yellow');
    for (const tx of transactions.slice(0, 3)) {
      const date = new Date(tx.blockTime * 1000).toLocaleString();
      log(`   ${date}: ${tx.signature.slice(0, 8)}...${tx.signature.slice(-8)}`, 'white');
    }
  }
  
  return {
    address,
    solBalance,
    tokenAccounts,
    transactionCount: transactions.length
  };
}

async function main() {
  logSection('DAO Wallet Discovery Script');
  log(`Target DAO Address: ${DAO_ADDRESS}`, 'green');
  log(`RPC Endpoint: ${RPC_URL}`, 'green');

  // 1. Analyze the governance account itself
  logSubSection('Governance Account Analysis');
  const governanceData = await getGovernanceAccountData(DAO_ADDRESS);
  if (governanceData) {
    log(`✅ Governance account found`, 'green');
    log(`📊 Data Size: ${governanceData.dataLength} bytes`, 'blue');
    log(`🔑 Address: ${governanceData.address}`, 'blue');
  }

  // 2. Find treasury accounts
  logSubSection('Treasury Account Search');
  const treasuryAccounts = await findTreasuryAccounts(DAO_ADDRESS);
  log(`📊 Found ${treasuryAccounts.length} potential treasury accounts`, 'green');
  
  if (treasuryAccounts.length > 0) {
    for (const account of treasuryAccounts.slice(0, 5)) {
      log(`\n🏦 Treasury Account: ${account.pubkey}`, 'blue');
      log(`   Data Size: ${account.dataSize} bytes`, 'white');
      log(`   Related to Governance: ${account.governanceAddressFound ? 'Yes' : 'No'}`, 'white');
    }
  }

  // 3. Find related wallets from transaction history
  logSubSection('Related Wallet Discovery');
  const relatedWallets = await findRelatedWallets(DAO_ADDRESS);
  log(`📊 Found ${relatedWallets.length} related wallet addresses`, 'green');
  
  // Analyze the most promising wallets (those with significant activity)
  const walletAnalysis = [];
  for (const wallet of relatedWallets.slice(0, 10)) {
    try {
      const analysis = await analyzeWallet(wallet, 'Related Wallet');
      walletAnalysis.push(analysis);
    } catch (error) {
      log(`❌ Error analyzing wallet ${wallet}: ${error.message}`, 'red');
    }
  }

  // 4. Identify potential DAO treasury wallets
  logSubSection('Potential DAO Treasury Wallets');
  
  // Sort wallets by SOL balance and token holdings
  const sortedWallets = walletAnalysis
    .filter(wallet => wallet.solBalance > 0 || wallet.tokenAccounts.length > 0)
    .sort((a, b) => {
      // Prioritize wallets with higher SOL balance and more tokens
      const aScore = a.solBalance * 1000 + a.tokenAccounts.length * 100 + a.transactionCount;
      const bScore = b.solBalance * 1000 + b.tokenAccounts.length * 100 + b.transactionCount;
      return bScore - aScore;
    });

  if (sortedWallets.length > 0) {
    log(`🏆 Top Potential DAO Treasury Wallets:`, 'yellow');
    
    for (let i = 0; i < Math.min(sortedWallets.length, 5); i++) {
      const wallet = sortedWallets[i];
      log(`\n${i + 1}. ${wallet.address}`, 'cyan');
      log(`   💰 SOL: ${wallet.solBalance}`, 'green');
      log(`   🪙 Tokens: ${wallet.tokenAccounts.length}`, 'blue');
      log(`   📊 Transactions: ${wallet.transactionCount}`, 'white');
      
      // Show token details
      if (wallet.tokenAccounts.length > 0) {
        const sparkTokens = wallet.tokenAccounts.filter(t => 
          t.mint === 'SPaRKoVUfuj8FSnmbZmwAD1xP1jPEB4Vik8sgVxnJPq' && t.amount > 0
        );
        if (sparkTokens.length > 0) {
          log(`   ✨ Spark Tokens: ${sparkTokens[0].amount}`, 'magenta');
        }
      }
    }
  } else {
    log(`❌ No potential treasury wallets found`, 'red');
  }

  // 5. Check for specific known DAO treasury patterns
  logSubSection('Known DAO Treasury Patterns');
  
  // Common treasury wallet patterns
  const treasuryPatterns = [
    // Add any known treasury wallet addresses here
    // Example: 'TreasuryWalletAddress123...'
  ];
  
  for (const pattern of treasuryPatterns) {
    try {
      const analysis = await analyzeWallet(pattern, 'Known Treasury');
      log(`✅ Found known treasury pattern: ${pattern}`, 'green');
    } catch (error) {
      // Pattern not found or invalid
    }
  }

  // 6. Summary
  logSubSection('DAO Wallet Summary');
  log(`🏛️  Governance Address: ${DAO_ADDRESS}`, 'cyan');
  log(`🏦 Treasury Accounts Found: ${treasuryAccounts.length}`, 'green');
  log(`👥 Related Wallets Found: ${relatedWallets.length}`, 'green');
  log(`💰 Analyzed Wallets: ${walletAnalysis.length}`, 'green');
  
  if (sortedWallets.length > 0) {
    const topWallet = sortedWallets[0];
    log(`🏆 Most Likely Treasury: ${topWallet.address}`, 'magenta');
    log(`   💰 SOL Balance: ${topWallet.solBalance}`, 'green');
    log(`   🪙 Token Accounts: ${topWallet.tokenAccounts.length}`, 'blue');
  }

  logSection('DAO Wallet Discovery Completed');
  log(`✅ Wallet analysis completed successfully!`, 'green');
}

// Run the script
main().catch(error => {
  log(`❌ Script failed: ${error.message}`, 'red');
  process.exit(1);
}); 