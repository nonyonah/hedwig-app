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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {itemLabel ? (
          <DialogBody>
            <div className="rounded-[15px] border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm font-medium text-[#b42318]">
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
            className="bg-[#f04438] text-white hover:bg-[#d92d20]"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
