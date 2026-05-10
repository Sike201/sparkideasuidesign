# Solana Web3

Solana provides a npm package for chain interactions: [@solana/web3.js](https://www.npmjs.com/package/@solana/web3.js)

However, I've decided **against** using the lib, instead going with manual implementation of the functionality for the following reasons:
1. The lib is simply a wrapper around json-rpc-api and does not add much functionality by itself
2. The lib increases the deployment size which, while also affecting performance negatively, might prevent deployments completely as CF Worker's deployment size [limit is 10MB](https://developers.cloudflare.com/workers/platform/limits/).
3. While trying to utilize the lib, I've encountered various issues, of which the biggest dealbreaker is this [issue](https://github.com/solana-labs/solana/issues/28321), and while there is a workaround, it doesn't feel reliable enough to me.
