import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  // The Electron shell and the electron-builder hook run in Node, outside the
  // bundler: Electron loads the main process and preloads as CommonJS, and
  // electron-builder requires its hooks the same way. `require()` is the only
  // thing that works there, so the project-wide ESM rule does not apply.
  files: ["electron/**/*.js", "scripts/**/*.js"],
  rules: {
    "@typescript-eslint/no-require-imports": "off",
  },
}, {
  ignores: [
    "node_modules/**",
    ".next/**",
    // Desktop build artefacts: the standalone Next server, the packaged app and
    // the installers. Hundreds of MB of generated code — linting it is pure cost.
    ".next-desktop/**",
    "desktop-build/**",
    "dist-desktop/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "examples/**",
    "skills",
  ]
}];

export default eslintConfig;
