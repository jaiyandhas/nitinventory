export const formatIndianNumber = (amount: number): string => {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const parts = absAmount.toFixed(2).split('.');
  let integerPart = parts[0];
  const decimalPart = parts[1];

  const lastThree = integerPart.substring(integerPart.length - 3);
  const otherParts = integerPart.substring(0, integerPart.length - 3);
  if (otherParts !== '') {
    const regex = /\B(?=(\d{2})+(?!\d))/g;
    const formattedOthers = otherParts.replace(regex, ',');
    integerPart = formattedOthers + ',' + lastThree;
  } else {
    integerPart = lastThree;
  }
  const formattedAmount = integerPart + '.' + decimalPart;
  return isNegative ? '-' + formattedAmount : formattedAmount;
};

export const formatCurrency = (amount?: number | null) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0.00';
  return '₹' + formatIndianNumber(amount);
};

export const formatFileNo = (fileNo?: string | null, userRole?: string | null): string => {
  if (!fileNo) return '-';
  const isTemp = fileNo.toUpperCase().startsWith('TEMP');
  const isHodOrFaculty = userRole === 'hod' || userRole === 'faculty';
  if (isTemp && isHodOrFaculty) {
    return 'Approved';
  }
  return fileNo;
};
