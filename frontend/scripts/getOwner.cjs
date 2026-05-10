const { Connection, PublicKey } = require('@solana/web3.js');

async function getTokenOwner(mintAddress) {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const mintPublicKey = new PublicKey(mintAddress);

  try {
    // Fetch the largest accounts holding this token
    const largestAccounts = await connection.getTokenLargestAccounts(mintPublicKey);

    if (!largestAccounts.value || largestAccounts.value.length === 0) {
      console.log("No token accounts hold this mint.");
      return null;
    }

    const largestAccountInfo = largestAccounts.value[0]; // Take the largest account as reference
    const tokenAccountPublicKey = largestAccountInfo.address;

    console.log(`Largest account address: ${tokenAccountPublicKey.toBase58()}`);

    // Fetch the account info for the largest account
    const tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccountPublicKey);

    if (tokenAccountInfo.value) {
      const accountData = tokenAccountInfo.value.data;
      if (accountData && accountData.parsed && accountData.parsed.info.owner) {
        const owner = accountData.parsed.info.owner;
        console.log(`Owner of the token account: ${owner}`);
        return owner;
      } else {
        console.log("Account data is available but doesn't contain owner information.");
      }
    } else {
      console.log("No data found for this token account.");
    }
  } catch (error) {
    console.error("An error occurred while fetching token owner information:", error);
  }

  return null;
}

// Replace with your mint address
const mintAddress = '';
getTokenOwner(mintAddress);
