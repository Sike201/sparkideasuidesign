import jupiterLogo from './SvgJupiter.png';

export const SvgJupiter = (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
  return <img src={jupiterLogo} alt="Jupiter" {...props} />;
};
