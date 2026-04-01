import React, {
  ForwardedRef,
  ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ColorValue, StyleProp, View, ViewStyle, useWindowDimensions } from 'react-native';
import { TrueSheet as LegacyTrueSheet } from '@lodev09/react-native-true-sheet';

let ComposeHost: any = null;
let ComposeModalBottomSheet: any = null;
let ComposeRNHostView: any = null;
let composeClip: any = null;
let composeShapes: any = null;

try {
  const compose = require('@expo/ui/jetpack-compose');
  ComposeHost = compose.Host;
  ComposeModalBottomSheet = compose.ModalBottomSheet;
  ComposeRNHostView = compose.RNHostView;

  const modifiers = require('@expo/ui/jetpack-compose/modifiers');
  composeClip = modifiers.clip;
  composeShapes = modifiers.Shapes;
} catch {
  // Fallback to legacy TrueSheet below if Jetpack Compose primitives are unavailable.
}

const canUseComposeSheet = Boolean(
  ComposeHost &&
  ComposeModalBottomSheet &&
  ComposeRNHostView &&
  composeClip &&
  composeShapes
);

type ComposeModalBottomSheetRef = {
  hide: () => Promise<void>;
};

type SheetDetent = 'auto' | 'medium' | 'large' | number;

export interface TrueSheetRef {
  present: (index?: number, animated?: boolean) => Promise<void>;
  dismiss: (animated?: boolean) => Promise<void>;
  resize: (index: number) => Promise<void>;
  dismissStack: (animated?: boolean) => Promise<void>;
}

interface ShimTrueSheetProps {
  children?: ReactNode;
  detents?: SheetDetent[];
  initialDetentIndex?: number;
  cornerRadius?: number;
  backgroundColor?: ColorValue;
  backgroundBlur?: string;
  grabber?: boolean;
  dismissible?: boolean;
  onDismiss?: () => void;
  onDidDismiss?: () => void;
  onWillPresent?: () => void;
  onDidPresent?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  maxContentHeight?: number;
  scrollable?: boolean;
  [key: string]: unknown;
}

function clampDetentIndex(detents: SheetDetent[], index: number): number {
  if (detents.length === 0) return 0;
  return Math.max(0, Math.min(index, detents.length - 1));
}

function resolveSkipPartiallyExpanded(
  detents: SheetDetent[] | undefined,
  index: number,
  windowHeight: number
): boolean {
  if (!detents?.length) return false;
  const safeIndex = clampDetentIndex(detents, index);
  const selectedDetent = detents[safeIndex];

  if (selectedDetent === 'large') return true;
  if (selectedDetent === 'medium' || selectedDetent === 'auto') return false;
  if (typeof selectedDetent !== 'number') return false;

  if (selectedDetent > 0 && selectedDetent <= 1) {
    return selectedDetent >= 0.75;
  }

  if (selectedDetent > 1 && windowHeight > 0) {
    return selectedDetent >= windowHeight * 0.75;
  }

  return false;
}

function AndroidTrueSheetImpl(props: ShimTrueSheetProps, ref: ForwardedRef<TrueSheetRef>) {
  if (!canUseComposeSheet) {
    return <LegacyTrueSheet ref={ref as any} {...(props as any)} />;
  }

  const {
    children,
    detents,
    initialDetentIndex = -1,
    cornerRadius: radius = 28,
    backgroundColor,
    grabber = true,
    dismissible = true,
    onDismiss,
    onDidDismiss,
    onWillPresent,
    onDidPresent,
    style,
    testID,
    maxContentHeight,
    scrollable = false,
  } = props;

  const composeSheetRef = useRef<ComposeModalBottomSheetRef | null>(null);
  const [isPresented, setIsPresented] = useState(initialDetentIndex >= 0);
  const [detentIndex, setDetentIndex] = useState(initialDetentIndex >= 0 ? initialDetentIndex : 0);
  const wasPresentedRef = useRef(isPresented);
  const { height: windowHeight } = useWindowDimensions();

  const safeDetents = useMemo<SheetDetent[]>(
    () => (detents && detents.length > 0 ? detents : (['auto'] as SheetDetent[])),
    [detents]
  );
  const skipPartiallyExpanded = useMemo(
    () => resolveSkipPartiallyExpanded(safeDetents, detentIndex, windowHeight),
    [safeDetents, detentIndex, windowHeight]
  );

  const present = useCallback(
    async (index = 0) => {
      onWillPresent?.();
      setDetentIndex(index);
      setIsPresented(true);
    },
    [onWillPresent]
  );

  const dismiss = useCallback(async () => {
    try {
      await composeSheetRef.current?.hide();
    } catch {
      // Ignore hide rejections when sheet is already gone.
    } finally {
      setIsPresented(false);
    }
  }, []);

  const resize = useCallback(async (index: number) => {
    setDetentIndex(index);
    if (!isPresented) {
      setIsPresented(true);
    }
  }, [isPresented]);

  const dismissStack = useCallback(async () => {
    await dismiss();
  }, [dismiss]);

  useImperativeHandle(
    ref,
    () => ({
      present,
      dismiss,
      resize,
      dismissStack,
    }),
    [dismiss, dismissStack, present, resize]
  );

  useEffect(() => {
    if (!wasPresentedRef.current && isPresented) {
      onDidPresent?.();
    }
    if (wasPresentedRef.current && !isPresented) {
      onDidDismiss?.();
      onDismiss?.();
    }
    wasPresentedRef.current = isPresented;
  }, [isPresented, onDidDismiss, onDismiss, onDidPresent]);

  const containerStyle = useMemo<StyleProp<ViewStyle>>(
    () => [{ width: '100%' }, maxContentHeight ? { maxHeight: maxContentHeight } : null, style],
    [maxContentHeight, style]
  );

  const sheetModifiers = useMemo(
    () => [composeClip(composeShapes.RoundedCorner(radius))],
    [radius]
  );

  return (
    <ComposeHost>
      {isPresented ? (
        <ComposeModalBottomSheet
          ref={composeSheetRef}
          onDismissRequest={() => setIsPresented(false)}
          skipPartiallyExpanded={skipPartiallyExpanded}
          containerColor={backgroundColor}
          showDragHandle={grabber}
          sheetGesturesEnabled={dismissible && !scrollable}
          properties={{
            shouldDismissOnBackPress: dismissible,
            shouldDismissOnClickOutside: dismissible,
          }}
          modifiers={sheetModifiers}
        >
          <ComposeRNHostView matchContents verticalScrollEnabled={Boolean(scrollable)}>
            <View style={containerStyle} testID={testID}>
              {children}
            </View>
          </ComposeRNHostView>
        </ComposeModalBottomSheet>
      ) : null}
    </ComposeHost>
  );
}

export const TrueSheet = forwardRef<TrueSheetRef, ShimTrueSheetProps>(AndroidTrueSheetImpl);
TrueSheet.displayName = 'TrueSheet';

export const TrueSheetProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
export const useTrueSheet = () => ({});

export default { TrueSheet, TrueSheetProvider, useTrueSheet };
