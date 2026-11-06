/** Charging limit options. "Full" is always capped — never an unbounded authorization. */
export const FULL_CHARGE_CAP_PHP = 1500;

export interface LimitOption {
  id: 'p200' | 'p500' | 'full';
  label: string;
  amountPhp: number;
}

export const LIMIT_OPTIONS: LimitOption[] = [
  { id: 'p200', label: '₱200', amountPhp: 200 },
  { id: 'p500', label: '₱500', amountPhp: 500 },
  { id: 'full', label: 'Full', amountPhp: FULL_CHARGE_CAP_PHP },
];

/** Cost in PHP for delivered energy. Rounded to centavos. */
export function costForEnergy(energyWh: number, pricePerKwh: number): number {
  if (!Number.isFinite(energyWh) || energyWh < 0) return 0;
  return Math.round((energyWh / 1000) * pricePerKwh * 100) / 100;
}

/** Approximate kWh a peso limit buys. */
export function kwhForLimit(limitPhp: number, pricePerKwh: number): number {
  if (pricePerKwh <= 0) return 0;
  return limitPhp / pricePerKwh;
}

/** Energy delivered between two cumulative meter readings, guarding against register resets. */
export function deliveredWh(meterStartWh: number, currentWh: number): number {
  const d = currentWh - meterStartWh;
  return d > 0 ? d : 0;
}

/** Should the CSMS stop the session because the spending limit is reached? */
export function limitReached(costPhp: number, limitPhp: number): boolean {
  return costPhp >= limitPhp;
}

/** The amount actually charged: never more than the authorized hold. */
export function finalCharge(costPhp: number, holdPhp: number): number {
  return Math.min(Math.round(costPhp * 100) / 100, holdPhp);
}

export function formatPhp(n: number): string {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
