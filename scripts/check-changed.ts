import { computeAffectedPlan, readChangedFiles } from './test-feedback/affected.ts';
import { runBunScript } from './test-feedback/command.ts';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const pr = args.includes('--pr');
const planOnly = args.includes('--plan');
const json = args.includes('--json');
const baseIndex = args.indexOf('--base');
const baseRef = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
if (baseIndex >= 0 && !baseRef) {
  console.error('[check:changed] --base requires a git ref');
  process.exit(2);
}

const changedFiles = readChangedFiles({ pr, baseRef });
const plan = computeAffectedPlan(changedFiles);

if (json) {
  console.log(JSON.stringify(plan));
} else {
  console.log(`[check:changed] files=${plan.changedFiles.length}`);
  for (const file of plan.changedFiles) console.log(`  ${file}`);
  console.log(`[check:changed] repository=${plan.repository}; docsOnly=${plan.docsOnly}`);
  if (plan.packages.length > 0) console.log(`[check:changed] packages=${plan.packages.join(', ')}`);
  if (plan.domains.length > 0) console.log(`[check:changed] domains=${plan.domains.join(', ')}`);
  for (const reason of plan.reasons) console.log(`[check:changed] ${reason}`);
}

if (planOnly || plan.changedFiles.length === 0) process.exit(0);

const commands: string[][] = [];
if (plan.repository) {
  commands.push(['check:repository']);
} else if (plan.docsOnly) {
  commands.push(['check:doc-links'], ['--cwd', 'docs', 'test']);
} else {
  for (const domain of plan.domains) commands.push(['check:domain', '--', domain]);
  for (const packageKey of plan.packages) commands.push(['check:package', '--', packageKey]);
}

for (const command of commands) {
  const status = runBunScript(command);
  if (status !== 0) process.exit(status);
}
