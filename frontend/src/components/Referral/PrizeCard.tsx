import React from "react";
import { Icon } from "../Icon/Icon";
import Img from "@/components/Image/Img";

type PrizeCardProps = {
  colorIcon: string;
  title: string | React.ReactNode;
  subtitle: string;
  amount: string;
  type: "grand" | "gold" | "silver" | "bronze";
  logoUrl?: string;
};

/**
 * Component for displaying individual prize cards with consistent styling
 */
const PrizeCard: React.FC<PrizeCardProps> = ({
  colorIcon,
  title,
  subtitle,
  amount,
  type,
  logoUrl,
}) => {
  return (
    <div
      className={`flex h-[88px] md:h-[68px] w-full max-w-[343px] md:max-w-[430px] lg:min-w-[430px] items-center justify-between rounded-lg p-3 prize-card-gradient prize-card-${type} bg-grand-prize`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/20">
          <Icon icon="SvgTrophy" className={`text-xl`} style={{ color: colorIcon }} />
        </div>
        <div className="flex flex-col max-w-[163px] md:max-w-[1000px]">
          <p className="font-medium text-white">{title}</p>
          <p className="text-sm text-fg-primary/70">{subtitle}</p>
        </div>
      </div>
      <div className="flex gap-2 items-center">
        {logoUrl && (
          <Img
            src={logoUrl}
            isFetchingLink={false}
            imgClassName="scale-[102%]"
            isRounded={true}
            size="5"
          />
        )}
        <p className={`font-medium`} style={{ color: colorIcon }}>{amount}$</p>
      </div>
    </div>
  );
};

export default PrizeCard; 