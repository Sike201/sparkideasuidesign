import Img from "@/components/Image/Img"
import { userApi } from "@/data/userApi"
import { useWalletContext } from "@/hooks/useWalletContext"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { UserCommitmentByProjects } from "shared/types/user-types"
import { formatCurrencyAmount } from "shared/utils/format"
import Text from "@/components/Text"

const skeletonItems = Array.from({ length: 3 }, (_, i) => i)

const DraftPicksPositions = () => {
  const { address, isWalletConnected } = useWalletContext()

  const { data, isLoading } = useQuery({
    queryFn: () => userApi.getUsersCommitments({ address }),
    queryKey: ["getUsersCommitments", address],
    enabled: isWalletConnected,
    refetchOnMount: false,
  })
  const totalInterestExpressedValue = data?.totalCommitments
    ? formatCurrencyAmount(data.totalCommitments, {
        withDollarSign: true,
        customDecimals: 2,
      })
    : "0.0"
  const isLoadingOrThereIsValue = isLoading || (!isLoading && !!data?.commitments.length)

  return (
    <div className="flex w-full flex-col gap-6">
      {isLoadingOrThereIsValue ? (
        <>
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm text-fg-tertiary">Total Interest Expressed</span>
            <Text
              isLoading={isLoading}
              className="text-4xl font-semibold text-fg-primary"
              text={totalInterestExpressedValue}
            />
          </div>
          <div className="flex max-h-[500px] w-full flex-col items-start gap-1 overflow-y-auto">
            <span className="text-sm text-fg-tertiary">{"Projects committed to"}</span>

            {isLoading
              ? skeletonItems.map((item) => <ProjectItem isLoading={isLoading} key={item} />)
              : data?.commitments?.map((commitment) => (
                  <ProjectItem key={commitment.projectId} commitment={commitment} />
                ))}
          </div>
        </>
      ) : (
        <span className="text-sm text-fg-tertiary">No commitments so far.</span>
      )}
    </div>
  )
}

export default DraftPicksPositions

type ProjectItemProps = { commitment?: UserCommitmentByProjects; isLoading?: boolean }

const ProjectItem = ({ commitment, isLoading }: ProjectItemProps) => {
  const navigate = useNavigate()
  const project = commitment?.project
  const amount = commitment?.amount

  const committedValue = formatCurrencyAmount(amount, {
    withDollarSign: true,
    maxDecimals: 1,
    minDecimals: 1,
  })

  const onClickHandler = () => {
    navigate("/")
  }

  return (
    <div
      onClick={onClickHandler}
      className="flex w-full cursor-pointer items-center justify-between gap-4 bg-gradient-to-r to-[80%] py-3 hover:from-transparent hover:via-brand-primary/10 hover:via-[20%] hover:to-transparent"
    >
      <div className="flex w-full items-center gap-4">
        <Img isRounded src={project?.info.logoUrl} size="6" showFallback={isLoading} />
        <Text text={project?.info.title} className="text-sm font-medium text-fg-primary" isLoading={isLoading} />
      </div>
      <Text text={committedValue} isLoading={isLoading} />
    </div>
  )
}
