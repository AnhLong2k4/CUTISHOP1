import type { Product } from '@cutishop1/contracts';
import { formatVND } from '@cutishop1/contracts';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { useCart } from '../../cart/CartContext';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { styles } from '../../components/styles';
import { api } from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { clampQuantity } from '../../lib/cart';
import { selectVariant, uniqueValues } from '../../lib/products';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { status: authStatus } = useAuth();
  const { addItem, mutating: cartMutating } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState<string | undefined>(undefined);
  const [size, setSize] = useState<string | undefined>(undefined);
  const [quantity, setQuantity] = useState(1);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [cartAdded, setCartAdded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setProduct(await api.getProduct(id));
    } catch (err) {
      setError(apiErrorMessage(err, 'Không tải được chi tiết sản phẩm.'));
    } finally {
      setLoading(false);
    }
  }, [id, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset the quantity whenever the selected variant changes, so a
  // quantity chosen for one variant never leaks into another.
  const selectedSku = product ? selectVariant(product, color, size)?.sku : undefined;
  useEffect(() => {
    setQuantity(1);
  }, [selectedSku]);

  if (loading) return <LoadingState label="Đang tải sản phẩm…" />;
  if (error || !product) {
    return <ErrorState message={error ?? 'Không tìm thấy sản phẩm.'} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  const colors = uniqueValues(product.variants, 'color');
  const sizes = uniqueValues(product.variants, 'size');
  const selected = selectVariant(product, color, size);
  const image = product.images?.[0];
  // selectVariant() returns the first variant when nothing is chosen,
  // which is fine for display but NOT for adding: a variant must be
  // explicitly selected. A dimension only counts as "chosen" when the
  // user picked it, or when the product has no choices in it at all
  // (e.g. a single variant with no colour/size attributes).
  const userSelected =
    (colors.length === 0 || color !== undefined) &&
    (sizes.length === 0 || size !== undefined);
  const addVariant = userSelected ? selected : null;
  const available = addVariant ? (addVariant.available ?? addVariant.quantity) : 0;
  const canAdd = !!addVariant && available > 0 && !cartMutating;
  const maxQty = clampQuantity(999, available);

  const handleAdd = async () => {
    setCartNotice(null);
    setCartAdded(false);
    if (authStatus !== 'authenticated') {
      setCartNotice('Đăng nhập để thêm sản phẩm vào giỏ hàng.');
      router.push('/login');
      return;
    }
    if (!addVariant) {
      setCartNotice('Vui lòng chọn màu và size trước khi thêm vào giỏ.');
      return;
    }
    if (available <= 0) {
      setCartNotice('Biến thể này đã hết hàng.');
      return;
    }
    const qty = clampQuantity(quantity, available);
    const result = await addItem(product.id, addVariant.sku, qty);
    if (result.ok) {
      setCartAdded(true);
    } else if (result.reason === 'login-required') {
      setCartNotice('Đăng nhập để thêm sản phẩm vào giỏ hàng.');
      router.push('/login');
    } else {
      setCartNotice(result.message ?? 'Không thêm được vào giỏ hàng.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      {image && (
        <Image source={{ uri: image }} style={{ width: '100%', height: 320, borderRadius: 12 }} resizeMode="cover" />
      )}
      <Text style={[styles.title, { marginTop: 12 }]}>{product.title}</Text>
      {product.description ? <Text style={styles.subtitle}>{product.description}</Text> : null}
      {selected ? (
        <View>
          <Text style={styles.price}>{formatVND(selected.effectivePrice)}</Text>
          <Text style={styles.muted}>
            SKU {selected.sku} ·{' '}
            {selected.inStock
              ? `Còn ${selected.available ?? selected.quantity} có thể đặt`
              : 'Hết hàng'}
          </Text>
        </View>
      ) : (
        <EmptyState message="Không có biến thể phù hợp với lựa chọn này." />
      )}
      {colors.length > 0 && (
        <View>
          <Text style={styles.label}>Màu</Text>
          <View style={styles.chipRow}>
            {colors.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, color === c && styles.chipSelected]}
                onPress={() => setColor(c)}
              >
                <Text style={[styles.chipText, color === c && styles.chipTextSelected]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      {sizes.length > 0 && (
        <View>
          <Text style={styles.label}>Size</Text>
          <View style={styles.chipRow}>
            {sizes.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, size === s && styles.chipSelected]}
                onPress={() => setSize(s)}
              >
                <Text style={[styles.chipText, size === s && styles.chipTextSelected]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      <View style={styles.qtyRow}>
        <Text style={styles.label}>Số lượng</Text>
        <TouchableOpacity
          style={[styles.qtyButton, quantity <= 1 && styles.buttonDisabled]}
          disabled={quantity <= 1}
          onPress={() => setQuantity((q) => Math.max(1, q - 1))}
        >
          <Text style={styles.qtyButtonText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.cardTitle}>{quantity}</Text>
        <TouchableOpacity
          style={[styles.qtyButton, quantity >= maxQty && styles.buttonDisabled]}
          disabled={quantity >= maxQty}
          onPress={() => setQuantity((q) => clampQuantity(q + 1, available))}
        >
          <Text style={styles.qtyButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      {addVariant && available <= 0 ? (
        <Text style={styles.error}>Biến thể này đã hết hàng.</Text>
      ) : null}
      {!addVariant && (colors.length > 0 || sizes.length > 0) ? (
        <Text style={styles.muted}>Vui lòng chọn màu và size để thêm vào giỏ.</Text>
      ) : null}
      {cartNotice ? <Text style={styles.error}>{cartNotice}</Text> : null}
      {cartAdded ? (
        <Text style={styles.muted}>Đã thêm vào giỏ hàng.</Text>
      ) : null}
      <TouchableOpacity
        style={[styles.button, !canAdd && styles.buttonDisabled]}
        disabled={!canAdd}
        onPress={() => void handleAdd()}
      >
        <Text style={styles.buttonText}>Thêm vào giỏ</Text>
      </TouchableOpacity>
      {cartAdded ? (
        <Link href="/cart" asChild>
          <TouchableOpacity style={styles.ghostButton}>
            <Text style={styles.ghostButtonText}>Xem giỏ hàng →</Text>
          </TouchableOpacity>
        </Link>
      ) : null}
      <Text style={[styles.muted, { marginTop: 16 }]}>
        Giá và tồn kho trên màn hình này là dữ liệu thật từ máy chủ.
        Đặt hàng chưa có trong phase này; khi đặt hàng, hệ thống sẽ
        báo giá và kiểm tra tồn kho lại từ máy chủ.
      </Text>
    </ScrollView>
  );
}
