export interface CalibrateDialog {
  open(): void;
  close(): void;
  setStatus(text: string): void;
  /** Disable Start while samples are being collected. */
  setBusy(busy: boolean): void;
  onStart(handler: () => void): void;
  onReset(handler: () => void): void;
}

const PROMPT = 'Sit with your eyes 50 cm from the screen, facing it. Hold still and click Start.';

export function createCalibrateDialog(root: HTMLElement): CalibrateDialog {
  const prompt = document.createElement('p');
  prompt.textContent = PROMPT;
  const status = document.createElement('p');
  status.className = 'status';
  const start = document.createElement('button');
  start.type = 'button';
  start.textContent = 'Start';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset';
  reset.textContent = 'Reset to preset';
  for (const b of [start, cancel, reset]) b.addEventListener('mousedown', (e) => e.preventDefault());
  root.replaceChildren(prompt, status, start, cancel, reset);

  const dialog: CalibrateDialog = {
    open() {
      status.textContent = '';
      start.disabled = false;
      root.hidden = false;
    },
    close() {
      root.hidden = true;
    },
    setStatus(text) {
      status.textContent = text;
    },
    setBusy(busy) {
      start.disabled = busy;
    },
    onStart(handler) {
      start.addEventListener('click', handler);
    },
    onReset(handler) {
      reset.addEventListener('click', handler);
    },
  };
  cancel.addEventListener('click', () => dialog.close());
  return dialog;
}
