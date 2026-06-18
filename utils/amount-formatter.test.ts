// Test amount formatter
import { formatAmount, formatAmountWithSuffix } from './amount-formatter';

console.log('=== Amount Formatter Tests ===\n');

const testCases = [
  // [value, isWei, expected]
  [1.23456789, false, '1.23'],
  [1.29999999, false, '1.29'],         // Should truncate, not round
  [1.23000000, false, '1.23'],         // Should hide trailing zeros
  [1.00000000, false, '1'],            // Should hide all decimal zeros
  [0.12345678, false, '0.12'],
  [100, false, '100'],
  ['1000000000000000000', true, '1'],  // 1 ETH in wei
  ['1234567890000000000', true, '1.23'],  // 1.234... ETH in wei
  ['1234567890123456789', true, '1.23'],  // Should truncate at 2 decimals
];

testCases.forEach(([value, isWei, expected], index) => {
  const result = formatAmount(value as any, isWei);
  const passed = result === expected;
  console.log(`Test ${index + 1}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Input: ${value} (isWei: ${isWei})`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Got: ${result}`);
  if (!passed) {
    console.log(`  ⚠️  MISMATCH!`);
  }
  console.log();
});

console.log('\n=== With Suffix Tests ===\n');
console.log(formatAmountWithSuffix(1.23456789));
console.log(formatAmountWithSuffix('1000000000000000000', true));
