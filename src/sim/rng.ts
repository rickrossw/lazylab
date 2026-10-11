// Seeded PRNG (mulberry32). Every random choice in the simulator goes through this so a run is
// fully reproducible from (scenario, seed, action log).
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Uniform in [-1, 1). */
  jitter(): number {
    return this.next() * 2 - 1;
  }
  get state(): number {
    return this.s;
  }
}
