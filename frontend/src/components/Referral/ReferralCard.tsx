import React from "react";
import { twMerge } from "tailwind-merge";
import { Icon } from "../Icon/Icon";
import Img from "@/components/Image/Img";
import { ConnectButton } from "../Header/ConnectButton";
import { Button } from "../Button/Button";

type IconType = "SvgTrophy" | "SvgMedal" | "SvgCircledCheckmark" | "SvgTicket";

type ReferralCardProps = {
  title: string;
  icon?: IconType;
  value?: string;
  subtitle1?: string;
  subtitle2?: string;
  onValueClick1?: () => void;
  onValueClick2?: () => void;
  isTicket?: boolean;
  isRewardPool?: boolean;
  showConnectButton?: boolean;
  showSignToUButton?: boolean;
  onSignToUClick?: () => void;
  logoUrl?: string;
};

/**
 * Component for displaying referral information cards in the dashboard
 */
const ReferralCard: React.FC<ReferralCardProps> = ({
  title,
  icon,
  value,
  subtitle1,
  subtitle2,
  onValueClick1,
  onValueClick2,
  isTicket,
  isRewardPool,
  showConnectButton,
  showSignToUButton,
  onSignToUClick,
  logoUrl,
}) => {
  return (
    <div className="flex flex-col max-w-[165.5px] h-[114px] md:max-w-[201px] md:min-w-[170px] md:h-[118px] rounded-lg bg-secondary p-4">
      <span className="font-vcr text-fg-secondary text-sm md:text-lg font-normal mb-2 uppercase">
        {title}
      </span>

      <div className="flex items-center gap-2 mb-1">
        {(title === "Reward Pool" || title === "Your Rewards") && logoUrl ? (
          <Img
            src={logoUrl}
            isFetchingLink={false}
            imgClassName="scale-[102%]"
            isRounded={true}
            size="4"
          />
        ) : icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/20">
            <Icon
              icon={icon}
              className={twMerge(
                "text-base text-brand-primary",
                isTicket && "-rotate-[35deg]"
              )}
            />
          </div>
        )}
        {value && !isRewardPool && (
          <span
            className={twMerge(
              "text-base md:text-xl font-medium text-white",
              onValueClick1 && "cursor-pointer transition-colors"
            )}
            onClick={onValueClick1}
          >
            {value}
          </span>
        )}
        {value && isRewardPool && (
          <span className="text-base md:text-xl font-medium text-white">
            {value}$
          </span>
        )}
      </div>

      {showConnectButton ? (
        <div className="mt-auto">
          <ConnectButton size="xs" />
        </div>
      ) : showSignToUButton ? (
        <div className="mt-auto">
          <Button
            btnText="Sign ToU"
            size="xs"
            onClick={onSignToUClick}
          />
        </div>
      ) : (
        <div className="flex justify-between w-full mt-auto">
          <span
            className={twMerge(
              "text-xs text-fg-primary/70",
              onValueClick1 && "cursor-pointer underline transition-colors"
            )}
            onClick={onValueClick1}
          >
            {subtitle1}
          </span>
          <span
            className={twMerge(
              "text-xs text-fg-primary/70",
              onValueClick2 && "cursor-pointer underline transition-colors"
            )}
            onClick={onValueClick2}
          >
            {subtitle2}
          </span>
        </div>
      )}
    </div>
  );
};

export default ReferralCard; 