// Self-contained animated blob background used on auth screens.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');
const GREEN = '#00E896';
const MAX_BLOBS = 7;
const SPLIT_INTERVAL_MS = 5000;

const BLOB_SHAPES = [
  { tl: 62, tr: 82, br: 48, bl: 72 },
  { tl: 80, tr: 44, br: 88, bl: 58 },
  { tl: 52, tr: 74, br: 62, bl: 92 },
  { tl: 92, tr: 52, br: 76, bl: 38 },
  { tl: 68, tr: 56, br: 50, bl: 84 },
  { tl: 44, tr: 86, br: 68, bl: 60 },
  { tl: 76, tr: 48, br: 42, bl: 88 },
];

interface BlobData {
  id: number;
  xAnim: Animated.Value;
  yAnim: Animated.Value;
  scaleXAnim: Animated.Value;
  scaleYAnim: Animated.Value;
  opacityAnim: Animated.Value;
  rotateAnim: Animated.Value;
  size: number;
  shape: (typeof BLOB_SHAPES)[0];
}

function BlobView({ blob }: { blob: BlobData }) {
  const rotate = blob.rotateAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-15deg', '15deg'],
  });
  return (
    <Animated.View
      style={[
        styles.blob,
        {
          width: blob.size,
          height: Math.round(blob.size * 0.82),
          borderTopLeftRadius: blob.shape.tl,
          borderTopRightRadius: blob.shape.tr,
          borderBottomRightRadius: blob.shape.br,
          borderBottomLeftRadius: blob.shape.bl,
          opacity: blob.opacityAnim,
          transform: [
            { translateX: blob.xAnim },
            { translateY: blob.yAnim },
            { scaleX: blob.scaleXAnim },
            { scaleY: blob.scaleYAnim },
            { rotate },
          ],
        },
      ]}
    />
  );
}

export default function BlobBackground() {
  const [blobs] = useState<BlobData[]>(() =>
    BLOB_SHAPES.map((shape, i) => {
      const size = 150 + i * 14;
      const x = W * 0.15 + Math.random() * W * 0.7;
      const y = H * 0.15 + Math.random() * H * 0.7;
      return {
        id: i,
        xAnim: new Animated.Value(x - size / 2),
        yAnim: new Animated.Value(y - (size * 0.82) / 2),
        scaleXAnim: new Animated.Value(0),
        scaleYAnim: new Animated.Value(0),
        opacityAnim: new Animated.Value(0),
        rotateAnim: new Animated.Value((Math.random() - 0.5) * 2),
        size,
        shape,
      };
    })
  );

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  function readValue(anim: Animated.Value): number {
    return (anim as any)._value;
  }

  function startWobble(blob: BlobData) {
    const wobble = () => {
      if (!mountedRef.current) return;
      const dur = 4000 + Math.random() * 5000;
      Animated.sequence([
        Animated.timing(blob.rotateAnim, {
          toValue: 1, duration: dur,
          easing: Easing.inOut(Easing.sin), useNativeDriver: false,
        }),
        Animated.timing(blob.rotateAnim, {
          toValue: -1, duration: dur + Math.random() * 2000,
          easing: Easing.inOut(Easing.sin), useNativeDriver: false,
        }),
      ]).start(({ finished }) => { if (finished && mountedRef.current) wobble(); });
    };
    wobble();
  }

  function startDrift(blob: BlobData) {
    if (!mountedRef.current) return;
    const nx = W * 0.05 + Math.random() * (W * 0.9) - blob.size / 2;
    const ny = H * 0.05 + Math.random() * (H * 0.9) - (blob.size * 0.82) / 2;
    const dur = 9000 + Math.random() * 9000;
    Animated.parallel([
      Animated.timing(blob.xAnim, {
        toValue: nx, duration: dur,
        easing: Easing.inOut(Easing.sin), useNativeDriver: false,
      }),
      Animated.timing(blob.yAnim, {
        toValue: ny, duration: dur,
        easing: Easing.inOut(Easing.sin), useNativeDriver: false,
      }),
    ]).start(({ finished }) => { if (finished && mountedRef.current) startDrift(blob); });
  }

  function doMitosis(parent: BlobData, child: BlobData) {
    if (!mountedRef.current) return;
    parent.xAnim.stopAnimation(() => {});
    parent.yAnim.stopAnimation(() => {});
    const cx = readValue(parent.xAnim) + parent.size / 2;
    const cy = readValue(parent.yAnim) + (parent.size * 0.82) / 2;
    const parentOpacity = readValue(parent.opacityAnim);
    const angle = Math.random() * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const splitDist = 60 + Math.random() * 30;
    const sharedOpacity = parentOpacity * 0.55;
    child.xAnim.setValue(cx - child.size / 2);
    child.yAnim.setValue(cy - (child.size * 0.82) / 2);
    child.scaleXAnim.setValue(readValue(parent.scaleXAnim));
    child.scaleYAnim.setValue(readValue(parent.scaleYAnim));
    child.opacityAnim.setValue(0);

    Animated.parallel([
      Animated.timing(parent.scaleXAnim, { toValue: 1.20, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(parent.scaleYAnim, { toValue: 0.84, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(parent.opacityAnim, { toValue: sharedOpacity, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(child.scaleXAnim, { toValue: 1.20, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(child.scaleYAnim, { toValue: 0.84, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(child.opacityAnim, { toValue: sharedOpacity, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
    ]).start(({ finished }) => {
      if (!finished || !mountedRef.current) return;
      const SEP = 2600;
      Animated.parallel([
        Animated.timing(parent.xAnim, { toValue: cx + cosA * splitDist - parent.size / 2, duration: SEP, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(parent.yAnim, { toValue: cy + sinA * splitDist - (parent.size * 0.82) / 2, duration: SEP, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(parent.scaleXAnim, { toValue: 1, duration: SEP, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(parent.scaleYAnim, { toValue: 1, duration: SEP, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(parent.opacityAnim, { toValue: parentOpacity, duration: SEP, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(child.xAnim, { toValue: cx - cosA * splitDist - child.size / 2, duration: SEP, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(child.yAnim, { toValue: cy - sinA * splitDist - (child.size * 0.82) / 2, duration: SEP, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(child.scaleXAnim, { toValue: 1, duration: SEP, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(child.scaleYAnim, { toValue: 1, duration: SEP, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(child.opacityAnim, { toValue: 0.26 + Math.random() * 0.10, duration: SEP, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]).start(({ finished: sf }) => {
        if (!sf || !mountedRef.current) return;
        startDrift(parent);
        startWobble(parent);
        startDrift(child);
        startWobble(child);
      });
    });
  }

  function activateBlob(idx: number) {
    if (!mountedRef.current) return;
    const blob = blobs[idx];
    if (!blob) return;
    if (idx === 0) {
      Animated.parallel([
        Animated.timing(blob.opacityAnim, { toValue: 0.34, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.spring(blob.scaleXAnim, { toValue: 1, tension: 35, friction: 8, useNativeDriver: false }),
        Animated.spring(blob.scaleYAnim, { toValue: 1, tension: 35, friction: 8, useNativeDriver: false }),
      ]).start(({ finished }) => {
        if (!finished || !mountedRef.current) return;
        startDrift(blob);
        startWobble(blob);
      });
    } else {
      const parentIdx = Math.floor(Math.random() * idx);
      doMitosis(blobs[parentIdx], blob);
    }
  }

  useEffect(() => {
    activateBlob(0);
    let count = 1;
    const timer = setInterval(() => {
      if (count >= MAX_BLOBS) { clearInterval(timer); return; }
      activateBlob(count);
      count++;
    }, SPLIT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {blobs.map(blob => <BlobView key={blob.id} blob={blob} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    backgroundColor: GREEN,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 52,
    elevation: 0,
  },
});
