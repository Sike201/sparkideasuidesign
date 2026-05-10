# Spark Idea Vault - Smart Contracts Solana

Un programme Solana (Anchor) qui permet de gérer des **vaults on-chain** : une adresse (PDA) par idée, dépôts et retraits en USDC.

## Informations du Programme

| Info | Valeur |
|------|--------|
| **Program ID** | `8u9AUqFv25xUpXqVwE83EiQ91YkvJbmsa5BheTVb3xvZ` |
| **Anchor Version** | 0.31.1 |
| **Solana Version** | 3.0.13+ |

## Fonctionnalités

| Instruction | Description |
|-------------|-------------|
| `initialize_vault(idea_id)` | Crée un vault pour une idée (PDA + compte token ATA) |
| `deposit(amount)` | L'utilisateur dépose des tokens (USDC) dans le vault |
| `withdraw(amount)` | L'utilisateur retire ses tokens du vault |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Programme Solana                        │
│                   (spark_idea_vault)                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │   Vault     │     │  Vault ATA  │     │ UserDeposit │   │
│  │   (PDA)     │────▶│  (Tokens)   │     │   (PDA)     │   │
│  │             │     │             │     │             │   │
│  │ - idea_id   │     │ - USDC      │     │ - user      │   │
│  │ - bump      │     │ - balance   │     │ - vault     │   │
│  │ - mint      │     │             │     │ - amount    │   │
│  │ - vault_ata │     │             │     │             │   │
│  │ - total     │     │             │     │             │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Prérequis

```bash
# Versions requises
rustc --version   # >= 1.93.0
solana --version  # >= 3.0.0
anchor --version  # >= 0.31.1
node --version    # >= 18.0.0
```

### Installation des outils

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable
rustup default stable

# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.31.1
avm use 0.31.1
```

## Structure du Projet

```
onchain/
├── Anchor.toml                    # Configuration Anchor
├── Cargo.toml                     # Workspace Rust
├── package.json                   # Dépendances Node.js
├── programs/
│   └── spark_idea_vault/
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs             # Code du programme
├── target/
│   ├── deploy/
│   │   ├── spark_idea_vault.so          # Programme compilé
│   │   └── spark_idea_vault-keypair.json # Clé du programme
│   └── idl/
│       └── spark_idea_vault.json        # Interface (IDL)
├── tests/
│   └── spark_idea_vault.ts        # Tests TypeScript
└── README.md
```

## Installation

```bash
cd onchain
npm install
```

## Build

```bash
# Build le programme
anchor build

# ou via npm
npm run build
```

## Tests

### Lancer les tests en local

```bash
# Démarrer un validateur local (dans un terminal séparé)
solana-test-validator

# Lancer les tests
anchor test

# ou avec plus de détails
anchor test --skip-local-validator
```

### Lancer les tests sur Devnet

```bash
# Configurer Solana pour devnet
solana config set --url devnet

# S'assurer d'avoir des SOL
solana airdrop 2

# Déployer sur devnet d'abord
anchor deploy --provider.cluster devnet

# Lancer les tests sur devnet
anchor test --provider.cluster devnet --skip-deploy
```

## Déploiement

### Étape 1 : Configurer le wallet

```bash
# Créer un wallet si vous n'en avez pas
solana-keygen new -o ~/.config/solana/id.json

# Vérifier votre adresse
solana address
```

### Étape 2 : Déployer sur Devnet

```bash
# Configurer pour devnet
solana config set --url devnet

# Obtenir des SOL de test (gratuit)
solana airdrop 2

# Vérifier le solde
solana balance

# Déployer le programme
npm run deploy:devnet
# ou
anchor deploy --provider.cluster devnet
```

> **Erreur 403 au déploiement ?** Le RPC officiel renvoie souvent 403. Le projet est configuré pour Helius : créez une clé gratuite sur [Helius](https://dashboard.helius.dev), puis dans `Anchor.toml` remplacez `YOUR_HELIUS_API_KEY` par votre clé (dans la valeur `cluster`). **En ligne de commande, mettez toujours l’URL entre guillemets** à cause du `?` : `solana config set --url "https://devnet.helius-rpc.com/?api-key=MA_CLE"`.

### Étape 3 : Vérifier le déploiement

```bash
# Voir les infos du programme
solana program show 8u9AUqFv25xUpXqVwE83EiQ91YkvJbmsa5BheTVb3xvZ

# Voir sur l'explorateur
# https://explorer.solana.com/address/8u9AUqFv25xUpXqVwE83EiQ91YkvJbmsa5BheTVb3xvZ?cluster=devnet
```

### Étape 4 : Déployer sur Mainnet (Production)

```bash
# Configurer pour mainnet
solana config set --url mainnet-beta

# Vérifier que vous avez assez de SOL (~2-3 SOL pour le déploiement)
solana balance

# Déployer le programme
npm run deploy:mainnet
# ou
anchor deploy --provider.cluster mainnet
```

## Utilisation avec le Frontend/Backend

### Adresses USDC

| Network | Adresse USDC |
|---------|--------------|
| Devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Mainnet | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

### Exemple TypeScript : Créer un Vault

```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("8u9AUqFv25xUpXqVwE83EiQ91YkvJbmsa5BheTVb3xvZ");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // Mainnet

async function initializeVault(ideaId: string) {
  // Dériver l'adresse du vault
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(ideaId)],
    PROGRAM_ID
  );

  // Dériver l'ATA du vault
  const vaultAta = await getAssociatedTokenAddress(USDC_MINT, vaultPda, true);

  // Créer la transaction
  await program.methods
    .initializeVault(ideaId)
    .accounts({
      payer: wallet.publicKey,
      vault: vaultPda,
      mint: USDC_MINT,
      vaultAta: vaultAta,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("Vault créé:", vaultPda.toBase58());
  return vaultPda;
}
```

### Exemple TypeScript : Déposer des tokens

```typescript
async function deposit(ideaId: string, amount: number) {
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(ideaId)],
    PROGRAM_ID
  );

  const [userDepositPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("deposit"), vaultPda.toBuffer(), wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );

  const vaultAta = await getAssociatedTokenAddress(USDC_MINT, vaultPda, true);
  const userTokenAccount = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);

  await program.methods
    .deposit(new anchor.BN(amount))
    .accounts({
      user: wallet.publicKey,
      vault: vaultPda,
      userTokenAccount: userTokenAccount,
      vaultAta: vaultAta,
      userDeposit: userDepositPda,
      mint: USDC_MINT,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log(`Déposé ${amount / 1_000_000} USDC`);
}
```

### Exemple TypeScript : Retirer des tokens

```typescript
async function withdraw(ideaId: string, amount: number) {
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(ideaId)],
    PROGRAM_ID
  );

  const [userDepositPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("deposit"), vaultPda.toBuffer(), wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );

  const vaultAta = await getAssociatedTokenAddress(USDC_MINT, vaultPda, true);
  const userTokenAccount = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);

  await program.methods
    .withdraw(new anchor.BN(amount))
    .accounts({
      user: wallet.publicKey,
      vault: vaultPda,
      userDeposit: userDepositPda,
      userTokenAccount: userTokenAccount,
      vaultAta: vaultAta,
      mint: USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log(`Retiré ${amount / 1_000_000} USDC`);
}
```

## Comptes et PDAs

| Compte | Seeds | Description |
|--------|-------|-------------|
| `IdeaVault` | `["vault", idea_id]` | Métadonnées du vault |
| `UserDeposit` | `["deposit", vault, user]` | Montant déposé par utilisateur |
| `vault_ata` | Associated Token Account | Tokens USDC du vault |

## Erreurs

| Code | Nom | Description |
|------|-----|-------------|
| 6000 | `IdeaIdTooLong` | L'ID de l'idée dépasse 64 caractères |
| 6001 | `InvalidAmount` | Le montant doit être supérieur à zéro |
| 6002 | `InsufficientDeposit` | Fonds insuffisants pour le retrait |
| 6003 | `Overflow` | Dépassement arithmétique |
| 6004 | `InvalidMint` | Le mint ne correspond pas |
| 6005 | `InvalidVaultAta` | L'ATA du vault ne correspond pas |
| 6006 | `Unauthorized` | Non autorisé |

## Scripts NPM

```bash
npm run build         # Compiler le programme
npm run test          # Lancer les tests
npm run deploy:devnet # Déployer sur devnet
npm run deploy:mainnet # Déployer sur mainnet
npm run lint          # Vérifier le formatage
npm run lint:fix      # Corriger le formatage
```

## Sécurité

- Ne jamais commiter `target/deploy/*-keypair.json`
- Utiliser des wallets séparés pour devnet et mainnet
- Vérifier les montants et les validations avant le déploiement en prod
- Tester exhaustivement sur devnet avant mainnet

## Dépannage

### "Program id does not match"
```bash
anchor keys sync
anchor build
```

### "Insufficient funds"
```bash
# Sur devnet
solana airdrop 2

# Sur mainnet, transférer des SOL vers votre wallet
```

### "constant_time_eq edition2024 error"
Ce problème est résolu par le patch dans `Cargo.toml` qui force `blake3` version 1.5.5.

### Tests qui échouent
```bash
# Nettoyer et reconstruire
cargo clean
rm -f Cargo.lock
anchor build
anchor test
```

## Liens Utiles

- [Explorer Solana (Devnet)](https://explorer.solana.com/?cluster=devnet)
- [Explorer Solana (Mainnet)](https://explorer.solana.com/)
- [Documentation Anchor](https://www.anchor-lang.com/)
- [Documentation Solana](https://docs.solana.com/)
