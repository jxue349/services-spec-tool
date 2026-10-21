export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { validateRuntimeConfiguration } = await import('./lib/runtime-config');
    try {
      validateRuntimeConfiguration();
    } catch (error) {
      // Next's standalone server otherwise keeps listening after a failed
      // instrumentation hook. A broken production configuration must exit so
      // ECS can fail the deployment, not leave a task serving only HTTP 500.
      if (process.env.NODE_ENV === 'production') {
        console.error('Production startup configuration is invalid. Check the required server settings.');
        process.exit(1);
      }
      throw error;
    }
  }
}
