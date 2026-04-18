import { DrawerActions, type NavigationProp, type ParamListBase } from '@react-navigation/native';

export function openRootDrawer(navigation: NavigationProp<ParamListBase>) {
  let current: any = navigation;

  while (current) {
    const state = current.getState?.();
    if (state?.type === 'drawer') {
      current.dispatch(DrawerActions.openDrawer());
      return true;
    }
    current = current.getParent?.();
  }

  navigation.dispatch(DrawerActions.openDrawer());
  return false;
}
