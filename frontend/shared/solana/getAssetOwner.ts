type GetAssetOwnerArgs = {
  tokenAddress: string
  rpcUrl: string
}
export async function getAssetOwner({ tokenAddress, rpcUrl }: GetAssetOwnerArgs): Promise<string | null> {
  const response = await fetch(rpcUrl, {
    method: "post",
    headers: {
      "Content-Type": "application/json", // Specify the content type
    },
    body: JSON.stringify({
      id: uuidv4(),
      method: "getAsset",
      jsonrpc: "2.0",
      params: {
        id: tokenAddress,
      },
    }),
  })

  const json = await response.json()
  // @ts-expect-error
  const owner = json.result?.ownership?.owner ?? null

  return owner
}

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16),
  )
}

// {"id":"AAedZCHUntTVKxaA3w4LYC4Hgg8BSJtpeRr7HCY7krxA","jsonrpc":"2.0","method":"getAsset","params":{"id":"AAedZCHUntTVKxaA3w4LYC4Hgg8BSJtpeRr7HCY7krxA"}}
