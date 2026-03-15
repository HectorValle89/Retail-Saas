import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "next-env.d.ts",
      "scripts/**/*.cjs",
      "tools/**/*.cjs",
    ],
  },
];

export default config;
