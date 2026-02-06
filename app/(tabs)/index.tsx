import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { performOCR } from '../../services/ocrService';
import { parseReceiptJSON } from '../../services/parserService';

export default function ScannerScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, //allow cropping
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera access is required.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, //allowed for background noise
      quality: 1,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handleProcessReceipt = async () => {
  if (!image) return;
  setIsProcessing(true);

  try {
    //pre-processing
    const manipulatedImage = await ImageManipulator.manipulateAsync(
      image,
      [{ resize: { width: 1080 } }], //resizes photos to 1080px width
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    console.log("Image optimized for OCR (Dimensions and compression applied)");

    //send image to OCR
    const rawText = await performOCR(manipulatedImage.uri);

    if (rawText) {
      console.log("!!!OCR SUCCESS!!!");
      console.log(rawText);

      //parse text into JSON
      const structuredData = parseReceiptJSON(rawText);
      console.log("!!!STRUCTURED JSON!!!");
      console.log(JSON.stringify(structuredData, null, 2));

      Alert.alert("Success", "Structured JSON printed to terminal.");

      //navigation.navigate('Results', { data: structuredData });
    } else {
      Alert.alert("OCR Failed", "The API returned no text. Check your terminal logs.");
    }
  } catch (error) {
    console.error("Pipeline Error:", error);
    Alert.alert("Error", "An error occurred during image processing.");
  } finally {
    setIsProcessing(false);
  }
};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GatorML Scanner</Text>

      {image && <Image source={{ uri: image }} style={styles.preview} />}

      {isProcessing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text>Scanning...</Text>
        </View>
      ) : (
        <>
          <TouchableOpacity style={styles.button} onPress={takePhoto}>
            <Text style={styles.buttonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={pickImage}>
            <Text style={styles.buttonText}>Gallery</Text>
          </TouchableOpacity>

          {image && (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#28a745' }]}
              onPress={handleProcessReceipt}
            >
              <Text style={styles.buttonText}>Process Receipt</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#0021A5'
  }, // UF Blue
  preview: {
    width: 300,
    height: 400,
    marginBottom: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc'
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    marginVertical: 5,
    width: 250,
    alignItems: 'center'
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  loadingContainer: {
    marginVertical: 20,
    alignItems: 'center'
  }
});