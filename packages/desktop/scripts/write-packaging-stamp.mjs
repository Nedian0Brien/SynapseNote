import { writePackagingStamp } from './packaging-freshness.mjs';

const state = writePackagingStamp();
console.log(
  `[desktop build] packaging inputs stamped (${state.inputDigest.slice(0, 12)} / ${state.outputDigest.slice(0, 12)})`,
);
