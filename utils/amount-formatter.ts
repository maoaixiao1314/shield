/**
 * Format amount with precision rules:
 * 1. Maximum 8 decimal places
 * 2. Trailing zeros are hidden
 * 3. Floor (truncate), never round up
 * 
 * @param value - The numeric value to format (in ETH/wei or already formatted)
 * @param isWei - Whether the input value is in wei (bigint/string) or already in ETH
 * @returns Formatted string with proper precision
 */
export function formatAmount(value: string | number | bigint, isWei: boolean = false): string {
  let ethValue: number;

  if (isWei) {
    // Convert wei to ETH
    const weiBigInt = typeof value === 'bigint' ? value : BigInt(value);
    ethValue = Number(weiBigInt) / 1e18;
  } else {
    // Already in ETH
    ethValue = typeof value === 'string' ? parseFloat(value) : value;
  }

  // Check for NaN or Infinity
  if (isNaN(ethValue) || !isFinite(ethValue)) {
    return '0';
  }

  // Truncate to 8 decimal places (floor, not round)
  const truncated = Math.floor(ethValue * 100_000_000) / 100_000_000;

  // Format with up to 8 decimal places, removing trailing zeros
  const formatted = truncated.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });

  return formatted;
}

/**
 * Format amount and append ATOS suffix
 */
export function formatAmountWithSuffix(value: string | number | bigint, isWei: boolean = false): string {
  return `${formatAmount(value, isWei)} ATOS`;
}
