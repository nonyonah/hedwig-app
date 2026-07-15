'use client';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function DeleteDialog({
  open,
  title,
  description,
  itemLabel,
  isDeleting,
  onConfirm,
  onOpenChange
}: {
  open: boolean;
  title: string;
  description: string;
  itemLabel?: string | null;
  isDeleting?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="md">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {itemLabel ? (
          <DialogBody>
            <div className="rounded-[15px] border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-medium text-[var(--color-text-tertiary)]">
              {itemLabel}
            </div>
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger)]"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
