export function onlyCpfDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 11);
}

export function formatCpfBR(value: string | null | undefined) {
  const digits = onlyCpfDigits(value);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function isValidCPF(value: string | null | undefined) {
  const digits = onlyCpfDigits(value);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const numbers = digits.split("").map(Number);
  const calculateDigit = (base: number[], startWeight: number) => {
    const sum = base.reduce((total, digit, index) => total + digit * (startWeight - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const first = calculateDigit(numbers.slice(0, 9), 10);
  if (first !== numbers[9]) return false;
  const second = calculateDigit(numbers.slice(0, 10), 11);
  return second === numbers[10];
}
