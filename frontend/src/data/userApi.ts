import { GetUserCommitmentsResponse, GetUserInvestmentsResponse } from "../../shared/types/user-types"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? `${window.location.origin}/api`
const GET_USER_INVESTMENTS = API_BASE_URL + "/user/allinvestments"
const GET_USER_COMMITMENTS = API_BASE_URL + "/user/allcommitments"

type GetUsersInvestmentsReq = {
  address: string
}
const getUsersInvestments = async ({ address }: GetUsersInvestmentsReq): Promise<GetUserInvestmentsResponse> => {
  const url = new URL(GET_USER_INVESTMENTS, window.location.href)
  url.searchParams.set("address", address)

  const response = await fetch(url)
  if (!response.ok) throw new Error("FE: Response error!")
  const json = (await response.json()) as GetUserInvestmentsResponse

  return json
}
const getUsersCommitments = async ({ address }: GetUsersInvestmentsReq): Promise<GetUserCommitmentsResponse> => {
  const url = new URL(GET_USER_COMMITMENTS, window.location.href)
  url.searchParams.set("address", address)

  const response = await fetch(url)
  if (!response.ok) throw new Error("FE: Response error!")
  const parsedResponse = await response.json()

  return parsedResponse
}

export const userApi = {
  getUsersInvestments,
  getUsersCommitments,
}
