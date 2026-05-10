import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import { depositTable } from "../../shared/drizzle-schema"
import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const db = drizzle(ctx.env.DB, { logger: true })
  try {
    // parse request
    const { searchParams } = new URL(ctx.request.url)
    const projectId = searchParams.get("projectId")

    // validate request
    if (!projectId) {
      return jsonResponse({
        message: "Must provide projectId arg!"
      }, 400)
    }

    // get all deposits for the project
    const deposits = await db
      .select()
      .from(depositTable)
      .where(eq(depositTable.projectId, projectId))
      .all()

    // Group deposits by address and calculate totals
    const groupedDeposits = deposits.reduce((acc, deposit) => {
      const address = deposit.fromAddress
      if (!acc[address]) {
        acc[address] = {
          fromAddress: address,
          totalAmountDeposited: 0,
          lastDepositDate: new Date(deposit.createdAt),
          depositCount: 0
        }
      }
      
      acc[address].totalAmountDeposited += Number(deposit.json.tokensCalculation.lpPosition.borgInUSD.replace("$", "").replace(",", ""))
      acc[address].depositCount++
      
      const depositDate = new Date(deposit.createdAt)
      if (depositDate > acc[address].lastDepositDate) {
        acc[address].lastDepositDate = depositDate
      }
      
      return acc
    }, {} as Record<string, {
      fromAddress: string
      totalAmountDeposited: number
      lastDepositDate: Date
      depositCount: number
    }>)

    // Convert to array and sort by total amount deposited
    const tokenDistributionData = Object.values(groupedDeposits)
      .sort((a, b) => b.totalAmountDeposited - a.totalAmountDeposited)
      .map(item => ({
        fromAddress: item.fromAddress,
        totalAmountDeposited: item.totalAmountDeposited,
        lastDepositDate: item.lastDepositDate.toISOString(),
        depositCount: item.depositCount
      }))

    return jsonResponse({ data: tokenDistributionData }, {
      headers: {
        "Cache-Control": "public, max-age=15",
      }
    })
  } catch (e) {
    await reportError(ctx.env.DB, e)
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
} 