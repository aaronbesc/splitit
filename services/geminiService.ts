// ─── Gemini Receipt Extraction ───────────────────────────────────────────────
// Architecture: image base64 → Gemini 2.5 Flash vision → structured JSON
// OCR.space is bypassed entirely. Gemini reads the receipt visually, preserving
// spatial layout and handling rotation/tilt that would break text-based OCR.

const MODEL_NAME = "gemini-2.5-flash";

export type ReceiptJSON = {
  merchantName: string | null;
  address: string | null;
  serverName: string | null;
  dateTime: string | null;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  total: number | null;
  items: {
    name: string;
    quantity: number | null;
    unitPrice: number | null;
    lineTotal: number | null;
  }[];
  warnings: string[];
};

const blankReceipt = (warning?: string): ReceiptJSON => ({
  merchantName: null,
  address: null,
  serverName: null,
  dateTime: null,
  subtotal: null,
  tax: null,
  tip: null,
  total: null,
  items: [],
  warnings: warning ? [warning] : [],
});

// ─── Post-processing validator ────────────────────────────────────────────────
// Runs after Gemini returns JSON. Derives missing values from present ones,
// cross-checks math, and adds warnings on discrepancies.

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function validateAndFix(raw: ReceiptJSON): ReceiptJSON {
  const warnings = [...(raw.warnings ?? [])];

  // 1. Fix item-level math
  const items = (raw.items ?? []).map((item) => {
    const qty = item.quantity ?? 1;
    let { unitPrice, lineTotal } = item;

    if (unitPrice != null && lineTotal == null) {
      // Derive lineTotal from qty × unitPrice
      lineTotal = r2(qty * unitPrice);
    } else if (lineTotal != null && unitPrice == null) {
      // Derive unitPrice from lineTotal / qty
      unitPrice = r2(lineTotal / qty);
    } else if (unitPrice != null && lineTotal != null && qty > 1) {
      // Both present: verify they agree (within $0.02 rounding tolerance)
      const expected = r2(qty * unitPrice);
      if (Math.abs(expected - lineTotal) > 0.02) {
        warnings.push(
          `"${item.name}": ${qty}×$${unitPrice} = $${expected} but receipt shows $${lineTotal} — using receipt total, recomputing unit price`
        );
        unitPrice = r2(lineTotal / qty);
      }
    }

    // If qty=1 and unitPrice still null, set it equal to lineTotal
    if (qty === 1 && unitPrice == null && lineTotal != null) {
      unitPrice = lineTotal;
    }

    return { ...item, quantity: qty, unitPrice, lineTotal };
  });

  // 2. Auto-derive subtotal when Gemini missed it
  const itemSum = r2(items.reduce((s, i) => s + (i.lineTotal ?? 0), 0));
  let { subtotal } = raw;

  if (subtotal == null && itemSum > 0) {
    subtotal = itemSum;
  } else if (subtotal != null && itemSum > 0 && Math.abs(itemSum - subtotal) > 0.15) {
    warnings.push(
      `Items sum ($${itemSum}) differs from subtotal ($${subtotal}) by more than $0.15 — check for missing or duplicate items`
    );
  }

  // 3. Verify subtotal + tax + tip ≈ total
  if (subtotal != null && raw.total != null) {
    const computed = r2(subtotal + (raw.tax ?? 0) + (raw.tip ?? 0));
    if (Math.abs(computed - raw.total) > 0.15) {
      warnings.push(
        `Computed total $${computed} (subtotal + tax + tip) differs from printed total $${raw.total}`
      );
    }
  }

  return { ...raw, items, subtotal, warnings };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────
const PROMPT = `
You are an expert receipt parser with computer vision. Carefully examine this receipt image and extract every piece of data into structured JSON.

## ORIENTATION
The photo may be tilted, rotated, or taken at an angle. Use the receipt's visual structure to orient yourself:
- Merchant name / logo is always near the top
- Item lines fill the middle
- Subtotal → Tax → Tip → Total always appear near the bottom, in that order
Read the full receipt before extracting — do not stop at the first price you see.

## LINE ITEMS — Read every ordered item

Extract each distinct product as one item with: name, quantity, unitPrice, lineTotal.

### Detecting quantity
Receipts encode quantity in several ways. Recognise all of them:

  Pattern A — leading integer:
    "3  Chicken Wings         $15.00"   → qty=3,  lineTotal=15.00, unitPrice=5.00

  Pattern B — multiplier token:
    "Burger  ×2              $17.98"   → qty=2,  lineTotal=17.98, unitPrice=8.99
    "2x Soda                  $5.00"   → qty=2,  lineTotal=5.00,  unitPrice=2.50

  Pattern C — @ notation:
    "2 @ $4.50               = $9.00"  → qty=2,  unitPrice=4.50,  lineTotal=9.00

  Pattern D — no quantity shown:
    "Caesar Salad             $14.00"  → qty=1,  lineTotal=14.00, unitPrice=14.00

### Math integrity — MANDATORY
For every item:
  - lineTotal = round(quantity × unitPrice, 2)
  - If you have quantity and lineTotal but not unitPrice → compute unitPrice = round(lineTotal / quantity, 2)
  - If you have quantity and unitPrice but not lineTotal → compute lineTotal = round(quantity × unitPrice, 2)
  - If all three are present and qty×unitPrice ≠ lineTotal (within $0.02) → treat lineTotal as truth, recompute unitPrice

### Identical items on separate lines
"Burger  $12.00" appearing twice = TWO items, each qty=1. Never merge them — each guest will claim their own.

### What to skip
- Section headers: FOOD, BEVERAGES, APPETIZERS, ENTREES, etc.
- Zero-price modifiers: "No onions", "Extra napkins"
- Payment info: "VISA ****1234", "CHANGE", "CASH TENDERED"

### Modifiers with a price
"ADD BACON    $2.00" → include as a separate item, name="Add Bacon", qty=1, lineTotal=2.00

## TOTALS

- subtotal: pre-tax sum of items. Labels: SUBTOTAL, SUB-TOTAL, FOOD TOTAL, MERCHANDISE
- tax: ONLY amounts explicitly labeled TAX, SALES TAX, HST, GST, VAT, STATE TAX, LOCAL TAX
- tip: ONLY a tip the customer manually wrote or selected. Labels: TIP, GRATUITY (handwritten/chosen from printed options)
  ⚠ AUTO-GRATUITY and SERVICE CHARGE are NOT tip. If found, add to warnings and leave tip=null.
- total: final amount owed. Labels: TOTAL, TOTAL DUE, AMOUNT DUE, BALANCE DUE, GRAND TOTAL

## MERCHANT INFO

- merchantName: establishment name — usually the largest text at the very top of the receipt
- address: full street address if printed
- serverName: server or cashier name if labeled (e.g. "Server: MARIA", "Cashier: 004")
- dateTime: date and time in whatever format is printed on the receipt

## STRICT OUTPUT RULES

1. All monetary values: plain numbers, no $ or commas. Two decimal places. (12.50 not $12.50)
2. If a field is not on the receipt or is genuinely unreadable, return null — never invent a number.
3. warnings: add a string for any anomaly (math mismatch, unreadable section, auto-gratuity detected, etc.)
`.trim();

// ─── OpenAPI-style schema (Gemini requires nullable:true, not type:["X","null"]) ─
const SCHEMA = {
  type: "object",
  properties: {
    merchantName: { type: "string", nullable: true },
    address:      { type: "string", nullable: true },
    serverName:   { type: "string", nullable: true },
    dateTime:     { type: "string", nullable: true },
    subtotal:     { type: "number", nullable: true },
    tax:          { type: "number", nullable: true },
    tip:          { type: "number", nullable: true },
    total:        { type: "number", nullable: true },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name:       { type: "string" },
          quantity:   { type: "number", nullable: true },
          unitPrice:  { type: "number", nullable: true },
          lineTotal:  { type: "number", nullable: true },
        },
        required: ["name", "quantity", "unitPrice", "lineTotal"],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "merchantName", "address", "serverName", "dateTime",
    "subtotal", "tax", "tip", "total", "items", "warnings",
  ],
};

// ─── Main export ──────────────────────────────────────────────────────────────
// Accepts a base64-encoded JPEG string (no data-URI prefix).
// Returns a validated, math-corrected ReceiptJSON.

export const extractReceiptWithGemini = async (
  imageBase64: string
): Promise<ReceiptJSON> => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Missing EXPO_PUBLIC_GEMINI_API_KEY");
    return blankReceipt("Missing Gemini API key");
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              // Vision input: the receipt image
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: imageBase64,
                },
              },
              // Extraction instructions
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: SCHEMA, // NOTE: field is responseSchema, not responseJsonSchema
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Gemini HTTP ${res.status}:`, body);
      return blankReceipt(`Gemini API error (${res.status})`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error("Gemini returned no text:", JSON.stringify(data, null, 2));
      return blankReceipt("Gemini returned no output");
    }

    let parsed: ReceiptJSON;
    try {
      parsed = JSON.parse(text) as ReceiptJSON;
    } catch (parseErr) {
      console.error("Failed to parse Gemini JSON:", parseErr, "\nRaw:", text);
      return blankReceipt("Gemini output was not valid JSON");
    }

    // Run math validation and auto-correction pass
    return validateAndFix(parsed);
  } catch (err) {
    console.error("Gemini extraction failed:", err);
    return blankReceipt("Gemini request failed");
  }
};
