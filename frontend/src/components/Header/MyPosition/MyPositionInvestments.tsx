import Img from "../../Image/Img"
import { useQuery } from "@tanstack/react-query"
import { userApi } from "@/data/userApi"
import { useWalletContext } from "@/hooks/useWalletContext"
import { UserInvestmentByProjects } from "shared/types/user-types"
import { isAfter } from "date-fns"
import { formatCurrencyAmount } from "shared/utils/format"
import Text from "@/components/Text"
import { useNavigate } from "react-router-dom"

const skeletonItems = Array.from({ length: 3 }, (_, i) => i)

const Pools = () => {
  const { address, isWalletConnected } = useWalletContext()

  const { data, isLoading } = useQuery({
    queryFn: () => userApi.getUsersInvestments({ address }),
    queryKey: ["getUsersInvestments", address],
    enabled: isWalletConnected,
    refetchOnMount: false,
  })
  // console.log(data.length)
  const investments = data?.investments
  const totalInvestmentsValue = data?.sumInvestments
    ? formatCurrencyAmount(data.sumInvestments, {
      withDollarSign: true,
      customDecimals: 2,
    })
    : "0.0"
  const isLoadingOrThereIsValue = isLoading || (!isLoading && !!data?.investments.length)

  return (
    <div className="flex w-full flex-col gap-6">
      {isLoadingOrThereIsValue ? (
        <>
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm text-fg-tertiary">Total Invested</span>
            <Text
              isLoading={isLoading}
              className="text-4xl font-semibold text-fg-primary"
              text={totalInvestmentsValue}
            />
          </div>
          <div className="flex max-h-[500px] w-full flex-col items-start gap-1 overflow-y-auto">
            <span className="text-sm text-fg-tertiary">{"Investments"}</span>
            {isLoading
              ? skeletonItems.map((item) => <InvestedAsset isLoading={isLoading} key={item} />)
              : investments?.map((investment) => <InvestedAsset key={investment.projectId} investment={investment} />)}
          </div>
        </>
      ) : (
        <span className="text-sm text-fg-tertiary">{"No investments so far."}</span>
      )}
    </div>
  )
}

type InvestedAssetProps = {
  investment?: UserInvestmentByProjects
  isLoading?: boolean
}

const InvestedAsset = ({ investment, isLoading }: InvestedAssetProps) => {
  const totalInvestmentInUSD = investment?.totalInvestmentInUSD
  const project = investment?.project
  const navigate = useNavigate()

  const saleOverDate = project?.info.timeline.find((phase) => phase.id === "SALE_CLOSES")?.date
  const displayRewardsAvailable = saleOverDate ? isAfter(new Date(), saleOverDate) : false
  const projectUrl = `${window.location.origin}${"/"}`
  const totalInvestmentValue = formatCurrencyAmount(totalInvestmentInUSD, {
    withDollarSign: true,
    customDecimals: 2,
  })

  const onClickHandler = () => {
    navigate("/")
  }

  return (
    <div
      className="flex w-full cursor-pointer items-center justify-between gap-4 bg-gradient-to-r to-[80%] py-3 hover:from-transparent hover:via-brand-primary/10 hover:via-[20%] hover:to-transparent"
      onClick={onClickHandler}
    >
      <div className="flex w-full items-center gap-4">
        <Img isRounded src={project?.info.logoUrl} size="6" />
        <div className="flex flex-col items-start">
          <Text text={project?.info.title} className="text-sm font-medium" isLoading={isLoading} />
          {displayRewardsAvailable && (
            <a
              href={projectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-primary underline"
            >
              Rewards available
            </a>
          )}
        </div>
      </div>
      <Text text={totalInvestmentValue} isLoading={isLoading} />
    </div>
  )
}

export default Pools
