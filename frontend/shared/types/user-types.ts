import { ProjectModel } from "../models"

export type UserInvestmentByProjects = {
  projectId: string
  project: ProjectModel
  totalInvestmentInUSD: number
}
export type GetUserInvestmentsResponse = { investments: UserInvestmentByProjects[]; sumInvestments: number }

export type UserCommitmentByProjects = {
  projectId: string
  project: ProjectModel
  amount: number
}
export type GetUserCommitmentsResponse = { commitments: UserCommitmentByProjects[]; totalCommitments: number }
