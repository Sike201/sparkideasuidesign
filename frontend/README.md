# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Getting Started

### Install Node.js v20
Current version that we use in project is Node.js v20.
If you already have different Node.js version, there is a tool called NVM. You can easily install Node.js version with CLI command and switch between different versions.
https://www.freecodecamp.org/news/node-version-manager-nvm-install-guide/

Or you can download it from Node.js official website
https://nodejs.org/en/download

### Install packages
`npm install`

### Run development environment locally
`npm run dev`
open `localhost:5173` in your browser



## Generating API with openapi 
1. copy most recent `openapi.json` file from backend repository (`https://bitbucket.org/codetribe/volos-backend/src/develop/`)
2. paste in root folder of frontend repository
3. run command `npm run api:generate`

in diff you will be able to see what apis are recently added.



## Icons

### Using Icons
- We don't have .svg assets. Every svg file is turned into React component.
- to use icons just write 'Icon' JSX component and add 'icon' property with value of icon that you would like to use. 
- Icons are resized by using font sizes, specifically tailwind classes for font sizes. For example `text-xl` will give you an icon that has a height of 20px. Tailwind classes for font sizes can be found here: https://tailwindcss.com/docs/font-size
- Icon colors are changed by using tailwind text color classes. https://tailwindcss.com/docs/text-color.
- If you use tailwind-merge in component's className property, you can easily manipulate its properties dinamically.
- We find this approach most effective and easy to use, with no time lost on optimizing icon sizes, viewboxes, colors, width, height, etc.

Example:
<Icon icon="SvgChevDown" className="text-red-400 text-xl" />

### Creating Icons
- obtain .svg file that you would like to use
- copy svg code to SVG INPUT textarea on https://react-svgr.com/playground/ and copy JSX OUTPUT from the same page.
- create new React component in `src/components/Icon/Svg` with prefix "Svg"
- paste obtained JSX output. Update other props as per other icon components: change component name, remove width & height props, leave viewbox, etc.
- add new component name in `index.ts` file in `src/components/Icon/Svg/index.ts`
- new icon can be used now