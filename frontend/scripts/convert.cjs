const bs58 = require('bs58');

const inputArray = []

function main() {
  const uint8Array = new Uint8Array(inputArray);
  const result = bs58.default.encode(uint8Array);
  console.log(result)
}

main()
