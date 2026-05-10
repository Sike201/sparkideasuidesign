
/**
 * Converts any RPC url to provided cluster.
 * @param rpcUrl
 * @param cluster
 */
export function getRpcUrlForCluster(rpcUrl: string, cluster: string): string {
  if (!['mainnet', 'devnet'].includes(cluster)) {
    throw new Error(`getRpcUrlForCluster error, unknown cluster (${cluster})!`)
  }

  if (cluster === 'mainnet') {
    return rpcUrl
      .replace('devnet', 'mainnet')
      .replace('testnet', 'mainnet')
  } else if (cluster === 'devnet') {
    return rpcUrl
      .replace('mainnet', 'devnet')
      .replace('testnet', 'devnet')
  } else {
    throw new Error(`Unknown cluster=${cluster}!`)
  }
}
