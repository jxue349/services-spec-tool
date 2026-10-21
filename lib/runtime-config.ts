import { assertAuthConfiguration, testReadOnlyMode } from './auth/access';
import { getBedrockEnv, getCompilerEnv, getCompilerProvider, getSpecEnv, InvalidEnvError, MissingEnvError } from './env';

function integrationConfigured(check: () => unknown): boolean {
  try {
    check();
    return true;
  } catch (error) {
    if (error instanceof MissingEnvError) return false;
    throw error;
  }
}

/** Configuration presence only; this never calls upstream services or returns credentials. */
export function integrationStatus(): { github: boolean; compiler: boolean } {
  return {
    github: integrationConfigured(getSpecEnv),
    compiler: integrationConfigured(getCompilerProvider() === 'glean' ? getCompilerEnv : getBedrockEnv),
  };
}

function validateIntegration(check: () => unknown): void {
  if (testReadOnlyMode()) integrationConfigured(check);
  else check();
}

export function validateRuntimeConfiguration(): void {
  assertAuthConfiguration();
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.ALLOW_DIRECT_COMMIT?.trim().toLowerCase() === 'true') {
    throw new InvalidEnvError('Direct commits must be disabled in production');
  }
  validateIntegration(getSpecEnv);
  validateIntegration(() => {
    if (getCompilerProvider() === 'glean') {
      const glean = getCompilerEnv();
      if (glean.agent !== 'GPT') throw new InvalidEnvError('The production compiler requires a spec-only Glean agent');
      if (new URL(glean.baseUrl).protocol !== 'https:') throw new InvalidEnvError('Glean must use HTTPS in production');
    } else {
      getBedrockEnv();
    }
  });
}
