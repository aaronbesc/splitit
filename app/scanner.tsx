import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { performOCR } from '../services/ocrService';

export default function ScannerScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need access to your gallery to upload receipts.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, //user can crop images
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
      console.log("Image URI:", result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need camera access to scan receipts.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  //ML Pipeline
  const handleProcessReceipt = async () => {
    if (!image) return;

    setIsProcessing(true);
    try {
      console.log("Starting OCR Inference...");

      //calls OCR
      const rawText = await performOCR(image);

      if (rawText) {
        console.log("Extracted Text:", rawText);
        Alert.alert("OCR Success", "Text extracted! Check your console for the raw data."); //successful

        //need to update to pass test to JSON parser here
      } else {
        Alert.alert("OCR Failed", "Could not extract text from this image.");
      }
    } catch (error) {
      console.error("Processing Error:", error);
      Alert.alert("Error", "An error occurred during image processing.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GatorML Receipt Scanner</Text>

      {image && <Image source={{ uri: image }} style={styles.preview} />}

      {}
      {isProcessing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text>Running OCR Model...</Text>
        </View>
      )}

      {!isProcessing && (
        <>
          <TouchableOpacity style={styles.button} onPress={takePhoto}>
            <Text style={styles.buttonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={pickImage}>
            <Text style={styles.buttonText}>Upload from Gallery</Text>
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
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#0021A5' },
  preview: { width: 300, height: 400, marginBottom: 20, borderRadius: 10, borderWidth: 1, borderColor: '#ccc' },
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, marginVertical: 5, width: 250, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  loadingContainer: { marginVertical: 20, alignItems: 'center' }
});