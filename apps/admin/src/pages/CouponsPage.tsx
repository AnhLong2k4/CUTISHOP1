import { formatVND } from '@cutishop1/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ErrorState, ghostButton, inputClass, labelClass, LoadingState, primaryButton } from '../components/ui';
import { api } from '../lib/api';

interface CouponRow {
  id: string;
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxDiscount?: number;
  minOrderAmount: number;
  startsAt?: string;
  endsAt?: string;
  isActive: boolean;
  usageLimitTotal?: number;
  usageLimitPerUser?: number;
  usedCount: number;
}

export function CouponsPage() {
  const [items, setItems] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [code, setCode] = useState('');
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [value, setValue] = useState(10);
  const [maxDiscount, setMaxDiscount] = useState(50000);
  const [minOrderAmount, setMinOrderAmount] = useState(0);
  const [usageLimitTotal, setUsageLimitTotal] = useState<number | ''>('');
  const [usageLimitPerUser, setUsageLimitPerUser] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.adminListCoupons({ limit: 100 });
      setItems(page.items as unknown as CouponRow[]);
    } catch {
      setError('Không tải được danh sách mã giảm giá.');
    } finally {
      setLoading(false);
    }
  }, [reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setNotice(null);
    try {
      await api.adminCreateCoupon({
        code: code.trim().toUpperCase(),
        type,
        value,
        maxDiscount: type === 'PERCENT' ? maxDiscount : null,
        minOrderAmount,
        usageLimitTotal: usageLimitTotal === '' ? null : usageLimitTotal,
        usageLimitPerUser: usageLimitPerUser === '' ? null : usageLimitPerUser,
      });
      setCode('');
      setReloadKey((k) => k + 1);
      setNotice('Đã tạo mã giảm giá.');
    } catch (err) {
      const apiCode = (err as { code?: string }).code;
      setNotice(
        apiCode === 'VALIDATION_ERROR'
          ? 'Dữ liệu mã chưa hợp lệ (PERCENT cần value 1–100 và maxDiscount).'
          : 'Không tạo được mã. Mã có thể đã tồn tại.',
      );
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (coupon: CouponRow) => {
    setNotice(null);
    try {
      await api.adminUpdateCoupon(coupon.id, { isActive: !coupon.isActive });
      setReloadKey((k) => k + 1);
    } catch {
      setNotice('Không cập nhật được trạng thái mã.');
    }
  };

  const remove = async (coupon: CouponRow) => {
    setNotice(null);
    try {
      await api.adminDeleteCoupon(coupon.id);
      setNotice(`Đã xóa mã ${coupon.code}.`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      const apiCode = (err as { code?: string }).code;
      setNotice(
        apiCode === 'COUPON_IN_USE'
          ? 'Mã đã được sử dụng, không thể xóa. Hãy vô hiệu hóa thay vì xóa.'
          : 'Không xóa được mã.',
      );
    }
  };

  if (loading) return <LoadingState label="Đang tải mã giảm giá…" />;
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Mã giảm giá</h1>
      {notice && <p role="status" className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{notice}</p>}

      <form onSubmit={(e) => void create(e)} className="mb-6 grid gap-3 rounded-xl border border-neutral-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="coupon-code" className={labelClass}>Mã</label>
          <input id="coupon-code" required value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="coupon-type" className={labelClass}>Loại</label>
          <select id="coupon-type" value={type} onChange={(e) => setType(e.target.value as 'PERCENT' | 'FIXED')} className={inputClass}>
            <option value="PERCENT">Phần trăm (%)</option>
            <option value="FIXED">Số tiền cố định (VND)</option>
          </select>
        </div>
        <div>
          <label htmlFor="coupon-value" className={labelClass}>Giá trị</label>
          <input id="coupon-value" type="number" min={0} required value={value} onChange={(e) => setValue(Number(e.target.value))} className={inputClass} />
        </div>
        {type === 'PERCENT' && (
          <div>
            <label htmlFor="coupon-max" className={labelClass}>Giảm tối đa (VND, bắt buộc với %)</label>
            <input id="coupon-max" type="number" min={0} required value={maxDiscount} onChange={(e) => setMaxDiscount(Number(e.target.value))} className={inputClass} />
          </div>
        )}
        <div>
          <label htmlFor="coupon-min" className={labelClass}>Đơn tối thiểu (VND)</label>
          <input id="coupon-min" type="number" min={0} value={minOrderAmount} onChange={(e) => setMinOrderAmount(Number(e.target.value))} className={inputClass} />
        </div>
        <div>
          <label htmlFor="coupon-total" className={labelClass}>Giới hạn tổng lượt (để trống = không giới hạn)</label>
          <input id="coupon-total" type="number" min={0} value={usageLimitTotal} onChange={(e) => setUsageLimitTotal(e.target.value === '' ? '' : Number(e.target.value))} className={inputClass} />
        </div>
        <div>
          <label htmlFor="coupon-user" className={labelClass}>Giới hạn / người (để trống = không giới hạn)</label>
          <input id="coupon-user" type="number" min={0} value={usageLimitPerUser} onChange={(e) => setUsageLimitPerUser(e.target.value === '' ? '' : Number(e.target.value))} className={inputClass} />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={creating} className={primaryButton}>
            {creating ? 'Đang tạo…' : '+ Tạo mã'}
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Chưa có mã giảm giá nào.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                <th className="px-4 py-3">Mã</th>
                <th className="px-4 py-3">Giảm</th>
                <th className="px-4 py-3">Đơn tối thiểu</th>
                <th className="px-4 py-3">Đã dùng</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((coupon) => (
                <tr key={coupon.id}>
                  <td className="px-4 py-3 font-medium">{coupon.code}</td>
                  <td className="px-4 py-3">
                    {coupon.type === 'PERCENT'
                      ? `${coupon.value}% (tối đa ${formatVND(coupon.maxDiscount ?? 0)})`
                      : formatVND(coupon.value)}
                  </td>
                  <td className="px-4 py-3">{formatVND(coupon.minOrderAmount)}</td>
                  <td className="px-4 py-3">
                    {coupon.usedCount}
                    {coupon.usageLimitTotal !== undefined && coupon.usageLimitTotal !== null
                      ? ` / ${coupon.usageLimitTotal}`
                      : ''}
                  </td>
                  <td className="px-4 py-3">{coupon.isActive ? 'Đang hoạt động' : 'Đã tắt'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="flex justify-end gap-2">
                      <button type="button" className={ghostButton} onClick={() => void toggleActive(coupon)}>
                        {coupon.isActive ? 'Tắt' : 'Bật'}
                      </button>
                      <button type="button" className={ghostButton} onClick={() => void remove(coupon)}>
                        Xóa
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
