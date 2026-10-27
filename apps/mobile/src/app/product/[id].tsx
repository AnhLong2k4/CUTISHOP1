import type { Product } from '@cutishop1/contracts';
import { formatVND } from '@cutishop1/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { styles } from '../../components/styles';
import { api } from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { selectVariant, uniqueValues } from '../../lib/products';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState<string | undefined>(undefined);
  const [size, setSize] = useState<string | undefined>(undefined);
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

  if (loading) return <LoadingState label="Đang tải sản phẩm…" />;
  if (error || !product) {
    return <ErrorState message={error ?? 'Không tìm thấy sản phẩm.'} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  const colors = uniqueValues(product.variants, 'color');
  const sizes = uniqueValues(product.variants, 'size');
  const selected = selectVariant(product, color, size);
  const image = product.images?.[0];

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
      <Text style={[styles.muted, { marginTop: 16 }]}>
        Giỏ hàng và đặt hàng chưa có trong Phase 1 này. Giá và tồn kho trên màn hình này
        là dữ liệu thật từ máy chủ.
      </Text>
    </ScrollView>
  );
}
