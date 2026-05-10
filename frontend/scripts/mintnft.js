import { Keypair, Connection, clusterApiUrl } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import bs58 from "bs58";

////////////////////////////////////////////////
/////////////// Configuration //////////////////
////////////////////////////////////////////////

// Replace this with your base58-encoded private key string
const privateKeyString = "";

// Define NFT metadata
const metadata = {
  name: "MILAN-FIRST-NFT",
  symbol: "MNFT",
  uri: "https://example.com/metadata.json", // Add your metadata JSON URL here
  sellerFeeBasisPoints: 500, // 5% royalties
};

////////////////////////////////////////////////
///////////// Configuration  End ///////////////
////////////////////////////////////////////////

// Convert base58 string to Uint8Array
const privateKeyUint8Array = bs58.decode(privateKeyString);

// Initialize your wallet
const wallet = Keypair.fromSecretKey(privateKeyUint8Array);

// Connect to the Solana devnet
const connection = new Connection(clusterApiUrl("devnet"));

// Initialize Metaplex with your wallet
const metaplex = Metaplex.make(connection).use(keypairIdentity(wallet));

// Mint the NFT
async function mintNFT() {
  try {
    const { nft } = await metaplex.nfts().create({
      uri: metadata.uri,
      name: metadata.name,
      symbol: metadata.symbol,
      sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
    });

    console.log("NFT Minted:", nft.address.toBase58());
  } catch (error) {
    console.error("Failed to mint NFT:", error);
  }
}

// Run the mint function
mintNFT();
