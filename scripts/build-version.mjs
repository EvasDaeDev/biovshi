import {readFileSync} from 'node:fs';

const {version}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
// GitHub Actions supplies a distinct build number on every publication.
export const buildVersion=process.env.GITHUB_RUN_NUMBER
  ? `${version}+build.${process.env.GITHUB_RUN_NUMBER}`
  : `${version}+dev`;
