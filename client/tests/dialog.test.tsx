import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../src/components/ConfirmDialog';

function renderDialog(pending = false) {
  const onClose = vi.fn();
  const props = { title: 'Confirm consultation', confirmLabel: 'Confirm booking', pending, onClose, onConfirm: vi.fn() };
  const view = render(<ConfirmDialog {...props}>Consultation details</ConfirmDialog>);
  return { ...view, props };
}

describe('confirmation dialog keyboard navigation', () => {
  it('keeps forward and backward tab navigation inside the dialog', async () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    const close = within(dialog).getByRole('button', { name: 'Close dialog' });
    const confirm = within(dialog).getByRole('button', { name: 'Confirm booking' });
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
  });
  it('keeps the pending dialog focused while its buttons are disabled', async () => {
    const { rerender, props } = renderDialog();
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm booking' }).focus();
    rerender(<ConfirmDialog {...props} pending>Consultation details</ConfirmDialog>);
    expect(screen.getByRole('dialog')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(props.onClose).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(screen.getByRole('dialog')).toHaveFocus();
  });
});
