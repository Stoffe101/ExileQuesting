export class LogLineBuffer {
  private remainder = '';

  push(chunk: string): string[] {
    const lines = `${this.remainder}${chunk}`.split(/\r?\n/);
    this.remainder = lines.pop() ?? '';
    return lines;
  }

  reset(): void {
    this.remainder = '';
  }

  pending(): string {
    return this.remainder;
  }
}
