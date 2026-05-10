import { Keypair, Connection, clusterApiUrl } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import bs58 from "bs58";

import dotenv from 'dotenv';
dotenv.config(); // Load environment variables

// Replace this with your base58-encoded private key string from Phantom
// const privateKeyString = process.env.WALLET_PRIVATE_KEY;
const privateKeyString = process.env.STAGE_PRIVATE_KEY;
// const privateKeyString = process.env.PROD_PRIVATE_KEY;

// Convert base58 string to Uint8Array
const privateKeyUint8Array = bs58.decode(privateKeyString);

// Initialize your wallet
const wallet = Keypair.fromSecretKey(privateKeyUint8Array);

// Connect to the Solana devnet
const connection = new Connection(clusterApiUrl("devnet"));

// Initialize Metaplex with your wallet
const metaplex = Metaplex.make(connection).use(keypairIdentity(wallet));

// Define metadata for the collection NFT
const collectionMetadata = {
  name: "AIDD Liquidity Provider",
  symbol: "bpAIDD",
  uri: "https://files.borgpad.com/bitdoctor/nft-metadata/collection-metadata.json", // Add your collection metadata JSON URL
  sellerFeeBasisPoints: 500, // 5% royalties
};

// Check and enforce name and symbol length constraints
const nameLength = (collectionMetadata.name).length;
const symbolLength = (collectionMetadata.symbol).length;

console.log(nameLength);
console.log(symbolLength);

if (nameLength > 32 || symbolLength > 10) {
  throw new Error("Name or symbol length exceeds the allowed limits.");
}

// Define metadata for individual NFTs
const nftMetadataList = [
  // { name: "NFT 1", uri: "https://example.com/nft11-metadata.json" },
  // { name: "NFT 2", uri: "https://example.com/nft21-metadata.json" },
  // { name: "NFT 3", uri: "https://example.com/nft31-metadata.json" },
  // { name: "NFT 4", uri: "https://example.com/nft41-metadata.json" },
  // { name: "NFT 5", uri: "https://example.com/nft5-metadata.json" },
];

// Function to mint the NFT collection and link child NFTs
async function createNFTCollection() {
  try {
    // 1. Create the collection NFT
    console.log("Creating collection NFT...");
    const { nft: collectionNFT } = await metaplex.nfts().create({
      uri: collectionMetadata.uri,
      name: collectionMetadata.name,
      symbol: collectionMetadata.symbol,
      sellerFeeBasisPoints: collectionMetadata.sellerFeeBasisPoints,
      isCollection: true,
    });
    console.log("Collection NFT Minted:", collectionNFT.address.toBase58());

    // 2. Mint 5 NFTs and link them to the collection
    for (const nftMetadata of nftMetadataList) {
      console.log(`Creating ${nftMetadata.name}...`);
      const { nft } = await metaplex.nfts().create({
        uri: nftMetadata.uri,
        name: nftMetadata.name,
        symbol: "",
        sellerFeeBasisPoints: 500, // 5% royalties for individual NFTs
        collection: collectionNFT.address, // Link to the collection
      });
      console.log(`${nftMetadata.name} Minted:`, nft.address.toBase58());
    }
  } catch (error) {
    console.error("Failed to create NFT collection:", error);
  }
}

// Run the function to create the collection and NFTs
createNFTCollection();
