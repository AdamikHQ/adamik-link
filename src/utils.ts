// Helpers to convert from/to user-convenient format in main unit, and smallest unit of the chain
export const amountToSmallestUnit = (
  amount: string,
  decimals: number
): string => {
  const computedAmount = Number(amount) * Math.pow(10, decimals);
  return Math.trunc(computedAmount).toString();
};

export const amountToMainUnit = (
  amount: string,
  decimals: number
): string | null => {
  const parsedAmount = amount === "0" ? 0 : Number(amount);
  return Number.isNaN(parsedAmount)
    ? null
    : (parsedAmount / Math.pow(10, decimals)).toString();
};
