const crypto = require("crypto");


function generateApiKey(keyName) {
  const keySecret = crypto.randomBytes(16).toString("hex")
  const keyId = 'sk_' + keyName
  const key = `${keyId}_${keySecret}`
  const keyHash = crypto.createHash('sha256').update(key).digest('hex')
  const result = { keyId, key, keyHash }
  return result
}

function generateApiKeys(keyNames, permission) {
  if (!Array.isArray(keyNames)) throw new Error('keyNames must be an array of strings!')
  if (!['read', 'write'].includes(permission)) throw new Error('permission must be either "read" or "write"!')

  const keys = keyNames.map(generateApiKey)
  console.log(JSON.stringify(keys, null, 2))

  // Format permissions based on the selected permission type
  const permissionsFormat = permission === 'read' ? '[\"read\"]' : '[\"write\"]'
  // const permissionsFormat = permission === 'read' ? '[\\"read\\"]' : '["write"]'

  // insert query generation
  const insertQueries = keys.map(key =>
    `INSERT INTO api_key (id, created_at, permissions, hash) VALUES ('${key.keyId}', CURRENT_TIMESTAMP, '${permissionsFormat}', '${key.keyHash}');`
  )
  const insertQueriesStr = insertQueries.join('\n')
  console.log(insertQueriesStr)
}


// Generate API keys with read permission
generateApiKeys(["scheduler_launch_idea_prod1"], "write")

// Uncomment to generate API keys with write permission
// generateApiKeys(["ewan_stage_write2"], "write")
