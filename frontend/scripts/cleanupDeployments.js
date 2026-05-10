//////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////
// READ THIS BEFORE USING SCRIPT /////////////////////////////////////////
// Only latest "main" and "stage" deployment will not be removed. ////////
// Also, Cloudflare requires latest LIVE deployments of branches to be  //
// removed MANUALLY. /////////////////////////////////////////////////////
// Cleans max 25 deployments per script execution. ///////////////////////
//////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////

/* eslint-disable no-undef */
/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config(); // Load environment variables

// Cloudflare API information
const API_TOKEN = process.env.VITE_DEPLOYMENTS_API_TOKEN
const ACCOUNT_ID = process.env.VITE_ACCOUNT_ID
const PROJECT_NAME = process.env.VITE_PROJECT_NAME

// Cloudflare API URLs
const CLOUDFLARE_API_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments`

const headers = {
  Authorization: `Bearer ${API_TOKEN}`,
  "Content-Type": "application/json",
}

// Function to get all deployments
async function getDeployments(page) {
  console.log("fetching next batch of deployments")
  const url = CLOUDFLARE_API_URL + `?page=${page}`
  console.log("GET ", url)
  const response = await fetch(url, {
    method: "GET",
    headers,
  })
  console.log("response", response)
  const data = await response.json()
  if (!data.ok) {
    console.log("no data")
    return null
  }
  return data.result
}

// Function to delete a deployment
async function deleteDeployment(deploymentId) {
  const deleteUrl = `${CLOUDFLARE_API_URL}/${deploymentId}`
  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers,
  })
  const status = response?.status && response?.status === 200 ? "🟢 200" : `🟨 ${response?.status}`
  console.log(`deleteDeployment '${deploymentId}' response status: ${status}`)
}

// Main function to clean up old deployments
async function cleanDeployments(page) {
  const deployments = await getDeployments(page)
  console.log(deployments.length)
  if (!deployments) {
    console.log("no deployments fetched, something might be wrong")
    return
  } else if (deployments.length <= 2 && page > 2) {
    console.log("starting again from page 2")
    cleanDeployments(1)
    return
  } else if (deployments.length <= 2) {
    console.log("Note: Latest live deployments of every branch must be removed MANUALLY.")
    console.log("✅ Cleanup has finished.")
    return
  }
  console.log(`fetched ${deployments.length} deployments of project '${PROJECT_NAME}'`)

  // Filter for 'main' branch deployments
  const mainDeployments = deployments.filter((deployment) => deployment.deployment_trigger.metadata.branch === "main")
  const stageDeployments = deployments.filter((deployment) => deployment.deployment_trigger.metadata.branch === "stage")

  // Sort deployments by creation time (latest first)
  mainDeployments.sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime())
  stageDeployments.sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime())

  // Keep the latest 'main' and 'stage' deployments
  const latestMainDeployment = mainDeployments[0]
  const latestStageDeployment = stageDeployments[0]

  // Delete all other deployments except the latest
  const oldDeployments = deployments.filter((deployment) => {
    if (latestMainDeployment && deployment.id === latestMainDeployment?.id) return false
    if (latestStageDeployment && deployment.id === latestStageDeployment?.id) return false
    return true
  })

  console.log("initiating batch cleanup of deployments")
  for (const deployment of oldDeployments) {
    await deleteDeployment(deployment.id)
  }

  latestMainDeployment?.id && console.log(`Kept latest 'main' deployment: ${latestMainDeployment.id}`)
  latestStageDeployment?.id && console.log(`Kept latest 'stage' deployment: ${latestStageDeployment.id}`)

  console.log("moving on to next batch cleanup...")
  cleanDeployments(page + 1)
}

// Run the cleanup script
cleanDeployments(1).catch(console.error)
