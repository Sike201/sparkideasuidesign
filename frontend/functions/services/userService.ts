import { DrizzleD1Database } from "drizzle-orm/d1"
import { UserData, UserRow, UserWithAddress } from "../../shared/models/userModel"
import { depositTable, projectTable, userTable } from "../../shared/drizzle-schema"
import { sql, eq, inArray } from "drizzle-orm"
import { GetUserCommitmentsResponse, GetUserInvestmentsResponse, UserInvestmentByProjects } from "../../shared/types/user-types"

type FindUserByAddressArgs = {
  db: D1Database
  address: string
}
const findUserByAddress = async ({ db, address }: FindUserByAddressArgs): Promise<(UserWithAddress & Record<string, unknown>) | null> => {
  const row = await db
    .prepare("SELECT address, data FROM user WHERE address = ?1")
    .bind(address)
    .first<UserRow | null>()

  if (!row) return null

  return {
    address: row.address,
    data: JSON.parse(row.data || '{}') as UserData,
  } as unknown as UserWithAddress & Record<string, unknown>
}
const findUserByAddressOrFail = async (args: FindUserByAddressArgs): Promise<UserWithAddress & Record<string, unknown>> => {
  const user = await findUserByAddress(args)
  if (!user) throw new Error(`User (address=${args.address}) not found!`)
  return user
}
const getUserDepositsByProjects = async (db: DrizzleD1Database, userAddress: string): Promise<GetUserInvestmentsResponse | undefined> => {
  try {
    // Query the deposit records and extract tokenInUSD values directly from JSON
    const joinedQuery = await db
      .select({
        projectId: depositTable.projectId,
        project: projectTable.json,
        // Use SQL.raw to extract and clean the tokenInUSD value from JSON
        totalInvestmentInUSD: sql`
          SUM(
            COALESCE(
              CAST(
                REPLACE(
                  REPLACE(
                    JSON_EXTRACT(${depositTable.json}, '$.tokensCalculation.lpPosition.tokenInUSD'),
                    '$', ''
                  ),
                  ',', ''
                ) AS REAL
              ),
              0
            )
          )
        `.as('total_investment_in_usd'),
      })
      .from(depositTable)
      .innerJoin(projectTable, eq(depositTable.projectId, projectTable.id))
      .where(eq(depositTable.fromAddress, userAddress))
      .groupBy(depositTable.projectId) // Group by projectId and projectName
      .all();

    if (joinedQuery.length === 0) return {investments: [], sumInvestments: 0}

    const sum = (joinedQuery as UserInvestmentByProjects[]).reduce((acc, curr)=> {return acc + curr.totalInvestmentInUSD}, 0)
    const result = { sumInvestments: sum, investments: joinedQuery }

    return result as unknown as GetUserInvestmentsResponse;
  } catch (error) {
    console.error('Error in getUserDepositsByProjects:', error);
    throw new Error('Something went wrong!')
  }
};

const getUserCommitments = async (db: DrizzleD1Database, userAddress: string):  Promise<GetUserCommitmentsResponse | undefined>=> {
  try {
    const commitmentsResult = await db
      .select({
        commitments: sql<
          { projectId: string; amount: number; project: any }[]
        >`json_group_array(
            json_object(
              'projectId', json_data.key,
              'amount', CAST(json_extract(json_data.value, '$.amount') AS REAL),
              'project', json_data.project_json
            )
          )`.as('commitments'),
        totalCommitments: sql<number>`SUM(CAST(json_extract(json_data.value, '$.amount') AS REAL))`.as(
          'totalCommitments'
        ),
      })
      .from(
        sql`(
          WITH json_data AS (
            SELECT json_each.key, json_each.value
            FROM user, json_each(user.data, '$.investmentIntent')
            WHERE user.address = ${userAddress}
          )
          SELECT json_data.key, json_data.value, project.json AS project_json
          FROM json_data
          INNER JOIN project ON json_data.key = project.id
        ) AS json_data`
      )

    const parsedCommitments = commitmentsResult[0].commitments
    ? JSON.parse(commitmentsResult[0].commitments as unknown as string)
    : []
    const parsedCommitmentsWithParsedProjects = parsedCommitments.map(commitment => {return ({...commitment, project: JSON.parse(commitment.project) })})

    const result = {
      commitments: parsedCommitmentsWithParsedProjects,
      totalCommitments: commitmentsResult[0].totalCommitments,
    };

    return result
  } catch (error) {
    console.error('Error in getUserCommitments:', error);
    throw new Error('Something went wrong!')
  }
}
export const UserService = {
  findUserByAddress,
  findUserByAddressOrFail,
  getUserDepositsByProjects,
  getUserCommitments
}
