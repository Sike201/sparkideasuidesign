type Asset = {
  address: string
  collectionAddress: string
  ownerAddress: string
  rawJson: string
}
type GetAssetsByGroupArgs = {
  collectionAddress: string
  rpcUrl: string
  limit: number
  page: number
}
export async function getAssetsByGroup({ collectionAddress, rpcUrl, limit, page }: GetAssetsByGroupArgs): Promise<Asset[]> {
  if (limit < 1 || limit > 1000) {
    throw new Error('Limit must be between 1 and 1000')
  }

  const response = await fetch(rpcUrl, {
    method: "post",
    headers: {
      "Content-Type": "application/json", // Specify the content type
    },
    body: JSON.stringify({
      id: uuidv4(),
      method: "getAssetsByGroup",
      jsonrpc: "2.0",
      params: {
        groupKey: "collection",
        groupValue: collectionAddress,
        limit,
        page,
      },
    }),
  })

  const json = await response.json()

  const items = json.result.items

  const assets: Asset[] = items.map(item => ({
    address: item.id,
    collectionAddress: item.grouping.find(group => group.group_key === 'collection')?.group_value ?? null,
    ownerAddress: item.ownership.owner ?? null,
    rawJson: item,
  }))

  return assets
}

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16),
  )
}
