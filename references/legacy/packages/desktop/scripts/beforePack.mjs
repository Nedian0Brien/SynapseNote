import { verifyPackagingStamp } from './packaging-freshness.mjs';

export default async function beforePack() {
  const state = verifyPackagingStamp();
  console.log(
    `[beforePack] packaging inputs are fresh (${state.inputDigest.slice(0, 12)} / ${state.outputDigest.slice(0, 12)})`,
  );
}
