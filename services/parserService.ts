export const parseReceiptJSON = (rawText: string) => {
  const lines = rawText.split('\n');
  const items: { name: string; price: number }[] = [];

  //gets items and price that are on same line (Soup 7.00)
  const itemRegex = /(.+?)[\s$]+(\d+\.\d{2})/;

  lines.forEach(line => {
    const match = line.match(itemRegex);
    if (match) {
      const name = match[1].trim();
      const price = parseFloat(match[2]);

      //filter out totals and other metadata for now
      const noiseWords = ['SUBTOTAL', 'TAX', 'TOTAL', 'SERVICE CHARGE', 'CHECK #', 'GUEST COUNT'];
      const isNoise = noiseWords.some(word => name.toUpperCase().includes(word));

      //make sure that "Ordered" date is not seen as a price
      const isDate = name.includes('/') && name.includes(':');

      if (!isNoise && !isDate) {
        items.push({ name, price });
      }
    }
  });

  return items;
};