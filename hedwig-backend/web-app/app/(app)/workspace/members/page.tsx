import { Metadata } from 'next';
import { MembersClient } from './view';

export const metadata: Metadata = {
  title: 'Members - Hedwig',
  description: 'Manage workspace team members, roles, and wallets.',
};

export default function MembersPage() {
  return <MembersClient />;
}
