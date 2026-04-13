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

export const extractReceiptWithGemini = async (ocrText: string): Promise<ReceiptJSON> => {
  console.log("Gemini key loaded?", !!process.env.EXPO_PUBLIC_GEMINI_API_KEY);

  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Missing EXPO_PUBLIC_GEMINI_API_KEY in .env");
    return blankReceipt("Missing Gemini API key");
  }

  //JSON Schema
  const schema = {
    type: "object",
    properties: {
      merchantName: { type: ["string", "null"] },
      address: { type: ["string", "null"] },
      serverName: { type: ["string", "null"] },
      dateTime: { type: ["string", "null"] },
      subtotal: { type: ["number", "null"] },
      tax: { type: ["number", "null"] },
      tip: { type: ["number", "null"] },
      total: { type: ["number", "null"] },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            quantity: { type: ["number", "null"] },
            unitPrice: { type: ["number", "null"] },
            lineTotal: { type: ["number", "null"] },
          },
          required: ["name", "quantity", "unitPrice", "lineTotal"],
        },
      },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: ["merchantName", "address", "serverName", "dateTime", "subtotal", "tax", "tip", "total", "items", "warnings"],
  };

// OPTIMIZED PROMPT: Allows reasoning for messy item names, strict on numbers
const prompt = `
You are an advanced receipt parsing assistant. Extract the merchant name, address, server name, date/time, line items, subtotal, tax, tip, and total into structured JSON.

CRITICAL CONTEXT & ERROR HANDLING:
- The provided OCR text may be degraded, folded, or messy.
- You ARE permitted to use spatial context and reasoning to resolve slightly ambiguous characters in item names (e.g., inferring "CHKN" from "CHxN" if context implies chicken).
- ZERO-HALLUCINATION POLICY FOR NUMBERS: You must maintain strict accuracy for all numerical values. DO NOT guess final totals, subtotals, or prices if the text is completely unreadable. If a numerical value cannot be confidently extracted, return null for that specific field.

Extraction Rules:
- If merchantName or address is not present, set to null.
- For each item:
  - If a quantity is explicitly shown, set quantity to that number. Otherwise, default to 1.
  - lineTotal must be the exact dollar amount shown on that item line.
  - unitPrice: only set if explicitly shown OR if quantity > 1 and you can compute unitPrice = lineTotal / quantity exactly to 2 decimals. Otherwise null.
- tip: ONLY set tip if the OCR text contains the word "TIP" or "Tip" near an amount.
- Service charges or gratuity should NOT go into tip. Put them in the warnings array instead.
- Money rules: Return numbers only (e.g., 12.34). Strip all "$" signs.

OCR TEXT:
"""
${ocrText}
"""
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
        },
      }),
    });

    const data = await res.json();

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("Gemini returned no text:", JSON.stringify(data, null, 2));
      return blankReceipt("Gemini returned no output");
    }

    try {
      return JSON.parse(text) as ReceiptJSON;
    } catch (parseErr) {
      console.error("Failed to parse Gemini JSON:", parseErr, "Raw:", text);
      return blankReceipt("Gemini output was not valid JSON");
    }
  } catch (err) {
    console.error("Gemini extraction failed:", err);
    return blankReceipt("Gemini request failed");
  }
};