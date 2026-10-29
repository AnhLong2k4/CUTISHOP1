import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { styles } from '../components/styles';
import { apiErrorMessage } from '../lib/apiError';
import { API_BASE_URL } from '../lib/config';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Nhập email và mật khẩu.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace('/');
    } catch (err) {
      // Backend login returns a generic 401 for wrong credentials, so
      // the message below does not reveal whether the email exists.
      setError(apiErrorMessage(err, 'Đăng nhập thất bại. Kiểm tra email và mật khẩu.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Đăng nhập</Text>
      <Text style={styles.subtitle}>
        Tài khoản CutiShop của bạn. Token chỉ lưu trong SecureStore của thiết bị.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextInput
        style={styles.input}
        placeholder="Mật khẩu"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={() => void submit()}
      >
        <Text style={styles.buttonText}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</Text>
      </TouchableOpacity>
      <Link href="/" asChild>
        <TouchableOpacity style={styles.ghostButton}>
          <Text style={styles.ghostButtonText}>Xem sản phẩm không cần đăng nhập</Text>
        </TouchableOpacity>
      </Link>
      <Text style={[styles.muted, { marginTop: 16 }]}>API: {API_BASE_URL}</Text>
      <Text style={styles.muted}>
        Thiết bị thật cần đặt EXPO_PUBLIC_API_BASE_URL trỏ tới IP LAN của máy chạy backend.
      </Text>
    </View>
  );
}
