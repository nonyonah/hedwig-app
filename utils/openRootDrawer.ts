import { DrawerActions, type NavigationProp, type ParamListBase } from '@react-navigation/native';

export function openRootDrawer(navigation: NavigationProp<ParamListBase>) {
  let current: any = navigation;
  const candidates: any[] = [];

  while (current) {
    candidates.push(current);
    const state = current.getState?.();
    if (state?.type === 'drawer') {
      current.dispatch(DrawerActions.openDrawer());
      return true;
    }
    current = current.getParent?.();
  }

  for (const candidate of candidates.reverse()) {
    try {
      candidate.dispatch(DrawerActions.openDrawer());
      return true;
    } catch {
      // Try the next navigator in the chain.
    }
  }

  navigation.dispatch(DrawerActions.openDrawer());
  return false;
}
