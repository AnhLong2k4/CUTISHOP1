import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../auth/AuthContext';
import { CartProvider } from '../cart/CartContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <CartProvider>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="index" options={{ title: 'CutiShop' }} />
          <Stack.Screen name="login" options={{ title: 'Đăng nhập' }} />
          <Stack.Screen name="product/[id]" options={{ title: 'Chi tiết sản phẩm' }} />
          <Stack.Screen name="cart" options={{ title: 'Giỏ hàng' }} />
        </Stack>
      </CartProvider>
    </AuthProvider>
  );
}
