import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#555', marginBottom: 12 },
  muted: { fontSize: 14, color: '#666', textAlign: 'center' },
  error: { fontSize: 14, color: '#b91c1c', textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 12,
  },
  button: {
    backgroundColor: '#0f766e', borderRadius: 8, paddingVertical: 12,
    paddingHorizontal: 16, alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  ghostButton: {
    borderWidth: 1, borderColor: '#0f766e', borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', marginTop: 8,
  },
  ghostButtonText: { color: '#0f766e', fontSize: 15, fontWeight: '600' },
  card: {
    borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12,
    padding: 12, marginBottom: 12, gap: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  price: { fontSize: 16, fontWeight: '700', color: '#0f766e' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipSelected: { borderColor: '#0f766e', backgroundColor: '#ccfbf1' },
  chipText: { fontSize: 14 },
  chipTextSelected: { fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 12, marginBottom: 6 },
});
