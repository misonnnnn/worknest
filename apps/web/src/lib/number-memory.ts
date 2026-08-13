export const STARTING_DIGITS = 4;
export const DISPLAY_MS = 2000;
export const MAX_DIGITS = 40;

export function generateNumber(length: number): string {
  const digits: string[] = [String(Math.floor(Math.random() * 9) + 1)];
  for (let i = 1; i < length; i += 1) {
    digits.push(String(Math.floor(Math.random() * 10)));
  }
  return digits.join('');
}
