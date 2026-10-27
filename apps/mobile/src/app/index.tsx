import type { Category, Product } from '@cutishop1/contracts';
import { formatVND } from '@cutishop1/contracts';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { styles } from '../components/styles';
import { api } from '../lib/api';
import { apiErrorMessage, isSessionExpired } from '../lib/apiError';
import { API_BASE_URL } from '../lib/config';

export default function CatalogScreen() {
  const { user, status, logout } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(
    async (pageToLoad: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await api.getProducts({
          page: pageToLoad,
          limit: 20,
          search: submittedSearch || undefined,
          category: category || undefined,
          sort: 'newest',
        });
        setProducts((prev) => (append ? [...prev, ...data.items] : data.items));
        setTotalPages(data.pagination.totalPages);
        setPage(pageToLoad);
      } catch (err) {
        if (isSessionExpired(err)) {
          // Catalog is public, so a 401 here means a stale session was
          // attached; the auth provider will clear it on next restore.
          setError('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
        } else {
          setError(apiErrorMessage(err, 'Không tải được danh sách sản phẩm.'));
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [submittedSearch, category, reloadKey],
  );

  useEffect(() => {
    void api
      .getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    void load(1, false);
  }, [load]);

  if (status === 'loading' || loading) {
    return <LoadingState label="Đang tải sản phẩm…" />;
  }
  if (error && products.length === 0) {
    return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CutiShop</Text>
      <Text style={styles.subtitle}>
        {user ? `Xin chào, ${user.name}` : 'Danh mục sản phẩm từ máy chủ thật.'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {user ? (
          <TouchableOpacity style={styles.ghostButton} onPress={() => void logout()}>
            <Text style={styles.ghostButtonText}>Đăng xuất</Text>
          </TouchableOpacity>
        ) : (
          <Link href="/login" asChild>
            <TouchableOpacity style={styles.ghostButton}>
              <Text style={styles.ghostButtonText}>Đăng nhập</Text>
            </TouchableOpacity>
          </Link>
        )}
      </View>
      <TextInput
        style={[styles.input, { marginTop: 12 }]}
        placeholder="Tìm sản phẩm…"
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={() => setSubmittedSearch(search.trim())}
        returnKeyType="search"
      />
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={[styles.chip, category === '' && styles.chipSelected]}
          onPress={() => setCategory('')}
        >
          <Text style={[styles.chipText, category === '' && styles.chipTextSelected]}>Tất cả</Text>
        </TouchableOpacity>
        {categories.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.chip, category === c.slug && styles.chipSelected]}
            onPress={() => setCategory(c.slug)}
          >
            <Text style={[styles.chipText, category === c.slug && styles.chipTextSelected]}>
              {c.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {products.length === 0 ? (
        <EmptyState message="Không có sản phẩm nào phù hợp." />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          onRefresh={() => void load(1, false)}
          refreshing={loading}
          ListFooterComponent={
            page < totalPages ? (
              <TouchableOpacity
                style={[styles.button, loadingMore && styles.buttonDisabled]}
                disabled={loadingMore}
                onPress={() => void load(page + 1, true)}
              >
                <Text style={styles.buttonText}>
                  {loadingMore ? 'Đang tải…' : 'Tải thêm'}
                </Text>
              </TouchableOpacity>
            ) : undefined
          }
          renderItem={({ item }) => (
            <Link href={`/product/${item.id}`} asChild>
              <TouchableOpacity style={styles.card}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.price}>
                  {formatVND(item.priceRange.min)}
                  {item.priceRange.max !== item.priceRange.min
                    ? ` – ${formatVND(item.priceRange.max)}`
                    : ''}
                </Text>
                <Text style={styles.muted}>
                  {item.inStock
                    ? `Còn hàng (${item.totalAvailable ?? item.totalStock} có thể đặt)`
                    : 'Hết hàng'}
                </Text>
              </TouchableOpacity>
            </Link>
          )}
        />
      )}
      <Text style={[styles.muted, { marginTop: 8 }]}>API: {API_BASE_URL}</Text>
    </View>
  );
}
