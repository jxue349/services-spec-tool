'use client';

import { AuthBar } from './AuthBar';

const onUserChange = () => undefined;

export function SignInPanel() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="max-w-md space-y-5 rounded-lg border border-line bg-panel p-8">
        <h1 className="text-xl font-semibold text-white">AI Spec Explorer</h1>
        <p className="text-sm text-inkDim">Sign in with your company account to read product specifications, ask questions, and propose changes.</p>
        <AuthBar onUserChange={onUserChange} />
      </section>
    </main>
  );
}
