import { RpcResponse } from "./rpcTypes"

type RpcSearchAssetsResponse = {
  total: number
  limit: number
  page: number
  items: {
    id: string
    grouping: {
      group_key: string
      group_value: string
    }[]
    ownership: {
      owner: string
    }

    token_info: {
      balance: number
      supply: number
      decimals: number
    }
  }[]
}
type RpcSearchAssetsArgs = {
  rpcUrl: string
  limit?: number
  page?: number

  ownerAddress: string
  collections?: string[]
  tokenType?: 'fungible'
}
/**
 * Docs: https://docs.helius.dev/compression-and-das-api/digital-asset-standard-das-api/search-assets
 * @param collectionAddress
 * @param rpcUrl
 * @param limit
 * @param page
 */
export async function rpcSearchAssets({
                                        rpcUrl, limit, page,
                                        ownerAddress, collections, tokenType,
                                      }: RpcSearchAssetsArgs): Promise<RpcSearchAssetsResponse> {
  limit ??= 1000
  page ??= 1

  if (limit < 1 || limit > 1000) {
    throw new Error('Limit must be between 1 and 1000')
  }

  const response = await fetch(rpcUrl, {
    method: "post",
    headers: {
      "Content-Type": "application/json", // Specify the content type
    },
    body: JSON.stringify({
      id: "1",
      method: "searchAssets",
      jsonrpc: "2.0",
      params: {
        ownerAddress,
        collections,
        limit,
        page,
        tokenType,
      },
    }),
  })

  const rpcResponse = (await response.json()) as RpcResponse<RpcSearchAssetsResponse>

  if ('error' in rpcResponse) {
    const message = `Error (code=${rpcResponse.error.code}): ${rpcResponse.error.message}`
    throw new Error(message)
  }

  console.log('Helius searchAssets call...')

  return rpcResponse.result
}

type HasCollectionNftArgs = {
  rpcUrl: string
  ownerAddress: string
  collections: string[]
}
type HasCollectionNftResponse = Record<string, boolean>
export async function isHoldingNftFromCollections({ rpcUrl, ownerAddress, collections }: HasCollectionNftArgs): Promise<HasCollectionNftResponse> {
  const response = await rpcSearchAssets({
    rpcUrl,
    ownerAddress,
    collections,
    // hardcoding pagination, assuming no one will check for ownership of 1k+ tokens at a time
    limit: 1000,
    page: 1,
  })

  if (response.total === 1000) {
    throw new Error(`SearchAssets Limit exceeded!`)
  }

  const retval: Record<string, boolean> = {}

  for (const collection of collections) {
    const holdsNftFromCollection = response.items.some(nft =>
        nft.ownership.owner === ownerAddress
        && nft.grouping.some(group =>
          group.group_key === 'collection'
          && group.group_value === collection
        )
    )
    retval[collection] = holdsNftFromCollection
  }

  return retval
}

type GetTokenHoldingsArgs = {
  rpcUrl: string
  ownerAddress: string
}
type GetTokenHoldingsRes = Record<string, {
  amount: number
  decimals: number
  uiAmount: number
}>
export async function getTokenHoldingsMap({ rpcUrl, ownerAddress }: GetTokenHoldingsArgs): Promise<GetTokenHoldingsRes> {
  const response = await rpcSearchAssets({
    rpcUrl,
    ownerAddress,
    tokenType: 'fungible',
    // hardcoding pagination, assuming no one will check for ownership of 1k+ tokens at a time
    limit: 1000,
    page: 1,
  })

  const tokens = response.items
    .map(item => ({
      id: item.id,
      amount: item.token_info.balance ?? 0,
      decimals: item.token_info.decimals,
      uiAmount: item.token_info.balance
        ? (item.token_info.balance / (10 ** item.token_info.decimals))
        : 0,
    }))

  return tokens.reduce((acc, curr) => {
    acc[curr.id] = curr
    return acc
  }, {} as GetTokenHoldingsRes)
}
