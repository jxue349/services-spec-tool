import { assertAuthConfiguration } from './auth/access';
import { getBedrockEnv, getCompilerEnv, getCompilerProvider, getSpecEnv, InvalidEnvError } from './env';

export function validateRuntimeConfiguration(): void {
  assertAuthConfiguration();
  if (process.env.NODE_ENV !== 'production') return;
  if (getSpecEnv().allowDirectCommit) throw new InvalidEnvError('Direct commits must be disabled in production');
  if (getCompilerProvider() === 'glean') {
    const glean = getCompilerEnv();
    if (glean.agent !== 'GPT') throw new InvalidEnvError('The production compiler requires a spec-only Glean agent');
    if (new URL(glean.baseUrl).protocol !== 'https:') throw new InvalidEnvError('Glean must use HTTPS in production');
  } else {
    getBedrockEnv();
  }
}
