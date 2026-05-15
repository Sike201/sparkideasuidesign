import { Link } from "react-router-dom";
import { ROUTES } from "@/utils/routes";

/** Spark wordmark — same asset/sizing as HackathonLayout nav. */
const LOGO_IMG_CLASS = "h-6 w-auto md:h-7";

type SparkLogoLinkProps = {
  className?: string;
};

export function SparkLogoLink({ className = "" }: SparkLogoLinkProps) {
  return (
    <Link
      to={ROUTES.LANDING_PAGE}
      className={`shrink-0 opacity-90 transition-opacity hover:opacity-100 ${className}`.trim()}
    >
      <img src="/sparklogo.png" alt="Spark" className={LOGO_IMG_CLASS} />
    </Link>
  );
}

export default SparkLogoLink;
