import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { repositoryRoot, runBun } from './test-feedback/command.ts';
import { DOMAIN_MANIFESTS } from './test-feedback/domains.ts';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args[0] === '--list') {
  for (const [name, manifest] of Object.entries(DOMAIN_MANIFESTS)) {
    console.log(
      `${name}\towner=${manifest.owner}\tbudget=${manifest.maxSeconds}s\t${manifest.reason}`,
    );
  }
  process.exit(0);
}

const domain = args[0];
if (!domain) {
  console.error('[check:domain] expected a domain name; use --list to inspect the registry');
  process.exit(2);
}

const manifest = DOMAIN_MANIFESTS[domain];
if (!manifest) {
  console.error(`[check:domain] unknown domain '${domain}'; use --list to inspect the registry`);
  process.exit(2);
}

console.log(`[check:domain] ${domain}: ${manifest.reason}`);
console.log(`[check:domain] owner=${manifest.owner}; budget=${manifest.maxSeconds}s`);
const resultDirectory = process.env.TEST_RESULTS_DIR;
if (resultDirectory) mkdirSync(resolve(repositoryRoot, resultDirectory), { recursive: true });
for (const [index, command] of manifest.commands.entries()) {
  const canReport = command.args[0] === 'test' || command.args.includes('test:dom');
  const reporterArgs =
    resultDirectory && canReport
      ? [
          '--reporter=junit',
          `--reporter-outfile=${resolve(repositoryRoot, resultDirectory, `${domain}-${index + 1}.xml`)}`,
        ]
      : [];
  const status = runBun({ ...command, args: [...command.args, ...reporterArgs] });
  if (status !== 0) process.exit(status);
}
