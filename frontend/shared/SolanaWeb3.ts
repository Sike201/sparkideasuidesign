import { COMMITMENT_LEVEL } from "./constants"

type GetSplTokenBalanceArgs = {
  address: string
  tokenAddress: string
  rpcUrl: string
}
/**
 * Returns SPL token balance for address at tokenAddress.
 * Returns null if balance is not found.
 * @param address
 * @param tokenAddress
 * @param rpcUrl
 */
export async function getSplTokenBalance({
  address,
  tokenAddress,
  rpcUrl,
}: GetSplTokenBalanceArgs): Promise<TokenAmount | null> {
  // TODO add error handling/reporting here

  const getTokenAccountsByOwnerResponse = await fetch(rpcUrl, {
    method: "post",
    headers: {
      "Content-Type": "application/json", // Specify the content type
    },
    body: JSON.stringify({
      id: uuidv4(),
      method: "getTokenAccountsByOwner",
      jsonrpc: "2.0",
      params: [
        address,
        {
          mint: tokenAddress,
        },
        {
          encoding: "jsonParsed",
          commitment: COMMITMENT_LEVEL,
        },
      ],
    }),
  })

  const getTokenAccountsByOwner: RpcResponseGetTokenAccountsByOwner =
    await getTokenAccountsByOwnerResponse.json()

  if (!getTokenAccountsByOwner.result?.value.length) {
    // console.log({ tokenAccounts: getTokenAccountsByOwner.result })
    return null
  }

  return getTokenAccountsByOwner.result.value[0].account.data.parsed.info
    .tokenAmount
}

/**
 * Stolen from https://stackoverflow.com/a/2117523
 */
function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16),
  )
}

/**
 * The level of commitment desired when querying state:
 *  - 'processed': Query the most recent block which has reached 1 confirmation by the connected node
 *  - 'confirmed': Query the most recent block which has reached 1 confirmation by the cluster
 *  - 'finalized': Query the most recent block which has been finalized by the cluster
 * Solana Commitment Status: https://docs.solanalabs.com/consensus/commitments
 */
export type Commitment = "processed" | "confirmed" | "finalized"

/**
 * Structure representing the balance of a token
 * https://solana.com/docs/rpc/json-structures#token-balances
 */
export type TokenAmount = {
  /**
   * Raw amount of tokens as a string, ignoring decimals
   */
  amount: string
  /**
   * Number of decimals configured for token's mint.
   */
  decimals: number
  /**
   * Token amount as a float, accounting for decimals.
   * @deprecated
   */
  uiAmount: number | null
  /**
   * Token amount as a string, accounting for decimals.
   */
  uiAmountString: string
}

type RpcResponseGetTokenAccountsByOwner = RpcResponse<{
  isNative: boolean
  mint: string
  owner: string
  tokenAmount: TokenAmount
}>

type RpcResponse<ResponseBody extends Record<string, unknown>> = {
  jsonrpc: "2.0"
  result: {
    context: unknown
    value:
      | [
          {
            account: {
              data: {
                parsed: {
                  info: ResponseBody
                }
              }
            }
          },
        ]
      | []
  }
}
