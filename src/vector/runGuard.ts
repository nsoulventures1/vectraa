export class RunGuard {
  private current = 0;

  next(): number {
    this.current += 1;
    return this.current;
  }

  invalidate(): void {
    this.current += 1;
  }

  isCurrent(token: number): boolean {
    return token === this.current;
  }
}
