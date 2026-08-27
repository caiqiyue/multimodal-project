import { useCallback, useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import { reLaunch, useLoad } from '@tarojs/taro';
import { wechatLoginAndAuth } from '../../lib/auth';

/**
 * Mini-program login screen (feat-121).
 *
 * Behavior:
 *  - On page load, automatically call Taro.login() to grab a wx code.
 *  - POST {code} to /auth/wechat-mini; on success persist tokens and
 *    reLaunch to /pages/chat/index.
 *  - On failure (H5: Taro.login rejects because no wx runtime; weapp without
 *    AppID: same), surface a user-facing error message and a retry button.
 *
 * The retry path re-runs the same flow; we don't expose a manual code input
 * because the mock layer accepts any non-empty code automatically once
 * Taro.login() succeeds. Real WeChat AppID + backend swap is feat-026+feat-037.
 *
 * Taro doesn't pass props from the App component down to pages, so the screen
 * owns its own navigation via Taro.reLaunch (mirrors mobile-app's onLoggedIn
 * callback pattern but platform-native).
 *
 * Default export is required: Taro's page loader resolves the entry by
 * `export default`, not by named export. (Mobile-app uses named exports under
 * Expo/Metro, which is more permissive.)
 */
export default function LoginScreen() {
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const attemptLogin = useCallback(async (): Promise<void> => {
    setErrorMessage(null);
    setIsAuthenticating(true);
    try {
      await wechatLoginAndAuth();
      reLaunch({ url: '/pages/chat/index' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'WeChat login failed';
      setErrorMessage(msg);
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  useLoad(() => {
    void attemptLogin();
  });

  return (
    <View className='login-screen'>
      <View className='login-screen__header'>
        <Text className='login-screen__title'>登录</Text>
        <Text className='login-screen__hint'>使用微信登录继续</Text>
      </View>

      <View className='login-screen__body'>
        {isAuthenticating && errorMessage === null && (
          <Text className='login-screen__status'>正在调用 Taro.login()…</Text>
        )}
        {errorMessage !== null && (
          <Text className='login-screen__error'>{errorMessage}</Text>
        )}
      </View>

      <View className='login-screen__actions'>
        <Button
          className='login-screen__retry'
          onClick={attemptLogin}
          disabled={isAuthenticating}
        >
          {isAuthenticating ? '登录中…' : '重试微信登录'}
        </Button>
      </View>
    </View>
  );
}