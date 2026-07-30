'use client';

import { AlertDialog, Button } from '@heroui/react';

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
    <AlertDialog.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-[400px]">
          <AlertDialog.CloseTrigger />
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>{title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p className="text-[13px] text-[var(--color-text-secondary)]">{description}</p>
            {itemLabel ? (
              <div className="mt-3 rounded-xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-medium text-[var(--color-text-tertiary)]">
                {itemLabel}
              </div>
            ) : null}
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" slot="close" isDisabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" slot="close" onPress={onConfirm} isDisabled={isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
