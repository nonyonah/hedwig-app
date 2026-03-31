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
import { DynamicColorIOS, StyleProp, View, ViewStyle } from 'react-native';
import { BottomSheet, Group, Host } from '@expo/ui/swift-ui';
import {
  background,
  cornerRadius,
  interactiveDismissDisabled,
  presentationDetents,
  presentationDragIndicator,
  type PresentationDetent,
} from '@expo/ui/swift-ui/modifiers';

type SheetDetent = 'auto' | number;
type SwiftDetent = 'medium' | 'large' | { fraction: number } | { height: number };
const AUTO_DETENT_FALLBACK = 0.62;
const DEFAULT_IOS_SHEET_BACKGROUND = DynamicColorIOS({
  light: '#FFFFFF',
  dark: '#1C1C1E',
});

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
  backgroundColor?: string;
  grabber?: boolean;
  dismissible?: boolean;
  onDismiss?: () => void;
  onDidDismiss?: () => void;
  onWillPresent?: () => void;
  onDidPresent?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  maxContentHeight?: number;
  [key: string]: unknown;
}

function resolveDetents(
  detents?: Array<SheetDetent | 'medium' | 'large'>,
  maxContentHeight?: number
): SwiftDetent[] {
  if (!detents?.length) {
    if (typeof maxContentHeight === 'number' && maxContentHeight > 0) {
      return [{ height: maxContentHeight }];
    }
    return [{ fraction: 0.5 }, { fraction: 1 }];
  }

  const mapped = detents
    .map((detent): SwiftDetent | null => {
      if (detent === 'medium' || detent === 'large') {
        return detent;
      }
      if (detent === 'auto') {
        if (typeof maxContentHeight === 'number' && maxContentHeight > 0) {
          return { height: maxContentHeight };
        }
        return { fraction: AUTO_DETENT_FALLBACK };
      }
      if (typeof detent === 'number') {
        if (detent > 0 && detent <= 1) {
          return { fraction: detent };
        }
        if (detent > 1) {
          return { height: detent };
        }
      }
      return null;
    })
    .filter((detent): detent is SwiftDetent => {
      return detent !== null;
    });
  return mapped.length ? mapped : [{ fraction: AUTO_DETENT_FALLBACK }];
}

function IOSTrueSheetImpl(props: ShimTrueSheetProps, ref: ForwardedRef<TrueSheetRef>) {
  const {
    children,
    detents,
    initialDetentIndex = -1,
    cornerRadius: radius = 50,
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
  } = props;

  const mappedDetents = useMemo(() => resolveDetents(detents, maxContentHeight), [detents, maxContentHeight]);
  const [isOpened, setIsOpened] = useState(initialDetentIndex >= 0);
  const [detentIndex, setDetentIndex] = useState(initialDetentIndex >= 0 ? initialDetentIndex : 0);
  const wasOpenedRef = useRef(isOpened);

  const normalizedDetents = useMemo(() => {
    if (!mappedDetents.length) return [{ fraction: AUTO_DETENT_FALLBACK }] as SwiftDetent[];
    const safeIndex = Math.max(0, Math.min(detentIndex, mappedDetents.length - 1));
    return [mappedDetents[safeIndex], ...mappedDetents.filter((_, index) => index !== safeIndex)];
  }, [detentIndex, mappedDetents]);

  const presentationDetentValues = useMemo(() => normalizedDetents as PresentationDetent[], [normalizedDetents]);
  const fitToContents = useMemo(
    () =>
      Boolean(
        detents?.includes('auto') &&
          !(typeof maxContentHeight === 'number' && maxContentHeight > 0)
      ),
    [detents, maxContentHeight]
  );

  const present = useCallback(
    async (index = 0) => {
      onWillPresent?.();
      setDetentIndex(index);
      setIsOpened(true);
    },
    [onWillPresent]
  );

  const dismiss = useCallback(async () => {
    setIsOpened(false);
  }, []);

  const resize = useCallback(async (index: number) => {
    setDetentIndex(index);
  }, []);

  const dismissStack = useCallback(async () => {
    setIsOpened(false);
  }, []);

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
    if (!wasOpenedRef.current && isOpened) {
      onDidPresent?.();
    }
    if (wasOpenedRef.current && !isOpened) {
      onDidDismiss?.();
      onDismiss?.();
    }
    wasOpenedRef.current = isOpened;
  }, [isOpened, onDidDismiss, onDismiss, onDidPresent]);

  const containerModifiers = useMemo(() => {
    const resolvedBackgroundColor = backgroundColor ?? DEFAULT_IOS_SHEET_BACKGROUND;
    return [cornerRadius(radius), background(resolvedBackgroundColor)];
  }, [backgroundColor, radius]);

  const sheetModifiers = useMemo(
    () => [
      presentationDetents(presentationDetentValues),
      presentationDragIndicator(grabber ? 'visible' : 'hidden'),
      interactiveDismissDisabled(!dismissible),
    ],
    [dismissible, grabber, presentationDetentValues]
  );

  return (
    <Host matchContents>
      <BottomSheet
        isPresented={isOpened}
        onIsPresentedChange={setIsOpened}
        fitToContents={fitToContents}
        modifiers={containerModifiers}
        testID={testID}
      >
        <Group modifiers={sheetModifiers}>
          <View style={[{ width: '100%' }, style]}>{children}</View>
        </Group>
      </BottomSheet>
    </Host>
  );
}

export const TrueSheet = forwardRef<TrueSheetRef, ShimTrueSheetProps>(IOSTrueSheetImpl);
TrueSheet.displayName = 'TrueSheet';

export const TrueSheetProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
export const useTrueSheet = () => ({});

export default { TrueSheet, TrueSheetProvider, useTrueSheet };
