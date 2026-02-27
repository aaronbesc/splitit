export const performOCR = async (imageUri: string) => {
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'receipt.jpg',
    } as any);

    formData.append('apikey', process.env.EXPO_PUBLIC_OCR_API_KEY || '');
    formData.append('isOverlayRequired', 'false');

    //setting for receipt processing
    formData.append('isTable', 'true');
    formData.append('OCREngine', '2');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    console.log("!!!FULL OCR API RESPONSE!!!");
    console.log(JSON.stringify(result, null, 2));

    if (result.IsErroredOnProcessing) {
      console.error("OCR API returned an error:", result.ErrorMessage);
      return null;
    }

    const parsedText = result.ParsedResults?.[0]?.ParsedText;

    if (!parsedText || parsedText.trim() === '') {
      console.warn("OCR API succeeded but returned empty or blank text.");
      return null;
    }

    return parsedText;
  } catch (error) {
    console.error("Cloud OCR Error:", error);
    return null;
  }
};