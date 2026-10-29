import { formatVND } from '@cutishop1/contracts';
import { Link } from 'expo-router';
import {
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { styles } from '../components/styles';

export default function CartScreen() {
  const { status } = useAuth();
  const {
    items,
    quote,
    imagesByProduct,
    count,
    subtotal,
    canOrder,
    loading,
    mutating,
    error,
    notice,
    sessionExpired,
    quoteErrorCode,
    refresh,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCart();

  if (status === 'loading' || (loading && items.length === 0 && !error)) {
    return <LoadingState label="Đang tải giỏ hàng…" />;
  }

  if (status === 'anonymous' || sessionExpired) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          {sessionExpired
            ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để xem giỏ hàng của bạn.'
            : 'Đăng nhập để xem giỏ hàng của bạn.'}
        </Text>
        <Link href="/login" asChild>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>Đăng nhập</Text>
          </TouchableOpacity>
        </Link>
      </View>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void refresh()} />;
  }

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Giỏ hàng</Text>
        <EmptyState message="Giỏ hàng trống. Hãy chọn một sản phẩm để bắt đầu." />
        <Link href="/" asChild>
          <TouchableOpacity style={styles.ghostButton}>
            <Text style={styles.ghostButtonText}>← Tiếp tục mua sắm</Text>
          </TouchableOpacity>
        </Link>
      </View>
    );
  }

  // The quote failed because a line is no longer valid. Show the raw
  // cart lines (productId/sku/quantity only, no prices) so the user
  // can remove the bad lines and recover; prices return once the
  // quote succeeds again.
  if (quoteErrorCode && !quote) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Giỏ hàng</Text>
        <Text style={styles.error}>
          Có sản phẩm trong giỏ đã ngừng bán hoặc không còn biến thể này.
          Hãy xóa dòng đó rồi tải lại giỏ hàng.
        </Text>
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.productId}:${item.sku}`}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>SKU {item.sku}</Text>
              <Text style={styles.muted}>Số lượng: {item.quantity}</Text>
              <TouchableOpacity
                style={[styles.ghostButton, mutating && styles.buttonDisabled]}
                disabled={mutating}
                onPress={() => void removeItem(item.productId, item.sku)}
              >
                <Text style={styles.ghostButtonText}>Xóa dòng này</Text>
              </TouchableOpacity>
            </View>
          )}
        />
        <TouchableOpacity
          style={[styles.ghostButton, mutating && styles.buttonDisabled]}
          disabled={mutating}
          onPress={() => void clearCart()}
        >
          <Text style={styles.ghostButtonText}>Xóa toàn bộ giỏ hàng</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!quote) {
    return <ErrorState message="Không tải được giỏ hàng." onRetry={() => void refresh()} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.title}>Giỏ hàng ({count})</Text>
        <TouchableOpacity disabled={mutating} onPress={() => void clearCart()}>
          <Text style={styles.dangerText}>Xóa toàn bộ</Text>
        </TouchableOpacity>
      </View>
      {notice ? <Text style={styles.error}>{notice}</Text> : null}
      {!canOrder ? (
        <Text style={styles.error}>
          Có dòng vượt tồn kho có thể đặt. Hãy giảm số lượng trước khi thanh toán.
        </Text>
      ) : null}
      <FlatList
        data={quote.items}
        keyExtractor={(line) => `${line.productId}:${line.sku}`}
        renderItem={({ item: line }) => {
          const image = imagesByProduct[line.productId];
          const atMax = line.quantity >= line.available;
          return (
            <View style={styles.card}>
              <View style={styles.row}>
                {image ? (
                  <Image
                    source={{ uri: image }}
                    style={styles.thumb}
                    resizeMode="cover"
                  />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{line.productTitle}</Text>
                  <Text style={styles.muted}>
                    SKU {line.sku}
                    {[line.color, line.size].filter(Boolean).length > 0 &&
                      ` · ${[line.color, line.size].filter(Boolean).join(' · ')}`}
                  </Text>
                  <Text style={styles.muted}>
                    {formatVND(line.unitPrice)} / sản phẩm · Còn {line.available} có thể đặt
                  </Text>
                </View>
              </View>
              {line.quantity > line.available ? (
                <Text style={styles.error}>
                  Số lượng vượt tồn kho có thể đặt.
                </Text>
              ) : null}
              <View style={styles.qtyRow}>
                <TouchableOpacity
                  style={[styles.qtyButton, mutating && styles.buttonDisabled]}
                  disabled={mutating}
                  onPress={() =>
                    line.quantity <= 1
                      ? void removeItem(line.productId, line.sku)
                      : void updateQuantity(line.productId, line.sku, line.quantity - 1)
                  }
                >
                  <Text style={styles.qtyButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.cardTitle}>{line.quantity}</Text>
                <TouchableOpacity
                  style={[styles.qtyButton, (mutating || atMax) && styles.buttonDisabled]}
                  disabled={mutating || atMax}
                  onPress={() =>
                    void updateQuantity(line.productId, line.sku, line.quantity + 1)
                  }
                >
                  <Text style={styles.qtyButtonText}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ghostButton, mutating && styles.buttonDisabled]}
                  disabled={mutating}
                  onPress={() => void removeItem(line.productId, line.sku)}
                >
                  <Text style={styles.ghostButtonText}>Xóa</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.price}>Thành tiền: {formatVND(line.lineTotal)}</Text>
            </View>
          );
        }}
        ListFooterComponent={
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>Tạm tính</Text>
              <Text style={styles.price}>{formatVND(subtotal ?? 0)}</Text>
            </View>
            {quote.discount > 0 ? (
              <View style={styles.row}>
                <Text style={styles.muted}>Giảm giá</Text>
                <Text style={styles.muted}>−{formatVND(quote.discount)}</Text>
              </View>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.muted}>Phí vận chuyển</Text>
              <Text style={styles.muted}>{formatVND(quote.shipping)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>Tổng</Text>
              <Text style={styles.price}>{formatVND(quote.total)}</Text>
            </View>
            <Text style={styles.muted}>
              Giá và tổng tiền do máy chủ tính. Khi đặt hàng, hệ thống sẽ
              báo giá và kiểm tra tồn kho lại từ máy chủ.
            </Text>
          </View>
        }
      />
    </View>
  );
}
