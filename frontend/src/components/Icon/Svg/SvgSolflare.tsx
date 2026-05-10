import solflareLogo from './SvgSolflare.svg';

export const SvgSolflare = (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
  return <img src={solflareLogo} alt="Solflare" {...props} />;
};
