export const performOCR = async (imageUri: string) => {
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'receipt.jpg',
    } as any);

    //API key from OCR.space
    formData.append('apikey', 'helloworld');
    formData.append('isOverlayRequired', 'false');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (result.ParsedResults && result.ParsedResults.length > 0) {
      return result.ParsedResults[0].ParsedText;
    }
    return null;
  } catch (error) {
    console.error("Cloud OCR Error:", error);
    return null;
  }
};