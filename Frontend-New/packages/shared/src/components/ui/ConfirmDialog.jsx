"use client";

import Modal from "./Modal";
import Button from "./Button";

/** Yes/no gate for anything destructive (delete an ad, log out). */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
  onClose,
}) {
  return (
    <Modal
      open={open}
      title={title}
      subtitle={body}
      onClose={onClose}
      size="max-w-md"
      bodyClassName="hidden"
      footer={
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            size="lg"
            className="flex-1"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <span />
    </Modal>
  );
}
