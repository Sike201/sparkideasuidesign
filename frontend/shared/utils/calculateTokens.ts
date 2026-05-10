import { ProjectModel } from "../models"
import { formatCurrencyAmount } from "./format"

type Props = { projectData: ProjectModel; borgCoinInput: number | null; borgPriceInUSD: number | null }

/**
 * Very important function, needs a better name...
 * TODO type the response
 * TODO add raw amounts, ui amounts, display amounts, exchange data, all stuff (hard to explain, ask Milan)
 * @param projectData
 * @param borgCoinInput
 * @param borgPriceInUSD
 */
export const calculateTokens = ({ projectData, borgCoinInput, borgPriceInUSD }: Props) => {
  const raiseTargetInUsd = projectData.config.raiseTargetInUsd
  const fixedTokenPriceInUsd = projectData.config.launchedTokenData.fixedTokenPriceInUsd
  const lpPositionToBeBurned = projectData.config.lpPositionToBeBurned
  const totalTokensForRewardDistribution = projectData.config.totalTokensForRewardDistribution

  const tokenPriceInUSD = fixedTokenPriceInUsd //
  // TODO @vanja why this line?
  const tokenPriceInBORG = !borgPriceInUSD ? null : tokenPriceInUSD / borgPriceInUSD

  // if LBP position is burned, lp size is twice as larger than raise target
  const lpSizeFactor = lpPositionToBeBurned ? 1 : 2

  const getLpPositions = () => {
    if (!borgCoinInput || !tokenPriceInBORG || !tokenPriceInUSD || !borgPriceInUSD)
      return {
        tokenLp: { formatted: "0", unformatted: null },
        borgLp: { formatted: "0", unformatted: null },
      }
    const tokenLpUnformatted = +borgCoinInput / lpSizeFactor / tokenPriceInBORG
    const borgLpUnformatted = +borgCoinInput / lpSizeFactor
    return {
      tokenLp: {
        formatted: formatCurrencyAmount(tokenLpUnformatted) || "0",
        unformatted: tokenLpUnformatted,
        usd: formatCurrencyAmount(tokenLpUnformatted * tokenPriceInUSD, { withDollarSign: true }),
      },
      borgLp: {
        formatted: formatCurrencyAmount(borgLpUnformatted) || "0",
        unformatted: borgLpUnformatted,
        usd: formatCurrencyAmount(borgLpUnformatted * borgPriceInUSD, { withDollarSign: true }),
      },
    }
  }

  const getTokenRewards = () => {
    if (!borgCoinInput || !tokenPriceInBORG || !borgPriceInUSD) return { formatted: "0", unformatted: null }

    // token pool size value in dollars is equivalent to BORG pool size, which is the raise target
    const tokenPoolSize = raiseTargetInUsd

    // 1 dollar invested gives this much reward tokens
    const oneInvestedDollarGives = totalTokensForRewardDistribution / tokenPoolSize

    // 1 BORG invested gives this much reward tokens
    const oneInvestedBorgGives = borgPriceInUSD * oneInvestedDollarGives

    // total invested BORG gives this much reward tokens
    const totalInvestedBorgGives = +borgCoinInput * oneInvestedBorgGives

    return {
      unformatted: totalInvestedBorgGives,
      formatted: formatCurrencyAmount(totalInvestedBorgGives) || "0",
      usd: tokenPriceInUSD
        ? formatCurrencyAmount(totalInvestedBorgGives * tokenPriceInUSD, { withDollarSign: true })
        : "0",
    }
  }

  const liquidityPoolValues = getLpPositions()

  const getTotalTokensToBeReceived = () => {
    const totalTokensFromLiquidityPool = liquidityPoolValues.tokenLp?.unformatted || 0
    const totalTokensReceivedInRewardsDistribution = getTokenRewards().unformatted || 0
    const totalTargetToken = formatCurrencyAmount(
      totalTokensReceivedInRewardsDistribution + totalTokensFromLiquidityPool,
    )
    return totalTargetToken
  }

  const lpPosition = {
    borg: liquidityPoolValues.borgLp.formatted,
    borgRaw: liquidityPoolValues.borgLp.unformatted,
    borgInUSD: liquidityPoolValues.borgLp.usd,
    token: liquidityPoolValues.tokenLp.formatted,
    tokenRaw: liquidityPoolValues.tokenLp.unformatted,
    tokenInUSD: liquidityPoolValues.tokenLp.usd,
  }
  const rewardDistribution = {
    token: getTokenRewards().formatted,
    tokenRaw: getTokenRewards().unformatted,
    tokenInUSD: getTokenRewards().usd,
  }
  const totalToBeReceived = {
    borg: liquidityPoolValues.borgLp.formatted,
    token: getTotalTokensToBeReceived(),
  }

  return { lpPosition, rewardDistribution, totalToBeReceived }
}
