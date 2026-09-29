/**
 * Run the three-writer simulator over a seed range and report duplicated and
 * deleted markers per seed.
 *
 *   bun packages/server/scripts/concurrent-writers-fuzz.ts --seeds 0-199 --writers app,web,agent [--steps 400] [--sections 3]
 */
import { parseArgs } from 'node:util';
import { runSimulation, type Writer } from '../src/concurrent-writers.test-helper.ts';

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '0-49' },
    writers: { type: 'string', default: 'app,web,agent' },
    steps: { type: 'string', default: '400' },
    sections: { type: 'string', default: '3' },
    verbose: { type: 'boolean', default: false },
  },
});
const [from, to] = (values.seeds as string).split('-').map(Number);
const writers = (values.writers as string).split(',') as Writer[];

let failing = 0;
let totalDup = 0;
let totalDeleted = 0;
let notConverged = 0;
for (let seed = from; seed <= (to ?? from); seed++) {
  const result = runSimulation({
    seed,
    steps: Number(values.steps),
    writers,
    sections: Number(values.sections),
  });
  totalDup += result.duplicated.length;
  totalDeleted += result.deleted.length;
  if (!result.converged) notConverged++;
  if (result.duplicated.length || result.deleted.length || !result.converged) {
    failing++;
    const first = result.duplicated[0] ?? result.deleted[0];
    const where = first ? result.text.indexOf(first.marker.slice(0, 4)) : -1;
    console.log(
      `seed ${seed}: written ${result.written} dup ${result.duplicated.length} deleted ${result.deleted.length} split ${result.split} converged ${result.converged}` +
        (first ? ` e.g. ${first.writer} ${first.marker} ${first.verdict}` : ''),
    );
    if (values.verbose && first && where >= 0) {
      console.log(`  ${JSON.stringify(result.text.slice(Math.max(0, where - 120), where + 120))}`);
    }
  }
}
console.log(
  `writers ${writers.join('+')}: seeds ${from}-${to} failing ${failing}, duplicated ${totalDup}, deleted ${totalDeleted}, not converged ${notConverged}`,
);
// Observer timers (quiescence tracking) keep the event loop alive.
process.exit(failing === 0 ? 0 : 1);
