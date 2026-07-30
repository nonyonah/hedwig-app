'use client';

import { useRouter } from 'next/navigation';
import { Button, Dropdown, Label, Separator } from '@heroui/react';
import { Lifebuoy, SignOut } from '@/components/ui/lucide-icons';
import { Avatar } from '@/components/ui/avatar';

export function AccountMenu({
  fullName,
  email,
  avatarUrl
}: {
  fullName: string;
  email: string;
  avatarUrl?: string | null;
}) {
  const router = useRouter();

  return (
    <Dropdown>
      <Button isIconOnly variant="ghost" aria-label="Account menu">
        <Avatar label={fullName || email} src={avatarUrl} />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu onAction={(key) => {
          if (key === 'help') window.open('https://help.hedwig.riftlabs.xyz', '_blank', 'noreferrer');
          if (key === 'signout') router.push('/sign-out');
        }}>
          <Dropdown.Item id="user-info" textValue={fullName || email}>
            <div className="flex flex-col py-1">
              <span className="text-[14px] font-semibold text-[var(--color-foreground)]">{fullName}</span>
              <span className="text-[13px] text-[var(--color-text-tertiary)]">{email}</span>
            </div>
          </Dropdown.Item>
          <Separator />
          <Dropdown.Item id="help" textValue="Help Center">
            <Lifebuoy className="h-4 w-4" weight="regular" />
            <Label>Help Center</Label>
          </Dropdown.Item>
          <Separator />
          <Dropdown.Item id="signout" textValue="Sign out" variant="danger">
            <SignOut className="h-4 w-4" weight="regular" />
            <Label>Sign out</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
