export async function copyText(value: string, failureMessage = 'Clipboard access was blocked. Select the text and copy it manually.'): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Sandboxed/file renderers can deny the modern Clipboard API. Fall through to a user-triggered selection copy.
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', 'true');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error(failureMessage);
}
