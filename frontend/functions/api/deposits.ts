import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"
import { drizzle } from "drizzle-orm/d1"
import { depositTable, projectTable } from "../../shared/drizzle-schema"
import { and, desc, eq } from "drizzle-orm"

type ENV = {
  DB: D1Database
}
export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const db = drizzle(ctx.env.DB, { logger: true })
  try {
    // parse request
    const { searchParams } = new URL(ctx.request.url)
    const projectId = searchParams.get('projectId')
    const address = searchParams.get('address')

    // validate request
    if (!projectId || !address) {
      return jsonResponse({
        message: 'Must provide projectId and address args!'
      }, 400)
    }

    // happy flow

    // load project
    const project = await db
      .select()
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .get()

    if (!project)
      return jsonResponse({ message: `Project not found (id=${projectId})!` }, 404)

    const raisedTokenDecimals = project.json.config.raisedTokenData.decimals

    const depositsResult = await db
      .select()
      .from(depositTable)
      .where(
        and(
          eq(depositTable.fromAddress, address),
          eq(depositTable.projectId, projectId),
        )
      )
      .orderBy(desc(depositTable.createdAt))
      .all()

    const deposits = depositsResult.map(deposit => ({
      ...deposit,
      ...deposit.json,
      transactionUrl: `https://solscan.io/tx/${deposit.transactionId}?cluster=${deposit.json.cluster}`
    }))

    const amount = deposits.reduce((acc, curr) => acc + Number(curr.amountDeposited), 0)

    const decimals = raisedTokenDecimals
    const response = {
      deposits,
      total: {
        amount,
        decimals,
        uiAmount: amount / Math.pow(10, decimals),
      }
    }

    return jsonResponse(response, {
      headers: {
        "Cache-Control": "public, max-age=15",
      }
    })
  } catch (e) {
    await reportError(ctx.env.DB, e)
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
}
