export interface GitHubScoreData {
  username: string
  scoreVersion: string
  confidenceScore: number
  totalScore: number
  scoreBreakdown: {
    profileScore: number
    repositoryScore: number
    weights: {
      profile: number
      repos: number
    }
  }
  nftAttributes: {
    badge: string
    rarity: string
    dominantColor: string
    element: string
    level: number
  }
  persona: {
    type: string
    strengths: string[]
    weaknesses: string[]
    devStyle: string[]
  }
  profile: {
    accountCreated: string
    accountAgeYears: number
    followers: number
    following: number
    publicRepos: number
    privateRepos: number
    hasProfileReadme: boolean
    readmeRichness: string
    readmeStructureScore: number
    profileLinks: string[]
    heatmapActivity: Record<string, number>
    contributionsBreakdown: {
      commits: number
      pullRequests: number
      issues: number
      codeReviews: number
    }
    streak: {
      longest: number
      current: number
    }
    patterns: {
      commitsAtNight: boolean
      weekendActivity: boolean
      earlyBird: boolean
    }
  }
  skills: {
    languages: Array<{
      name: string
      strength: 'High' | 'Medium' | 'Low'
      usagePercent: number
    }>
    frameworks: {
      frontend?: Array<{ name: string; strength: 'High' | 'Medium' | 'Low' }>
      backend?: Array<{ name: string; strength: 'High' | 'Medium' | 'Low' }>
      testing?: Array<{ name: string; strength: 'High' | 'Medium' | 'Low' }>
      devops?: Array<{ name: string; strength: 'High' | 'Medium' | 'Low' }>
      web3?: Array<{ name: string; strength: 'High' | 'Medium' | 'Low' }>
      build?: Array<{ name: string; strength: 'High' | 'Medium' | 'Low' }>
      linting?: Array<{ name: string; strength: 'High' | 'Medium' | 'Low' }>
    }
    isFullstack: boolean
    frontend: boolean
    backend: boolean
    web3: boolean
    blockchains: string[]
    smartContracts: boolean
    smartContractLang: string[]
    ercStandards?: string[]
    infra: string[]
    testing: string[]
    security: string[]
  }
  repos: Array<{
    name: string
    private: boolean
    language: string | null
    frameworks: string[]
    type: string
    web3: boolean
    web3Category?: 'None' | 'dApp' | 'Protocol' | 'Mixed'
    blockchain: string | null
    smartContract: boolean
    hasTests: boolean
    hasCI: boolean
    readmeQuality: string
    commitFrequency: string
    lastCommit: string
    stars: number
    forks: number
    collaborators: number
    projectStructureScore: number
    linting: boolean
    dockerized: boolean
    audited: boolean
    hasContractTests?: boolean
    ercStandards?: string[]
  }>
  metaInsights: {
    hasPRsInExternalRepos: boolean
    projectsPersonal: number
    projectsCollaborative: number
    activelyMaintainedProjects: number
    hasMaintainedPopularProject: boolean
    busFactor: number
  }
  recommendation: {
    summary: string
    trustLevel: string
    riskFactors: string[]
    notableStrengths: string[]
    suggestedRoles: Array<{
      title: string
      reason: string
    }>
  }
  requestedBy?: {
    id: number
    login: string
    requestedAt: string
  }
}

export class GitHubScoreService {
  private baseUrl: string

  constructor(baseUrl: string = 'http://localhost:8787') {
    this.baseUrl = baseUrl
  }

  /**
   * Get GitHub score for a user using their GitHub access token
   * @param accessToken - GitHub OAuth access token
   * @returns Promise<GitHubScoreData>
   */
  async getGitHubScore(accessToken: string): Promise<GitHubScoreData> {
    try {
      const response = await fetch(`${this.baseUrl}/api/gh/trust-score`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch GitHub score: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return data as GitHubScoreData
    } catch (error) {
      console.error('Error fetching GitHub score:', error)
      throw error
    }
  }

  /**
   * Get GitHub score for a user by username (requires admin access)
   * @param username - GitHub username
   * @param adminToken - Admin access token
   * @returns Promise<GitHubScoreData>
   */
  async getGitHubScoreByUsername(username: string, adminToken: string): Promise<GitHubScoreData> {
    try {
      const response = await fetch(`${this.baseUrl}/api/gh/trust-score/${username}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch GitHub score for ${username}: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return data as GitHubScoreData
    } catch (error) {
      console.error(`Error fetching GitHub score for ${username}:`, error)
      throw error
    }
  }
} 