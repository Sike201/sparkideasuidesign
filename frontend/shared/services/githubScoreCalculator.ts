import { GitHubScoreData } from './githubScore'

// Constants from spark-github
const SCORE_WEIGHTS = {
  profile: 40,
  repos: 60
}

const PROFILE_DEFAULTS = {
  baseScore: 10,
  readmeBonus: 20,
  linksBonus: 10,
  streakBonus: 15,
  contribsBonus: 25,
  followersImpact: 0.1,
  accountAgeImpact: 2
}

const REPO_DEFAULTS = {
  baseScore: 20,
  ciBonus: 15,
  testsBonus: 20,
  readmeBonus: { high: 5, medium: 2 },
  lintingBonus: 5,
  dockerBonus: 5,
  structureMultiplier: 1.5
}

const KNOWN_FRAMEWORKS = {
  frontend: ['react', 'vue', 'angular', 'next.js', 'svelte', 'tailwindcss', 'bootstrap', 'material-ui', 'ant-design'],
  backend: ['express', 'koa', 'fastify', 'nest.js', 'django', 'flask', 'fastapi', 'rubyonrails', 'laravel', 'spring', 'asp.net'],
  testing: ['jest', 'vitest', 'cypress', 'playwright'],
  devops: ['docker', 'kubernetes', 'terraform'],
  web3: [
    'ethers', 'web3', 'hardhat', 'truffle', 'foundry', 'viem', 'wagmi', 
    'anchor-lang', '@solana/web3.js',
    '@polkadot/api', 'substrate',
    'cosmos-sdk', 'tendermint',
    'near-api-js',
    'starknet',
    'xrpl'
  ],
  build: ['vite', 'webpack', 'babel'],
  linting: ['eslint', 'prettier']
}

// Utility functions
const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

const getAccountAgeInYears = (createdAt: string): number => {
  const created = new Date(createdAt)
  const now = new Date()
  return (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
}

// Analysis functions
const analyzeProfileReadme = (content: string | null): { readmeRichness: 'Low' | 'Medium' | 'High', readmeStructureScore: number } => {
  if (!content) {
    return { readmeRichness: 'Low', readmeStructureScore: 0 }
  }

  let richnessScore = 0
  let structureScore = 0

  if (content.length > 1500) richnessScore += 3
  else if (content.length > 400) richnessScore += 2
  else if (content.length > 100) richnessScore += 1

  if ((content.match(/!\[.*\]\(.*\)/g) || []).length > 0) richnessScore += 2
  if ((content.match(/\[.*\]\(http.*\)/g) || []).length > 2) richnessScore += 1

  const headings = content.match(/^#+\s/gm) || []
  structureScore += Math.min(headings.length, 5)

  const codeBlocks = content.match(/```/g) || []
  if (codeBlocks.length > 1) structureScore += 3

  const lists = content.match(/^(\s*(\*|-|\+)\s|[0-9]+\.\s)/gm) || []
  if (lists.length > 5) structureScore += 2

  let readmeRichness: 'Low' | 'Medium' | 'High' = 'Low'
  if (richnessScore >= 4) readmeRichness = 'High'
  else if (richnessScore >= 2) readmeRichness = 'Medium'

  return {
    readmeRichness,
    readmeStructureScore: Math.min(Math.round(structureScore), 10)
  }
}

const analyzeRepository = (context: any) => {
  const {
    packageJsonContent,
    readmeContent,
    filesExistence,
    cargoTomlContent,
    primaryLanguage,
    representativeContractContent,
    fileTree
  } = context

  const analysis = {
    projectType: 'Unknown',
    technologies: new Set<string>(),
    smartContractLanguages: new Set<string>(),
    web3: { 
      isWeb3: false,
      web3Category: 'None' as 'None' | 'dApp' | 'Protocol' | 'Mixed',
      hasSmartContracts: false, 
      blockchain: null as string | null,
      audited: false,
      hasContractTests: false,
      ercStandards: [] as string[]
    },
    qualityMetrics: {
      hasTests: false,
      hasCI: false,
      hasLinting: false,
      hasDockerfile: false,
      readmeQuality: 'Low' as 'Low' | 'Medium' | 'High',
      projectStructureScore: 5
    }
  }

  if (packageJsonContent) {
    try {
      const pkg = JSON.parse(packageJsonContent)
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      
      for (const category in KNOWN_FRAMEWORKS) {
        for (const fw of (KNOWN_FRAMEWORKS as any)[category]) {
          if (Object.keys(allDeps).some(dep => dep.toLowerCase().includes(fw))) {
            analysis.technologies.add(fw)
          }
        }
      }
      
      if (analysis.technologies.has('react') || analysis.technologies.has('vue') || analysis.technologies.has('angular') || analysis.technologies.has('next.js')) analysis.projectType = 'Frontend'
      if (analysis.technologies.has('express') || analysis.technologies.has('koa') || analysis.technologies.has('nest.js')) analysis.projectType = 'Backend'
      if (analysis.projectType === 'Frontend' && (analysis.technologies.has('express') || analysis.technologies.has('nest.js'))) analysis.projectType = 'Fullstack'
      
      if (analysis.technologies.has('ethers') || analysis.technologies.has('web3') || analysis.technologies.has('viem') || analysis.technologies.has('wagmi')) {
        analysis.web3.isWeb3 = true
        analysis.web3.blockchain = 'EVM'
      }
      if (analysis.technologies.has('anchor-lang') || analysis.technologies.has('@solana/web3.js')) {
        analysis.web3.isWeb3 = true
        analysis.web3.blockchain = 'Solana'
      }

      if (pkg.scripts?.test) analysis.qualityMetrics.hasTests = true
      if (pkg.scripts?.lint) analysis.qualityMetrics.hasLinting = true

    } catch (e) { console.error("Failed to parse package.json") }
  }

  const hasSolidityFiles = fileTree ? fileTree.some((f: any) => f.path.endsWith('.sol')) : false

  if (
    primaryLanguage === 'Solidity' || 
    (cargoTomlContent && cargoTomlContent.includes('anchor-lang')) ||
    analysis.technologies.has('hardhat') ||
    analysis.technologies.has('truffle') ||
    analysis.technologies.has('foundry') ||
    hasSolidityFiles
  ) {
    analysis.web3.isWeb3 = true
    analysis.web3.hasSmartContracts = true
    analysis.web3.web3Category = 'Protocol'
    
    if (primaryLanguage === 'Solidity') analysis.smartContractLanguages.add('Solidity')
    if (primaryLanguage === 'Rust' || (cargoTomlContent && cargoTomlContent.includes('anchor-lang'))) analysis.smartContractLanguages.add('Rust')
    if (hasSolidityFiles) analysis.smartContractLanguages.add('Solidity')
  }

  if (analysis.technologies.has('react') && (analysis.technologies.has('ethers') || analysis.technologies.has('viem'))) {
    analysis.web3.isWeb3 = true
    analysis.web3.web3Category = analysis.web3.web3Category === 'Protocol' ? 'Mixed' : 'dApp'
  }

  if (analysis.web3.hasSmartContracts) {
    if (filesExistence['test'] || filesExistence['tests']) {
      analysis.web3.hasContractTests = true
    }
    if (filesExistence['audits'] || filesExistence['audit']) {
      analysis.web3.audited = true
    }

    if (representativeContractContent) {
      if (representativeContractContent.includes('@openzeppelin/contracts/token/ERC20')) analysis.web3.ercStandards.push('ERC20')
      if (representativeContractContent.includes('@openzeppelin/contracts/token/ERC721')) analysis.web3.ercStandards.push('ERC721')
      if (representativeContractContent.includes('@openzeppelin/contracts/token/ERC1155')) analysis.web3.ercStandards.push('ERC1155')
    }
  }

  analysis.qualityMetrics.hasCI = filesExistence['.github/workflows'] || false
  analysis.qualityMetrics.hasDockerfile = filesExistence['dockerfile'] || false
  
  let structureScore = 0
  if (filesExistence['src']) structureScore += 3
  if (filesExistence['tests'] || filesExistence['test']) structureScore += 2
  if (filesExistence['docs']) structureScore += 1
  if (filesExistence['.env.example'] || filesExistence['.env.sample']) structureScore += 2
  if (filesExistence['.editorconfig']) structureScore += 1
  if (filesExistence['contributing.md']) structureScore += 1
  analysis.qualityMetrics.projectStructureScore = Math.min(structureScore, 10)
  
  if (readmeContent && readmeContent.length > 1000) analysis.qualityMetrics.readmeQuality = 'High'
  else if (readmeContent && readmeContent.length > 300) analysis.qualityMetrics.readmeQuality = 'Medium'

  return analysis
}

// Scoring functions
const calculateProfileScore = (
  user: any, 
  contributions: any,
  readme: { readmeRichness: 'Low' | 'Medium' | 'High', readmeStructureScore: number }
): number => {
  let score = PROFILE_DEFAULTS.baseScore
  score += user.followers * PROFILE_DEFAULTS.followersImpact
  score += getAccountAgeInYears(user.created_at) * PROFILE_DEFAULTS.accountAgeImpact
  score += (contributions?.contributionsCollection.contributionCalendar.totalContributions || 0) * 0.05
  if (user.bio) score += 5
  if (user.blog) score += 5

  if (readme.readmeRichness === 'High') score += 15
  else if (readme.readmeRichness === 'Medium') score += 8
  score += Math.min(readme.readmeStructureScore, 10)

  return clamp(score, 0, 100)
}

const calculateRepoScore = (repo: any, analysis: any): number => {
  let qualityScore = REPO_DEFAULTS.baseScore
  
  if (analysis.qualityMetrics.hasTests) qualityScore += REPO_DEFAULTS.testsBonus
  if (analysis.qualityMetrics.hasCI) qualityScore += REPO_DEFAULTS.ciBonus
  if (analysis.qualityMetrics.hasLinting) qualityScore += REPO_DEFAULTS.lintingBonus
  if (analysis.qualityMetrics.hasDockerfile) qualityScore += REPO_DEFAULTS.dockerBonus

  if (analysis.qualityMetrics.readmeQuality === 'High') qualityScore += REPO_DEFAULTS.readmeBonus.high
  else if (analysis.qualityMetrics.readmeQuality === 'Medium') qualityScore += REPO_DEFAULTS.readmeBonus.medium
  
  qualityScore += (analysis.qualityMetrics.projectStructureScore || 0) * REPO_DEFAULTS.structureMultiplier

  const popularityScore = Math.min(
    (Math.log2(repo.stargazers_count + 1) * 2) + 
    (Math.log2(repo.forks_count + 1) * 1),
    25
  )
  
  const totalScore = qualityScore + popularityScore

  return clamp(totalScore, 0, 100)
}

const calculateConfidenceScore = (accountCreationDate: string, contributionDays: any[]): number => {
  let score = 0
  const accountAge = getAccountAgeInYears(accountCreationDate)

  if (accountAge > 4) score += 3
  else if (accountAge > 2) score += 2
  else if (accountAge > 1) score += 1

  const activeDays = contributionDays.filter(d => d.contributionCount > 0)
  const totalContributions = contributionDays.reduce((sum, d) => sum + d.contributionCount, 0)

  if (activeDays.length < 20) {
    return Math.round(score / 2)
  }

  const commitDates = activeDays.map(c => new Date(c.date).getTime())
  const firstCommitTime = Math.min(...commitDates)
  const lastCommitTime = Math.max(...commitDates)
  
  const historyDurationDays = (lastCommitTime - firstCommitTime) / (1000 * 60 * 60 * 24)

  if (historyDurationDays > 730) score += 5
  else if (historyDurationDays > 365) score += 4
  else if (historyDurationDays > 180) score += 2
  else if (historyDurationDays > 60) score += 1

  if (totalContributions > 1000) score += 2
  else if (totalContributions > 500) score += 1

  const commitDensity = activeDays.length / (historyDurationDays + 1)
  if (accountAge < 0.8 && commitDensity > 5) {
    score *= 0.7
  }

  const finalScore = Math.max(0, Math.min(score, 10))
  return Math.round(finalScore)
}

const calculateSkillStrength = (
  languageUsage: Map<string, number>,
  allTechs: Set<string>,
  technologyCounts: Map<string, number>
): { languages: any[], frameworks: any } => {
  const totalBytes = [...languageUsage.values()].reduce((a, b) => a + b, 1)
  const languages = [...languageUsage.entries()]
    .map(([name, bytes]) => {
      const usagePercent = Math.round((bytes / totalBytes) * 100)
      let strength: 'High' | 'Medium' | 'Low' = 'Low'
      if (usagePercent > 40) strength = 'High'
      else if (usagePercent > 15) strength = 'Medium'
      return { name, usagePercent, strength }
    })
    .sort((a, b) => b.usagePercent - a.usagePercent)

  const totalProjectsWithFrameworks = Math.max(...technologyCounts.values(), 1)

  const frameworkList = [...allTechs]
    .filter((t) => !languageUsage.has(t) && t !== 'docker')
    .map((name) => {
      const count = technologyCounts.get(name) || 0
      const usageRatio = count / totalProjectsWithFrameworks
      let strength: 'High' | 'Medium' | 'Low' = 'Low'
      if (count > 5 || usageRatio > 0.4) strength = 'High'
      else if (count > 2 || usageRatio > 0.15) strength = 'Medium'
      return { name, strength }
    })
    .filter((v, i, a) => a.findIndex(t => t.name === v.name) === i)
    
  const categorizedFrameworks: any = {}
  for (const category in KNOWN_FRAMEWORKS) {
    categorizedFrameworks[category] = frameworkList.filter(fw => (KNOWN_FRAMEWORKS as any)[category].includes(fw.name))
  }
  
  return { languages, frameworks: categorizedFrameworks }
}

// Pattern analysis functions
const analyzeCommitPatterns = (commits: any[]) => {
  const patterns = {
    commitsAtNight: false,
    weekendActivity: false,
    earlyBird: false
  }

  if (commits.length === 0) return patterns

  const nightCommits = commits.filter(commit => {
    const hour = new Date(commit.commit.author.date).getHours()
    return hour >= 22 || hour <= 6
  })

  const weekendCommits = commits.filter(commit => {
    const day = new Date(commit.commit.author.date).getDay()
    return day === 0 || day === 6
  })

  const earlyCommits = commits.filter(commit => {
    const hour = new Date(commit.commit.author.date).getHours()
    return hour >= 6 && hour <= 10
  })

  patterns.commitsAtNight = nightCommits.length > commits.length * 0.3
  patterns.weekendActivity = weekendCommits.length > commits.length * 0.2
  patterns.earlyBird = earlyCommits.length > commits.length * 0.3

  return patterns
}

const calculateStreak = (contributionDays: any[]) => {
  let currentStreak = 0
  let longestStreak = 0
  let tempStreak = 0

  for (const day of contributionDays) {
    if (day.contributionCount > 0) {
      tempStreak++
      currentStreak = tempStreak
      longestStreak = Math.max(longestStreak, tempStreak)
    } else {
      tempStreak = 0
    }
  }

  return { current: currentStreak, longest: longestStreak }
}

const generateNftAttributes = (score: number, devStyle: string[], languages: Set<string>, personaType: string) => {
  let badge = 'Novice'
  let rarity = 'Common'
  let dominantColor = '#6B7280'
  let element = 'Earth'
  let level = 1

  if (score >= 90) {
    badge = 'Legend'
    rarity = 'Legendary'
    dominantColor = '#FFD700'
    element = 'Light'
    level = 5
  } else if (score >= 80) {
    badge = 'Master'
    rarity = 'Epic'
    dominantColor = '#8B5CF6'
    element = 'Fire'
    level = 4
  } else if (score >= 70) {
    badge = 'Expert'
    rarity = 'Rare'
    dominantColor = '#3B82F6'
    element = 'Water'
    level = 3
  } else if (score >= 60) {
    badge = 'Apprentice'
    rarity = 'Uncommon'
    dominantColor = '#10B981'
    element = 'Air'
    level = 2
  }

  return { badge, rarity, dominantColor, element, level }
}

// Main GitHub Score Calculator Class
export class GitHubScoreCalculator {
  private githubService: any

  constructor(githubService: any) {
    this.githubService = githubService
  }

  async calculateScore(username: string): Promise<GitHubScoreData> {
    try {
      // Fetch all necessary data
      const [userProfile, userRepos, contributionData, externalContributions] = await Promise.all([
        this.githubService.getAuthenticatedUser(),
        this.githubService.getReposForAuthenticatedUser(),
        this.githubService.getContributionData(username),
        this.githubService.getExternalContributions(username)
      ])
      
      const profileReadmeContent = await this.githubService.getRepoFileContent(userProfile.login, userProfile.login, 'README.md')

      // Analyze profile README
      const readmeAnalysis = analyzeProfileReadme(profileReadmeContent)
      const profileScore = calculateProfileScore(userProfile, contributionData, readmeAnalysis)
      
      // Analyze repositories
      const {
        repos: analyzedRepos,
        repositoryScore,
        allTechnologies,
        allBlockchains,
        languageUsage,
        allCommits,
        technologyCounts,
      } = await this.calculateRepositoryScore(userRepos)
      
      const totalScore = Math.round(
        profileScore * (SCORE_WEIGHTS.profile / 100) +
        repositoryScore * (SCORE_WEIGHTS.repos / 100)
      )

      // Generate patterns and insights
      const patterns = analyzeCommitPatterns(allCommits)
      const contributionDays: { date: string; contributionCount: number }[] =
        contributionData?.contributionsCollection.contributionCalendar.weeks.flatMap(
          (w: any) => w.contributionDays
        ) || []
        
      const streak = calculateStreak(contributionDays)
      const confidenceScore = calculateConfidenceScore(userProfile.created_at, contributionDays)
      const heatmapActivity = contributionDays.reduce((acc: Record<string, number>, day) => {
        acc[day.date] = day.contributionCount
        return acc
      }, {})

      const devStyle = []
      if (patterns.commitsAtNight) devStyle.push('Night Hacker')
      if (patterns.weekendActivity) devStyle.push('Weekend Warrior')
      if (patterns.earlyBird) devStyle.push('Early Bird')

      const hasFrontend = analyzedRepos.some((r: any) => r.type === 'Frontend' || r.type === 'Fullstack')
      const hasBackend = analyzedRepos.some((r: any) => r.type === 'Backend' || r.type === 'Fullstack')
      const isFullstack = hasFrontend && hasBackend
      const hasWeb3 = analyzedRepos.some((r: any) => r.web3)
      const hasSmartContracts = analyzedRepos.some((r: any) => r.smartContract)

      const topRepos = analyzedRepos
        .sort((a: any, b: any) => {
          const significanceA = ((a.score / 20) + Math.log10(a.stars + 1))
          const significanceB = ((b.score / 20) + Math.log10(b.stars + 1))
          return significanceB - significanceA
        })
        .slice(0, 10)

      const { languages, frameworks } = calculateSkillStrength(
        languageUsage,
        allTechnologies,
        technologyCounts
      )

      // Generate AI insights (simplified version)
      const persona = this.generatePersona(totalScore, devStyle, languages, hasWeb3, hasSmartContracts)
      const recommendation = this.generateRecommendation(totalScore, confidenceScore, persona, analyzedRepos)

      // Generate NFT attributes
      const nftAttributes = generateNftAttributes(totalScore, devStyle, new Set(languages.map((l: any) => l.name)), persona.type)

      // Build final score data
      const scoreData: GitHubScoreData = {
        username: userProfile.login,
        scoreVersion: '1.0',
        confidenceScore,
        totalScore,
        scoreBreakdown: { profileScore, repositoryScore, weights: SCORE_WEIGHTS },
        nftAttributes,
        persona: { ...persona, devStyle },
        profile: {
          accountCreated: userProfile.created_at,
          accountAgeYears: new Date().getFullYear() - new Date(userProfile.created_at).getFullYear(),
          followers: userProfile.followers,
          following: userProfile.following,
          publicRepos: userProfile.public_repos,
          privateRepos: userRepos.filter((r: any) => r.private).length,
          hasProfileReadme: !!profileReadmeContent,
          readmeRichness: readmeAnalysis.readmeRichness,
          readmeStructureScore: readmeAnalysis.readmeStructureScore,
          profileLinks: userProfile.blog ? [userProfile.blog] : [],
          heatmapActivity,
          contributionsBreakdown: { 
            commits: contributionData?.contributionsCollection.contributionCalendar.totalContributions || 0, 
            pullRequests: contributionData?.contributionsCollection.pullRequestContributions.totalCount || 0, 
            issues: contributionData?.contributionsCollection.issueContributions.totalCount || 0, 
            codeReviews: contributionData?.contributionsCollection.pullRequestReviewContributions.totalCount || 0 
          },
          streak,
          patterns,
        },
        skills: { 
          languages: languages.filter((l: any) => l.usagePercent > 0),
          frameworks,
          isFullstack,
          frontend: hasFrontend,
          backend: hasBackend,
          web3: hasWeb3,
          blockchains: [...allBlockchains],
          smartContracts: hasSmartContracts,
          smartContractLang: [...analyzedRepos.reduce((acc: Set<string>, repo: any) => {
            (repo.smartContractLang || []).forEach((lang: string) => acc.add(lang))
            return acc
          }, new Set<string>())],
          ercStandards: [...analyzedRepos.reduce((acc: Set<string>, repo: any) => {
            (repo.ercStandards || []).forEach((std: string) => acc.add(std))
            return acc
          }, new Set<string>())],
          infra: (frameworks.devops || []).map((f: any) => f.name),
          testing: (frameworks.testing || []).map((f: any) => f.name),
          security: [] 
        },
        repos: analyzedRepos,
        metaInsights: this.getDeterministicMetaInsights(analyzedRepos, externalContributions),
        recommendation,
      }

      return scoreData

    } catch (error) {
      console.error('Error calculating GitHub score:', error)
      throw error
    }
  }

  private async calculateRepositoryScore(repos: any[]): Promise<any> {
    let weightedScoreSum = 0
    let totalSignificance = 0
    const analyzedReposData: any[] = []
    const allTechnologies = new Set<string>()
    const allBlockchains = new Set<string>()
    const languageUsage = new Map<string, number>()
    const allCommits: any[] = []
    const technologyCounts = new Map<string, number>()

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const relevantRepos = repos.filter(repo => {
      const isOldAndUnpopular = !repo.fork && repo.stargazers_count < 2 && new Date(repo.pushed_at) < sixMonthsAgo
      return !isOldAndUnpopular
    })

    const analysisPromises = relevantRepos.map(async (repo) => {
      const owner = repo.owner.login
      const repoName = repo.name

      const fileTree = await this.githubService.getRepoTree(owner, repoName, repo.default_branch)
        
      const packageJsonPath = fileTree?.find((f: any) => f.path.endsWith('package.json'))?.path
      const cargoTomlPath = fileTree?.find((f: any) => f.path.endsWith('Cargo.toml'))?.path
      const readmePath = fileTree?.find((f: any) => f.path.toLowerCase().endsWith('readme.md'))?.path
      const representativeContractPath = fileTree?.find((f: any) => f.path.endsWith('.sol'))?.path
      
      const [packageJsonContent, cargoTomlContent, readmeContent, representativeContractContent] = await Promise.all([
        packageJsonPath ? this.githubService.getRepoFileContent(owner, repoName, packageJsonPath) : Promise.resolve(null),
        cargoTomlPath ? this.githubService.getRepoFileContent(owner, repoName, cargoTomlPath) : Promise.resolve(null),
        readmePath ? this.githubService.getRepoFileContent(owner, repoName, readmePath) : Promise.resolve(null),
        representativeContractPath ? this.githubService.getRepoFileContent(owner, repoName, representativeContractPath) : Promise.resolve(null)
      ])

      const filesExistence = {
        'dockerfile': fileTree?.some((f: any) => f.path.toLowerCase().endsWith('dockerfile')) || false,
        '.github/workflows': fileTree?.some((f: any) => f.path.includes('.github/workflows')) || false,
        'audits': fileTree?.some((f: any) => f.path.toLowerCase().includes('audit')) || false,
        'tests': fileTree?.some((f: any) => f.path.toLowerCase().includes('test')) || false,
      }

      const analysisContext = { packageJsonContent, readmeContent, filesExistence, cargoTomlContent, primaryLanguage: repo.language, representativeContractContent, fileTree }
      const analysis = analyzeRepository(analysisContext)
      
      analysis.technologies.forEach(tech => {
        technologyCounts.set(tech, (technologyCounts.get(tech) || 0) + 1)
      })

      const score = calculateRepoScore(repo, analysis)

      const commitHistory = await this.githubService.getRepoCommitHistory(owner, repoName)
      const commitFrequency = this.calculateCommitFrequency(commitHistory)

      if (commitHistory) {
        allCommits.push(...commitHistory)
      }

      analysis.technologies.forEach((t: string) => allTechnologies.add(t))
      if (analysis.web3.blockchain) allBlockchains.add(analysis.web3.blockchain)
      
      const repoLanguages = await this.githubService.getRepoLanguages(owner, repoName)
      for (const [lang, bytes] of Object.entries(repoLanguages)) {
        languageUsage.set(lang, (languageUsage.get(lang) || 0) + (bytes as number))
      }

      const collaborators = await this.githubService.getRepoCollaborators(owner, repoName)

      return { baseRepoData: repo, analysis, score, collaborators, commitFrequency }
    })

    const results = await Promise.all(analysisPromises)

    for (const result of results) {
      if (!result) continue
      const { baseRepoData, analysis, score, collaborators, commitFrequency } = result

      analyzedReposData.push({
        name: baseRepoData.name,
        private: baseRepoData.private,
        language: baseRepoData.language,
        frameworks: [...analysis.technologies],
        type: analysis.projectType,
        score,
        web3: analysis.web3.isWeb3,
        web3Category: analysis.web3.web3Category,
        blockchain: analysis.web3.blockchain,
        smartContract: analysis.web3.hasSmartContracts,
        smartContractLang: [...analysis.smartContractLanguages],
        hasTests: analysis.qualityMetrics.hasTests,
        hasCI: analysis.qualityMetrics.hasCI,
        readmeQuality: analysis.qualityMetrics.readmeQuality,
        commitFrequency,
        lastCommit: baseRepoData.pushed_at,
        stars: baseRepoData.stargazers_count,
        forks: baseRepoData.forks_count,
        collaborators: collaborators.length,
        projectStructureScore: analysis.qualityMetrics.projectStructureScore,
        linting: analysis.qualityMetrics.hasLinting,
        dockerized: analysis.qualityMetrics.hasDockerfile,
        audited: analysis.web3.audited,
        hasContractTests: analysis.web3.hasContractTests,
        ercStandards: analysis.web3.ercStandards,
      })
    }

    const topReposForScore = analyzedReposData
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 10)
    
    let topWeightedScoreSum = 0
    let topTotalSignificance = 0

    for (const repo of topReposForScore) {
      const repoSignificance = ((repo.score / 20) + Math.log10(repo.stars + 1) + Math.log10(repo.forks + 1))
      topWeightedScoreSum += repo.score * repoSignificance
      topTotalSignificance += repoSignificance
    }

    const repositoryScore = topTotalSignificance > 0 ? topWeightedScoreSum / topTotalSignificance : 0
      
    return {
      repos: analyzedReposData,
      repositoryScore: clamp(repositoryScore, 0, 100),
      allTechnologies,
      allBlockchains,
      languageUsage,
      allCommits,
      technologyCounts
    }
  }

  private calculateCommitFrequency(commitHistory: any[]): string {
    if (!commitHistory || commitHistory.length === 0) return 'inactive'

    const now = new Date()
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    
    const recentCommits = commitHistory.filter(commit => 
      new Date(commit.commit.author.date) > threeMonthsAgo
    )

    if (recentCommits.length === 0) return 'inactive'
    
    const daysSinceLastCommit = (now.getTime() - new Date(recentCommits[0].commit.author.date).getTime()) / (1000 * 60 * 60 * 24)
    
    if (daysSinceLastCommit <= 1) return 'daily'
    if (daysSinceLastCommit <= 7) return 'weekly'
    return 'monthly'
  }

  private getDeterministicMetaInsights(analyzedRepos: any[], externalContributions: any) {
    const activelyMaintainedProjects = analyzedRepos.filter((r: any) => r.commitFrequency === 'daily' || r.commitFrequency === 'weekly').length
    const popularProjects = analyzedRepos.filter((r: any) => r.stars > 50).length

    return {
      hasPRsInExternalRepos: externalContributions.total_count > 0,
      projectsPersonal: analyzedRepos.filter((r: any) => r.collaborators === 1).length,
      projectsCollaborative: analyzedRepos.filter((r: any) => r.collaborators > 1).length,
      activelyMaintainedProjects,
      hasMaintainedPopularProject: popularProjects > 0 && activelyMaintainedProjects > 0,
      busFactor: analyzedRepos.length > 0 
        ? Math.round((analyzedRepos.filter((r: any) => r.collaborators === 1 && r.stars > 2).length / analyzedRepos.filter((r: any) => r.stars > 2).length) * 100)
        : 0,
    }
  }

  private generatePersona(score: number, devStyle: string[], languages: any[], hasWeb3: boolean, hasSmartContracts: boolean) {
    let type = 'Developer'
    const strengths: string[] = []
    const weaknesses: string[] = []

    if (score >= 90) {
      type = 'Senior Full-Stack Developer'
      strengths.push('Exceptional code quality', 'Strong project management', 'Excellent communication')
    } else if (score >= 80) {
      type = 'Full-Stack Developer'
      strengths.push('Solid technical skills', 'Good project experience', 'Reliable delivery')
    } else if (score >= 70) {
      type = 'Mid-Level Developer'
      strengths.push('Good foundation', 'Growing experience', 'Learning mindset')
    } else if (score >= 60) {
      type = 'Junior Developer'
      strengths.push('Enthusiasm', 'Willingness to learn', 'Fresh perspective')
      weaknesses.push('Limited experience', 'Needs mentorship')
    } else {
      type = 'Beginner Developer'
      weaknesses.push('Limited experience', 'Needs significant guidance', 'Learning curve ahead')
    }

    if (hasWeb3) {
      type += ' (Web3)'
      strengths.push('Blockchain experience')
    }

    if (hasSmartContracts) {
      strengths.push('Smart contract development')
    }

    if (languages.length > 5) {
      strengths.push('Polyglot programmer')
    }

    return { type, strengths, weaknesses }
  }

  private generateRecommendation(score: number, confidenceScore: number, persona: any, repos: any[]) {
    let trustLevel = 'Medium'
    let summary = 'Competent developer with room for growth'
    const riskFactors: string[] = []
    const notableStrengths: string[] = []
    const suggestedRoles: any[] = []

    if (score >= 90) {
      trustLevel = 'High'
      summary = 'Exceptional developer with outstanding track record'
      notableStrengths.push('Senior-level expertise', 'Proven track record', 'High-quality code')
      suggestedRoles.push({
        title: 'Senior Developer',
        reason: 'Demonstrates exceptional skills and experience'
      })
    } else if (score >= 80) {
      trustLevel = 'High'
      summary = 'Highly skilled developer with strong experience'
      notableStrengths.push('Strong technical skills', 'Good project experience')
      suggestedRoles.push({
        title: 'Mid-Senior Developer',
        reason: 'Shows strong technical capabilities'
      })
    } else if (score >= 70) {
      trustLevel = 'Medium'
      summary = 'Competent developer with good foundation'
      notableStrengths.push('Solid foundation', 'Growing experience')
      suggestedRoles.push({
        title: 'Mid-Level Developer',
        reason: 'Shows good potential and growing skills'
      })
    } else if (score >= 60) {
      trustLevel = 'Medium'
      summary = 'Developing developer with learning potential'
      riskFactors.push('Limited experience', 'May need mentorship')
      suggestedRoles.push({
        title: 'Junior Developer',
        reason: 'Shows enthusiasm and learning potential'
      })
    } else {
      trustLevel = 'Low'
      summary = 'Beginner developer requiring significant support'
      riskFactors.push('Very limited experience', 'High learning curve', 'Needs extensive guidance')
      suggestedRoles.push({
        title: 'Intern/Junior Developer',
        reason: 'Requires mentorship and guidance'
      })
    }

    if (confidenceScore < 5) {
      riskFactors.push('Limited activity history', 'Inconsistent contribution patterns')
    }

    return {
      summary,
      trustLevel,
      riskFactors,
      notableStrengths,
      suggestedRoles
    }
  }
} 