import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { CardsClient } from './view';

export default async function CardsPage() {
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);
  const cards = await hedwigApi.cards(opts);

  return <CardsClient key={opts.workspaceId ?? 'default'} accessToken={session.accessToken} initialCards={cards} />;
}
