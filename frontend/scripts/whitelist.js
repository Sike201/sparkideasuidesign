
// {
//   "rows": [
//   {
//     "projectId": "solana-id",
//     "address": "",
//     "tierId": "tier10"
//   }
// ]
// }

const projectId = ''
const tierId = ''
const input = ``

function main() {
  const addresses = input
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(address => ({
      projectId,
      tierId,
      address,
    }))
  const req = {
    rows: addresses
  }

  console.log(JSON.stringify(req, null, 2))
}

// USE THE WHITELIST API ON POSTMAN

main()
