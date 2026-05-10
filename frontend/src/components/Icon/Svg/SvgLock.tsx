import { SVGProps } from "react"

export const SvgLock = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="currentColor"
    viewBox="0 0 16 17"
    {...props}
  >
    <g clipPath="url(#a)" opacity={0.25}>
      <path
        fill="#F5F5F6"
        fillRule="evenodd"
        d="M3.999 5.834a4 4 0 0 1 8 0h.667a1.333 1.333 0 0 1 1.333 1.333v6.667a1.333 1.333 0 0 1-1.333 1.333H3.332A1.333 1.333 0 0 1 2 13.834V7.167a1.333 1.333 0 0 1 1.333-1.333H4Zm4-2.667a2.667 2.667 0 0 1 2.667 2.667H5.332A2.667 2.667 0 0 1 8 3.167Zm1.333 6.667a1.333 1.333 0 0 1-.666 1.154v.846a.666.666 0 1 1-1.334 0v-.846a1.334 1.334 0 1 1 2-1.154Z"
        clipRule="evenodd"
      />
    </g>
    <defs>
      <clipPath id="a">
        <path fill="#fff" d="M0 .5h16v16H0z" />
      </clipPath>
    </defs>
  </svg>
)
