import SpecWorkspace from '@/components/SpecWorkspace';
import { SignInPanel } from '@/components/SignInPanel';
import { AccessError, requireApplicationUser } from '@/lib/auth/access';

export const dynamic = 'force-dynamic';

export default async function Page() {
  try {
    await requireApplicationUser();
  } catch (error) {
    if (error instanceof AccessError) return <SignInPanel />;
    throw error;
  }
  return <SpecWorkspace />;
}
