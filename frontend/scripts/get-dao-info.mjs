#!/usr/bin/env node

import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fetch from 'node-fetch';
import bs58 from 'bs58';

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
  log(`🔍 ${title}`, 'cyan');
  console.log('='.repeat(60));
}

function logSubSection(title) {
  console.log('\n' + '-'.repeat(40));
  log(`📋 ${title}`, 'yellow');
  console.log('-'.repeat(40));
}

async function getAccountInfo(address) {
  try {
    const pubKey = new PublicKey(address);
    const accountInfo = await connection.getAccountInfo(pubKey);
    
    if (!accountInfo) {
      return null;
    }

    return {
      address: address,
      lamports: accountInfo.lamports,
      owner: accountInfo.owner.toString(),
      executable: accountInfo.executable,
      rentEpoch: accountInfo.rentEpoch,
      dataLength: accountInfo.data.length,
      data: accountInfo.data
    };
  } catch (error) {
    log(`❌ Error fetching account info for ${address}: ${error.message}`, 'red');
    return null;
  }
}

async function getTokenAccounts(ownerAddress) {
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

async function getTransactionHistory(address, limit = 20) {
  try {
    const pubKey = new PublicKey(address);
    const signatures = await connection.getSignaturesForAddress(pubKey, { limit });
    
    const transactions = [];
    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0
        });
        
        if (tx) {
          transactions.push({
            signature: sig.signature,
            slot: sig.slot,
            blockTime: sig.blockTime,
            fee: tx.meta?.fee,
            success: tx.meta?.err === null,
            instructions: tx.transaction.message.instructions.length
          });
        }
      } catch (error) {
        // Skip failed transaction fetches
        continue;
      }
    }
    
    return transactions;
  } catch (error) {
    log(`❌ Error fetching transaction history for ${address}: ${error.message}`, 'red');
    return [];
  }
}

async function getHeliusMetadata(address) {
  try {
    // Use Helius API if available, otherwise skip metadata lookup
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      console.log('⚠️  No HELIUS_API_KEY found, skipping metadata lookup');
      return null;
    }
    const response = await fetch(`https://mainnet.helius-rpc.com/v0/addresses/${address}/metadata?api-key=${heliusApiKey}`);
    const data = await response.json();
    return data;
  } catch (error) {
    log(`❌ Error fetching Helius metadata for ${address}: ${error.message}`, 'red');
    return null;
  }
}

async function getJupiterQuote(inputMint, outputMint, amount) {
  try {
    const response = await fetch('https://quote-api.jup.ag/v6/quote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputMint,
        outputMint,
        amount,
        slippageBps: 50,
        onlyDirectRoutes: false,
        asLegacyTransaction: false
      })
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    log(`❌ Error fetching Jupiter quote: ${error.message}`, 'red');
    return null;
  }
}

async function getTokenMetadata(mintAddress) {
  try {
    const response = await fetch(`https://public-api.solscan.io/token/meta?tokenAddress=${mintAddress}`);
    const data = await response.json();
    return data;
  } catch (error) {
    log(`❌ Error fetching token metadata for ${mintAddress}: ${error.message}`, 'red');
    return null;
  }
}

async function main() {
  logSection('DAO Information Gathering Script');
  log(`Target DAO Address: ${DAO_ADDRESS}`, 'green');
  log(`RPC Endpoint: ${RPC_URL}`, 'green');

  // 1. Basic Account Information
  logSubSection('Basic Account Information');
  const accountInfo = await getAccountInfo(DAO_ADDRESS);
  if (accountInfo) {
    log(`✅ Account exists`, 'green');
    log(`💰 Balance: ${accountInfo.lamports / 1e9} SOL`, 'green');
    log(`🏗️  Owner Program: ${accountInfo.owner}`, 'blue');
    log(`📊 Data Size: ${accountInfo.dataLength} bytes`, 'blue');
    log(`🔒 Executable: ${accountInfo.executable}`, 'blue');
    log(`⏰ Rent Epoch: ${accountInfo.rentEpoch}`, 'blue');
  } else {
    log(`❌ Account not found or error occurred`, 'red');
    return;
  }

  // 2. SOL Balance
  logSubSection('SOL Balance');
  const solBalance = await getSolanaBalance(DAO_ADDRESS);
  log(`💰 SOL Balance: ${solBalance} SOL`, 'green');

  // 3. Token Holdings
  logSubSection('Token Holdings');
  const tokenAccounts = await getTokenAccounts(DAO_ADDRESS);
  if (tokenAccounts.length > 0) {
    log(`📊 Found ${tokenAccounts.length} token accounts:`, 'green');
    
    for (const token of tokenAccounts) {
      log(`\n🪙 Token Account: ${token.pubkey}`, 'blue');
      log(`   Mint: ${token.mint}`, 'white');
      log(`   Amount: ${token.amount}`, 'green');
      log(`   Decimals: ${token.decimals}`, 'white');
      log(`   Frozen: ${token.isFrozen}`, 'white');
      
      // Get token metadata
      const tokenMetadata = await getTokenMetadata(token.mint);
      if (tokenMetadata && tokenMetadata.data) {
        log(`   Name: ${tokenMetadata.data.name || 'Unknown'}`, 'cyan');
        log(`   Symbol: ${tokenMetadata.data.symbol || 'Unknown'}`, 'cyan');
        log(`   Logo: ${tokenMetadata.data.logoURI || 'None'}`, 'cyan');
      }
    }
  } else {
    log(`📊 No token accounts found`, 'yellow');
  }

  // 4. Transaction History
  logSubSection('Recent Transaction History');
  const transactions = await getTransactionHistory(DAO_ADDRESS, 10);
  if (transactions.length > 0) {
    log(`📊 Found ${transactions.length} recent transactions:`, 'green');
    
    for (const tx of transactions) {
      const date = new Date(tx.blockTime * 1000).toLocaleString();
      log(`\n🔗 Signature: ${tx.signature}`, 'blue');
      log(`   Date: ${date}`, 'white');
      log(`   Status: ${tx.success ? '✅ Success' : '❌ Failed'}`, tx.success ? 'green' : 'red');
      log(`   Fee: ${tx.fee} lamports`, 'white');
      log(`   Instructions: ${tx.instructions}`, 'white');
      log(`   Slot: ${tx.slot}`, 'white');
    }
  } else {
    log(`📊 No recent transactions found`, 'yellow');
  }

  // 5. Helius Metadata
  logSubSection('Helius Metadata');
  const heliusMetadata = await getHeliusMetadata(DAO_ADDRESS);
  if (heliusMetadata) {
    log(`📊 Helius metadata:`, 'green');
    console.log(JSON.stringify(heliusMetadata, null, 2));
  } else {
    log(`📊 No Helius metadata available`, 'yellow');
  }

  // 6. Token Price Information (if tokens found)
  if (tokenAccounts.length > 0) {
    logSubSection('Token Price Information');
    
    for (const token of tokenAccounts) {
      if (token.amount > 0) {
        log(`\n💰 Price check for ${token.mint}:`, 'blue');
        
        // Try to get a quote from SOL to this token
        const quote = await getJupiterQuote(
          'So11111111111111111111111111111111111111112', // SOL
          token.mint,
          '1000000000' // 1 SOL
        );
        
        if (quote && quote.outAmount) {
          const priceInSol = parseFloat(quote.outAmount) / Math.pow(10, token.decimals);
          log(`   Price: 1 SOL = ${priceInSol} tokens`, 'green');
          
          const tokenValueInSol = token.amount * priceInSol;
          log(`   Total Value: ${tokenValueInSol} SOL`, 'green');
        } else {
          log(`   Price: Unable to fetch price data`, 'yellow');
        }
      }
    }
  }

  // 7. Summary
  logSubSection('Summary');
  log(`🎯 DAO Address: ${DAO_ADDRESS}`, 'cyan');
  log(`💰 Total SOL: ${solBalance} SOL`, 'green');
  log(`🪙 Token Accounts: ${tokenAccounts.length}`, 'green');
  log(`📊 Recent Transactions: ${transactions.length}`, 'green');
  
  const totalTokenValue = tokenAccounts.reduce((sum, token) => {
    // This is a simplified calculation - in reality you'd need proper price feeds
    return sum + (token.amount || 0);
  }, 0);
  
  log(`💎 Total Token Holdings: ${totalTokenValue}`, 'green');

  logSection('Script Completed');
  log(`✅ All information gathered successfully!`, 'green');
}

// Run the script
main().catch(error => {
  log(`❌ Script failed: ${error.message}`, 'red');
  process.exit(1);
}); 