import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { BG, F, GREEN, T } from '@/constants/design';

const QUOTES = [
  "Counting the pennies\nso you don't have to...",
  "Negotiating with\nthe OCR demons...",
  "Finding out who ordered\nthe expensive steak...",
  "Doing the math your\ngroup chat can't agree on...",
];

const PULSE_DURATION = 2200;
const QUOTE_HOLD     = 1900;
const QUOTE_FADE     = 420;

// ─── Staggered bouncing dot ───────────────────────────────────────────────────
function BounceDot({ delay }: { delay: number }) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(y, {
          toValue: -9,
          duration: 300,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: 0,
          duration: 300,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(600),
      ])
    );
    const t = setTimeout(() => anim.start(), delay);
    return () => {
      clearTimeout(t);
      anim.stop();
    };
  }, []);

  return <Animated.View style={[styles.dot, { transform: [{ translateY: y }] }]} />;
}

// ─── Main overlay ─────────────────────────────────────────────────────────────
export default function ReceiptLoadingOverlay() {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const quoteOpacity = useRef(new Animated.Value(0)).current;
  const quoteY       = useRef(new Animated.Value(14)).current;
  const breathe      = useRef(new Animated.Value(1)).current;
  const p0           = useRef(new Animated.Value(0)).current;
  const p1           = useRef(new Animated.Value(0)).current;
  const p2           = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Center orb breathing
    const breatheAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1.07,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    breatheAnim.start();

    // Sonar pulse rings — each runs independently, staggered by 1/3 of the period
    function launchPulse(anim: Animated.Value, initialDelay: number) {
      function cycle() {
        anim.setValue(0);
        Animated.timing(anim, {
          toValue: 1,
          duration: PULSE_DURATION,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) cycle();
        });
      }
      return setTimeout(cycle, initialDelay);
    }

    const t0 = launchPulse(p0, 0);
    const t1 = launchPulse(p1, PULSE_DURATION / 3);
    const t2 = launchPulse(p2, (PULSE_DURATION * 2) / 3);

    // Quote cycling: fade-up in → hold → fade-up out → next
    let idx   = 0;
    let alive = true;

    function cycleQuote() {
      if (!alive) return;
      quoteY.setValue(14);
      quoteOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(quoteOpacity, {
          toValue: 1,
          duration: QUOTE_FADE,
          useNativeDriver: true,
        }),
        Animated.timing(quoteY, {
          toValue: 0,
          duration: QUOTE_FADE,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!alive) return;
        setTimeout(() => {
          if (!alive) return;
          Animated.parallel([
            Animated.timing(quoteOpacity, {
              toValue: 0,
              duration: QUOTE_FADE,
              useNativeDriver: true,
            }),
            Animated.timing(quoteY, {
              toValue: -8,
              duration: QUOTE_FADE,
              useNativeDriver: true,
            }),
          ]).start(() => {
            if (!alive) return;
            idx = (idx + 1) % QUOTES.length;
            setQuoteIndex(idx);
            cycleQuote();
          });
        }, QUOTE_HOLD);
      });
    }
    cycleQuote();

    return () => {
      alive = false;
      breatheAnim.stop();
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      p0.stopAnimation();
      p1.stopAnimation();
      p2.stopAnimation();
      breathe.stopAnimation();
      quoteOpacity.stopAnimation();
      quoteY.stopAnimation();
    };
  }, []);

  function pulseStyle(anim: Animated.Value) {
    return {
      opacity: anim.interpolate({
        inputRange: [0, 0.15, 1],
        outputRange: [0, 0.5, 0],
      }),
      transform: [{
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.4, 2.8],
        }),
      }],
    };
  }

  return (
    <View style={styles.overlay}>
      {/* Sonar rings + breathing orb */}
      <View style={styles.orbWrap}>
        <Animated.View style={[styles.pulseRing, pulseStyle(p0)]} />
        <Animated.View style={[styles.pulseRing, pulseStyle(p1)]} />
        <Animated.View style={[styles.pulseRing, pulseStyle(p2)]} />
        <Animated.View style={[styles.orb, { transform: [{ scale: breathe }] }]}>
          <Text style={styles.orbEmoji}>🧾</Text>
        </Animated.View>
      </View>

      {/* Cycling quote */}
      <Animated.Text
        style={[
          styles.quote,
          { opacity: quoteOpacity, transform: [{ translateY: quoteY }] },
        ]}
      >
        {QUOTES[quoteIndex]}
      </Animated.Text>

      {/* Staggered loading dots */}
      <View style={styles.dotsRow}>
        <BounceDot delay={0} />
        <BounceDot delay={180} />
        <BounceDot delay={360} />
      </View>
    </View>
  );
}

const ORB_SIZE = 96;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 44,
    zIndex: 99,
  },
  orbWrap: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    borderWidth: 1.5,
    borderColor: GREEN,
  },
  orb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    backgroundColor: 'rgba(0,232,150,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(0,232,150,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbEmoji: {
    fontSize: 38,
  },
  quote: {
    fontSize: 17,
    fontFamily: F.medium,
    color: T.secondary,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 40,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: GREEN,
    opacity: 0.75,
  },
});
