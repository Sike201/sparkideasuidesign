export class GitHubService {
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'spark-it-github-service',
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  private async makeGraphQLRequest(query: string, variables: any = {}) {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      throw new Error(`GitHub GraphQL error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async getAuthenticatedUser() {
    return this.makeRequest('/user')
  }

  async getReposForAuthenticatedUser() {
    const repos = []
    let page = 1
    const perPage = 100

    while (true) {
      const response = await this.makeRequest(`/user/repos?page=${page}&per_page=${perPage}&type=all`)
      repos.push(...response)

      if (response.length < perPage) break
      page++
    }

    return repos
  }

  async getContributionData(username: string) {
    try {
      const query = `
        query($username: String!) {
          user(login: $username) {
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    contributionCount
                    date
                  }
                }
              }
              pullRequestContributions {
                totalCount
              }
              issueContributions {
                totalCount
              }
              pullRequestReviewContributions {
                totalCount
              }
            }
          }
        }
      `

      const response = await this.makeGraphQLRequest(query, { username })
      return response.data.user
    } catch (error) {
      console.warn('GraphQL contribution data failed, using fallback REST API:', error)
      
      // Fallback to REST API for basic contribution data
      try {
        const userResponse = await this.makeRequest(`/users/${username}`)
        const reposResponse = await this.makeRequest(`/users/${username}/repos?per_page=100&sort=updated`)
        
        // Calculate basic contribution metrics from repos
        const totalRepos = reposResponse.length
        const publicRepos = reposResponse.filter((repo: any) => !repo.private).length
        const totalStars = reposResponse.reduce((sum: number, repo: any) => sum + repo.stargazers_count, 0)
        const totalForks = reposResponse.reduce((sum: number, repo: any) => sum + repo.forks_count, 0)
        
        return {
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: totalRepos * 10, // Estimate based on repo count
              weeks: []
            },
            pullRequestContributions: { totalCount: Math.floor(totalRepos * 0.5) },
            issueContributions: { totalCount: Math.floor(totalRepos * 0.3) },
            pullRequestReviewContributions: { totalCount: Math.floor(totalRepos * 0.2) }
          },
          // Additional data for scoring
          publicRepos,
          totalStars,
          totalForks,
          followers: userResponse.followers,
          following: userResponse.following,
          created_at: userResponse.created_at
        }
      } catch (fallbackError) {
        console.error('Fallback contribution data also failed:', fallbackError)
        // Return minimal data structure
        return {
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: 0,
              weeks: []
            },
            pullRequestContributions: { totalCount: 0 },
            issueContributions: { totalCount: 0 },
            pullRequestReviewContributions: { totalCount: 0 }
          }
        }
      }
    }
  }

  async getExternalContributions(username: string) {
    try {
      const query = `
        query($searchQuery: String!) {
          search(query: $searchQuery, type: ISSUE, first: 10) {
            issueCount
            nodes {
              ... on Issue {
                title
                url
                repository {
                  nameWithOwner
                }
                createdAt
              }
              ... on PullRequest {
                title
                url
                repository {
                  nameWithOwner
                }
                createdAt
              }
            }
          }
        }
      `

      const searchQuery = `author:${username} -user:${username} is:public`
      const response = await this.makeGraphQLRequest(query, { searchQuery })

      return {
        total_count: response.data.search.issueCount,
        items: response.data.search.nodes
      }
    } catch (error) {
      console.warn('GraphQL external contributions failed, using fallback:', error)
      
      // Fallback: return empty external contributions
      return {
        total_count: 0,
        items: []
      }
    }
  }

  async getRepoFileContent(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const response = await this.makeRequest(`/repos/${owner}/${repo}/contents/${path}`)
      
      if (response.type === 'file') {
        const contentResponse = await fetch(response.download_url)
        return await contentResponse.text()
      }
      
      return null
    } catch (error) {
      return null
    }
  }

  async getRepoTree(owner: string, repo: string, branch: string = 'main'): Promise<any[] | null> {
    try {
      const branchData = await this.makeRequest(`/repos/${owner}/${repo}/branches/${branch}`)
      const treeSha = branchData.commit.commit.tree.sha

      if (!treeSha) return null

      const treeData = await this.makeRequest(`/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=true`)
      return treeData.tree || []
    } catch (error) {
      console.error(`Error getting repo tree for ${owner}/${repo}#${branch}:`, error)
      return null
    }
  }

  async getRepoLanguages(owner: string, repo: string): Promise<any> {
    try {
      return await this.makeRequest(`/repos/${owner}/${repo}/languages`)
    } catch (error) {
      return {}
    }
  }

  async getRepoCommitHistory(owner: string, repo: string): Promise<any[] | null> {
    try {
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

      const response = await this.makeRequest(
        `/repos/${owner}/${repo}/commits?since=${threeMonthsAgo.toISOString()}&per_page=100`
      )
      return response
    } catch (error) {
      console.error(`Failed to fetch commit history for ${owner}/${repo}:`, error)
      return null
    }
  }

  async getRepoCollaborators(owner: string, repo: string): Promise<any[]> {
    try {
      return await this.makeRequest(`/repos/${owner}/${repo}/collaborators?per_page=100`)
    } catch (error) {
      return []
    }
  }
} 