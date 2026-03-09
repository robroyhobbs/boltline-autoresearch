import type { ExperimentResult, WinnerCheck } from '../runner/types.js';

const MIN_SAMPLE_SIZE = 10;
const MIN_IMPROVEMENT_PCT = 5;
const SIGNIFICANCE_THRESHOLD = 0.05;

/**
 * Sanitize config values before writing — strip any functions or prototype chains.
 */
function sanitizeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'function') continue;
    if (typeof value === 'object' && value !== null) {
      safe[key] = JSON.parse(JSON.stringify(value));
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    }
  }
  return safe;
}

/**
 * Simple Welch's t-test implementation.
 * Returns the p-value for a two-tailed test of whether two independent samples
 * have different means.
 */
function welchTTest(sample1: number[], sample2: number[]): number {
  const n1 = sample1.length;
  const n2 = sample2.length;

  if (n1 < 2 || n2 < 2) return 1.0;

  const mean1 = sample1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = sample2.reduce((a, b) => a + b, 0) / n2;

  const var1 = sample1.reduce((sum, x) => sum + (x - mean1) ** 2, 0) / (n1 - 1);
  const var2 = sample2.reduce((sum, x) => sum + (x - mean2) ** 2, 0) / (n2 - 1);

  // If both variances are 0, means are either identical (p=1) or different (p=0)
  if (var1 === 0 && var2 === 0) {
    return mean1 === mean2 ? 1.0 : 0.0;
  }

  const se = Math.sqrt(var1 / n1 + var2 / n2);
  if (se === 0) return mean1 === mean2 ? 1.0 : 0.0;

  const t = (mean1 - mean2) / se;

  // Welch-Satterthwaite degrees of freedom
  const num = (var1 / n1 + var2 / n2) ** 2;
  const denom =
    (var1 / n1) ** 2 / (n1 - 1) + (var2 / n2) ** 2 / (n2 - 1);
  const df = num / denom;

  // Approximate p-value using Student's t-distribution
  // Using the regularized incomplete beta function approximation
  const pValue = tDistPValue(Math.abs(t), df) * 2; // two-tailed

  return Math.min(1.0, pValue);
}

/**
 * Approximate one-tailed p-value for Student's t-distribution.
 * Uses the relationship between t-distribution and regularized incomplete beta function.
 */
function tDistPValue(t: number, df: number): number {
  // For large df, use normal approximation
  if (df > 1000) {
    return normalCdfComplement(t);
  }

  // Use the regularized incomplete beta function
  const x = df / (df + t * t);
  return 0.5 * regularizedIncompleteBeta(x, df / 2, 0.5);
}

/**
 * Complementary normal CDF (for large df approximation)
 */
function normalCdfComplement(z: number): number {
  // Abramowitz and Stegun approximation 26.2.17
  const p = 0.2316419;
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;

  const absZ = Math.abs(z);
  const t = 1.0 / (1.0 + p * absZ);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;

  const phi = Math.exp(-0.5 * absZ * absZ) / Math.sqrt(2 * Math.PI);
  const result = phi * (b1 * t + b2 * t2 + b3 * t3 + b4 * t4 + b5 * t5);

  return z >= 0 ? result : 1 - result;
}

/**
 * Regularized incomplete beta function I_x(a, b)
 * Uses continued fraction expansion for numerical stability.
 */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use symmetry if x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedIncompleteBeta(1 - x, b, a);
  }

  // Log of the beta function prefix
  const lnPrefix =
    a * Math.log(x) +
    b * Math.log(1 - x) -
    Math.log(a) -
    logBeta(a, b);

  const prefix = Math.exp(lnPrefix);

  // Continued fraction (Lentz's method)
  const maxIter = 200;
  const epsilon = 1e-10;

  let f = 1;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < epsilon) d = epsilon;
  d = 1 / d;
  f = d;

  for (let m = 1; m <= maxIter; m++) {
    // Even step
    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + numerator / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    f *= c * d;

    // Odd step
    numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + numerator / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1) < epsilon) break;
  }

  return prefix * f;
}

/**
 * Log of the beta function: log(B(a,b)) = log(Gamma(a)) + log(Gamma(b)) - log(Gamma(a+b))
 */
function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Log-gamma (Stirling's approximation + Lanczos for small values)
 */
function logGamma(z: number): number {
  if (z < 0.5) {
    // Reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  const g = 7;
  const coef = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  let x = coef[0];
  for (let i = 1; i < g + 2; i++) {
    x += coef[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Check if experiment results show a statistically significant winner.
 *
 * Requirements:
 * - 10+ results for the same config
 * - >5% improvement over baseline average score
 * - p < 0.05 (Welch's t-test)
 */
export function checkForWinner(
  results: ExperimentResult[],
  baseline: Record<string, unknown>,
): WinnerCheck | null {
  if (!results || results.length === 0) return null;

  // Group results by config
  const configGroups = new Map<string, ExperimentResult[]>();
  for (const r of results) {
    const key = JSON.stringify(r.parameters);
    const group = configGroups.get(key) ?? [];
    group.push(r);
    configGroups.set(key, group);
  }

  // Get baseline scores
  const baselineKey = JSON.stringify(baseline);
  const baselineResults = configGroups.get(baselineKey);
  if (!baselineResults || baselineResults.length < MIN_SAMPLE_SIZE) {
    return null;
  }

  const baselineScores = baselineResults.map((r) => r.enhancedScore.composite);
  const baselineMean = baselineScores.reduce((a, b) => a + b, 0) / baselineScores.length;

  let bestWinner: WinnerCheck | null = null;
  let bestImprovement = 0;

  for (const [key, group] of configGroups) {
    if (key === baselineKey) continue;
    if (group.length < MIN_SAMPLE_SIZE) continue;

    const scores = group.map((r) => r.enhancedScore.composite);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Calculate improvement percentage
    const improvement = baselineMean === 0
      ? (mean > 0 ? 100 : 0)
      : ((mean - baselineMean) / baselineMean) * 100;

    if (improvement < MIN_IMPROVEMENT_PCT) continue;

    const pValue = welchTTest(scores, baselineScores);
    if (pValue >= SIGNIFICANCE_THRESHOLD) continue;

    if (improvement > bestImprovement) {
      bestImprovement = improvement;
      bestWinner = {
        isWinner: true,
        improvement,
        pValue,
        config: sanitizeConfig(JSON.parse(key)),
      };
    }
  }

  return bestWinner;
}
