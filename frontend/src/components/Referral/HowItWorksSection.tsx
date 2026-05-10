import React from "react";
import { SimpleModal } from "../Modal/SimpleModal";
import { Button } from "../Button/Button";
import NumberedRow from "./NumberedRow";
import PrizeCard from "./PrizeCard";
import { formatCurrencyAmount } from "shared/utils/format";
import { ProjectDataTypeForReferral } from "./types";

type HowItWorksSectionProps = {
  onContinue: () => void;
  onClose: () => void;
  projectData?: ProjectDataTypeForReferral;
};

/**
 * Component for the How It Works section
 */
const HowItWorksSection: React.FC<HowItWorksSectionProps> = ({
  onContinue,
  onClose,
  projectData
}) => {
  const totalAmountDistributed = projectData?.config.referralDistribution?.totalAmountDistributed || 0;
  return (
    <SimpleModal
      showCloseBtn
      onClose={onClose}
      className="relative w-full max-w-[1000px] overflow-y-hidden bg-default"
      headerClass="bg-default"
    >
      <div className="flex max-h-[90vh] w-full flex-col items-center overflow-y-auto px-4 pb-[40px] md:flex-row md:items-start md:justify-between md:gap-8 md:px-[40px] md:pb-[100px]">
        {/* Left Column - Refer & Earn */}
        <div className="flex w-full flex-col items-center md:max-w-[450px]">
          <span className="mb-3 text-center text-2xl font-semibold text-white">
            Refer & Earn
          </span>
          <span className="mb-[24px] text-center text-base font-normal text-fg-secondary">
            How does it works ?
          </span>
          <div className="mb-[24px] flex w-full flex-col gap-4">
            <NumberedRow
              number={1}
              text={
                <>
                  Ask friends to use your referral code.
                </>
              }
            />

            <NumberedRow
              number={2}
              text={
                <>
                  You get <span className="text-brand-primary">1 tickets per 1$</span> they invest.
                </>
              }
            />

            <NumberedRow
              number={3}
              text={
                <>
                  When the sale ends, if you are in the <span className="text-brand-primary">top 3 on the leaderboard</span>, you get a guaranteed prize.
                </>
              }
            />

            <NumberedRow
              number={4}
              text={
                <>
                  <span className="text-brand-primary">You can also win one of the prizes</span> in the raffle.
                  <span className="text-brand-primary"> More tickets</span> = the bigger the chance to win !
                </>
              }
            />
          </div>
        </div>

        {/* Right Column - Prize Pool */}
        <div className="flex w-full flex-col items-center md:max-w-[450px]">
          <span className="mb-3 text-center text-2xl font-semibold text-white">
            Prize Pool
          </span>
          <span className="mb-[24px] text-center text-base font-normal text-fg-secondary">
            Total: {formatCurrencyAmount(totalAmountDistributed)}$ of ${projectData?.config.referralDistribution?.tokenTickerDistributed || projectData?.config.launchedTokenData.ticker}
          </span>

          <div className="flex flex-col gap-3">
            <PrizeCard
              colorIcon="#ACFF73"
              title={
                <>
                  <span className="text-fg-secondary">1x </span> Grand Prize
                </>
              }
              subtitle="1st ranking place"
              amount={formatCurrencyAmount(projectData?.config.referralDistribution?.ranking["1"] || 0)}
              type="grand"
              logoUrl={projectData?.config.referralDistribution?.iconUrl || projectData?.info.logoUrl}
            />

            <PrizeCard
              colorIcon="#F2BF7E"
              title={
                <>
                  <span className="text-fg-secondary">1x </span> Gold Prize
                </>
              }
              subtitle="2nd ranking place"
              amount={formatCurrencyAmount(projectData?.config.referralDistribution?.ranking["2"] || 0)}
              type="gold"
              logoUrl={projectData?.config.referralDistribution?.iconUrl || projectData?.info.logoUrl}
            />

            <PrizeCard
              colorIcon="#E1E7EF"
              title={
                <>
                  <span className="text-fg-secondary">1x </span> Silver Prize
                </>
              }
              subtitle="3rd ranking place"
              amount={formatCurrencyAmount(projectData?.config.referralDistribution?.ranking["3"] || 0)}
              type="silver"
              logoUrl={projectData?.config.referralDistribution?.iconUrl || projectData?.info.logoUrl}
            />

            <PrizeCard
              colorIcon="#D38160"
              title={
                <>
                  <span className="text-fg-secondary">{Object.keys(projectData?.config.referralDistribution?.raffle || {}).length}x </span> Bronze Prize
                </>
              }
              subtitle="Raffle winners"
              amount={formatCurrencyAmount(projectData?.config.referralDistribution?.raffle ? Object.values(projectData?.config.referralDistribution?.raffle || {}).reduce((a: number, b: number) => a + (b || 0), 0) / Object.keys(projectData?.config.referralDistribution?.raffle || {}).length : 0)}
              type="bronze"
              logoUrl={projectData?.config.referralDistribution?.iconUrl || projectData?.info.logoUrl}
            />
          </div>
        </div>

        <div className="mt-8 flex justify-center md:fixed md:bottom-8 md:left-1/2 md:-translate-x-1/2 md:w-full">
          <Button
            btnText="Continue"
            color="primary"
            className="max-w-[343px] w-[316px] h-[44px] md:w-[400px] md:h-[44px]"
            onClick={onContinue}
          />
        </div>
      </div>
    </SimpleModal>
  );
};

export default HowItWorksSection; 