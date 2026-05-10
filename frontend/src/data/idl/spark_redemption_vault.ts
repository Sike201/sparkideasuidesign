/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/spark_redemption_vault.json`.
 */
export type SparkRedemptionVault = {
  "address": "HjxL5eioDknBcoQAymHQkn9VHzWRqZe3CtSyw7U8vRq1",
  "metadata": {
    "name": "sparkRedemptionVault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Spark: redemption vault — burn loser Ideacoin tokens against USDG at a fixed rate after a failed TWAP decision market"
  },
  "instructions": [
    {
      "name": "initializeAndDeposit",
      "docs": [
        "Initialize the redemption vault for an idea AND deposit the full USDG pot in one tx.",
        "",
        "* `idea_id`       — human-readable idea identifier (≤ 64 chars, display only)",
        "* `vault_seed`    — SHA256(idea_id), used as the PDA seed (32-byte cap)",
        "* `rate_num`      — numerator of the fixed redemption rate",
        "* `rate_den`      — denominator of the fixed redemption rate",
        "→ `usdg_out = floor(tokens_in * rate_num / rate_den)`",
        "* `deposit_amount`— amount of USDG (base units) the admin seeds the vault with"
      ],
      "discriminator": [
        18,
        152,
        143,
        221,
        235,
        239,
        245,
        30
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Only the hard-coded INITIAL_ADMIN can create vaults.",
            "Prevents third parties from squatting a PDA with bogus rate/deposit params."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "One vault per idea_id. Seed = SHA256(idea_id) to stay within Solana's 32-byte limit."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  100,
                  101,
                  109,
                  112,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "vaultSeed"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "docs": [
            "The loser Ideacoin mint. Decimals are read for event logging; the burn itself",
            "is checked against this mint."
          ]
        },
        {
          "name": "usdgMint",
          "docs": [
            "USDG mint used as the payout token."
          ]
        },
        {
          "name": "authorityUsdgAccount",
          "docs": [
            "Authority's USDG source account — the pot is pulled from here."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "usdgTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdgMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultUsdgAta",
          "docs": [
            "Vault's USDG ATA. Authority is the vault PDA so the program can sign transfers."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "usdgTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdgMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "usdgTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "ideaId",
          "type": "string"
        },
        {
          "name": "vaultSeed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "rateNum",
          "type": "u64"
        },
        {
          "name": "rateDen",
          "type": "u64"
        },
        {
          "name": "depositAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "reclaimRemainder",
      "docs": [
        "After the deadline, the authority can sweep the remaining USDG, close the vault USDG ATA,",
        "and close the vault account itself — refunding the rent to the authority."
      ],
      "discriminator": [
        146,
        231,
        239,
        179,
        221,
        135,
        118,
        196
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "docs": [
            "Closed at the end of the ix — rent refunded to `authority`."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  100,
                  101,
                  109,
                  112,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault.vault_seed",
                "account": "redemptionVault"
              }
            ]
          }
        },
        {
          "name": "usdgMint"
        },
        {
          "name": "vaultUsdgAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "usdgTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdgMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "authorityUsdgAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "usdgTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdgMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdgTokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "redeem",
      "docs": [
        "User burns `tokens_in` of the loser Ideacoin and receives USDG at the fixed rate.",
        "Callable until `vault.deadline`."
      ],
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  100,
                  101,
                  109,
                  112,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault.vault_seed",
                "account": "redemptionVault"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "docs": [
            "Loser Ideacoin mint — MUST be writable because `burn` decreases the mint's supply."
          ],
          "writable": true
        },
        {
          "name": "usdgMint"
        },
        {
          "name": "userTokenAccount",
          "docs": [
            "User's loser-token account — tokens are burned from here."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "userUsdgAccount",
          "docs": [
            "User's USDG destination account — created if it doesn't exist."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "account",
                "path": "usdgTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdgMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultUsdgAta",
          "docs": [
            "Vault's USDG ATA (source for the payout)."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "usdgTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdgMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "docs": [
            "Token program for the loser Ideacoin (may be Token or Token-2022)."
          ]
        },
        {
          "name": "usdgTokenProgram",
          "docs": [
            "Token program for USDG (mainnet USDG is classic SPL Token)."
          ]
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "tokensIn",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "redemptionVault",
      "discriminator": [
        76,
        171,
        19,
        58,
        196,
        239,
        84,
        140
      ]
    }
  ],
  "events": [
    {
      "name": "redemptionInitialized",
      "discriminator": [
        106,
        200,
        100,
        114,
        148,
        100,
        38,
        203
      ]
    },
    {
      "name": "remainderReclaimed",
      "discriminator": [
        32,
        133,
        173,
        48,
        219,
        245,
        35,
        246
      ]
    },
    {
      "name": "userRedeemed",
      "discriminator": [
        158,
        165,
        185,
        4,
        94,
        204,
        37,
        237
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "ideaIdEmpty",
      "msg": "Idea id cannot be empty"
    },
    {
      "code": 6001,
      "name": "ideaIdTooLong",
      "msg": "Idea id must be 64 characters or less"
    },
    {
      "code": 6002,
      "name": "invalidVaultSeed",
      "msg": "Vault seed must be SHA256(idea_id)"
    },
    {
      "code": 6003,
      "name": "invalidRate",
      "msg": "Rate numerator and denominator must be > 0"
    },
    {
      "code": 6004,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6005,
      "name": "payoutTooSmall",
      "msg": "Payout rounds to zero — increase amount redeemed"
    },
    {
      "code": 6006,
      "name": "insufficientVaultBalance",
      "msg": "Vault USDG balance is insufficient for this redemption"
    },
    {
      "code": 6007,
      "name": "unauthorizedMint",
      "msg": "Unauthorized USDG mint"
    },
    {
      "code": 6008,
      "name": "vaultClosed",
      "msg": "Vault is closed"
    },
    {
      "code": 6009,
      "name": "deadlinePassed",
      "msg": "Redemption deadline has passed"
    },
    {
      "code": 6010,
      "name": "deadlineNotReached",
      "msg": "Redemption deadline has not been reached yet"
    },
    {
      "code": 6011,
      "name": "nothingToReclaim",
      "msg": "Nothing to reclaim — vault is empty"
    },
    {
      "code": 6012,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6013,
      "name": "unauthorized",
      "msg": "Signer is not authorized to perform this action"
    }
  ],
  "types": [
    {
      "name": "redemptionInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "ideaId",
            "type": "string"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "usdgMint",
            "type": "pubkey"
          },
          {
            "name": "rateNum",
            "type": "u64"
          },
          {
            "name": "rateDen",
            "type": "u64"
          },
          {
            "name": "depositAmount",
            "type": "u64"
          },
          {
            "name": "deadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "redemptionVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "ideaId",
            "type": "string"
          },
          {
            "name": "vaultSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "usdgMint",
            "type": "pubkey"
          },
          {
            "name": "vaultUsdgAta",
            "type": "pubkey"
          },
          {
            "name": "rateNum",
            "type": "u64"
          },
          {
            "name": "rateDen",
            "type": "u64"
          },
          {
            "name": "totalUsdgDeposited",
            "type": "u64"
          },
          {
            "name": "totalUsdgClaimed",
            "type": "u64"
          },
          {
            "name": "totalTokensBurned",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "closed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "remainderReclaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "userRedeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "tokensBurned",
            "type": "u64"
          },
          {
            "name": "usdgOut",
            "type": "u64"
          },
          {
            "name": "totalTokensBurned",
            "type": "u64"
          },
          {
            "name": "totalUsdgClaimed",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
