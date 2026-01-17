declare module '@sumsub/react-native-mobilesdk-module' {
  export interface SNSMobileSDK {
    launch(): Promise<any>;
    dismiss(): void;
  }
  
  export interface Builder {
    withHandlers(handlers: any): Builder;
    withDebug(debug: boolean): Builder;
    withLocale(locale: string): Builder;
    build(): SNSMobileSDK;
  }

  export function init(accessToken: string, tokenExpirationHandler: () => Promise<string>): Builder;
  export function reset(): void;
  
  const _default: {
      init: typeof init;
      reset: typeof reset;
  };
  export default _default;
}
