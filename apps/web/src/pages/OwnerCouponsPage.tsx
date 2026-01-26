import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import api from '../lib/api';

interface Coupon {
    id: string;
    code: string;
    type: 'percent' | 'fixed';
    value: number;
    expiresAt: string | null;
    isActive: boolean;
    usedCount: number;
    maxUses?: number | null;
}

const OwnerCouponsPage = () => {
    const queryClient = useQueryClient();
    const [form, setForm] = useState({ code: '', type: 'percent', value: 20, expiresAt: '', maxUses: '' });
    const [formError, setFormError] = useState<string | null>(null);

    const { data: coupons, isLoading } = useQuery<Coupon[]>({
        queryKey: ['owner-coupons'],
        queryFn: async () => {
            const { data } = await api.get('/owner/coupons');
            return data;
        },
    });

    const createMutation = useMutation({
        mutationFn: (newCoupon: any) => api.post('/owner/coupons', newCoupon),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['owner-coupons'] });
            setForm({ code: '', type: 'percent', value: 20, expiresAt: '', maxUses: '' });
            setFormError(null);
        },
        onError: (error) => {
            if (axios.isAxiosError(error)) {
                const payload = (error.response?.data as any)?.error;
                if (payload && typeof payload === 'object' && 'fieldErrors' in payload) {
                    const fieldErrors = (payload as any).fieldErrors ?? {};
                    const firstError = Object.values(fieldErrors).flat()[0] as string | undefined;
                    setFormError(firstError || 'Coupon could not be created.');
                    return;
                }
                const message = payload?.message || payload || error.message;
                setFormError(message || 'Coupon could not be created.');
                return;
            }
            setFormError('Coupon could not be created.');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/owner/coupons/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-coupons'] }),
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        createMutation.mutate({
            ...form,
            value: Number(form.value),
            expiresAt: form.expiresAt ? new Date(form.expiresAt) : undefined,
            maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        });
    };

    return (
        <div className="p-6 text-slate-100">
            <h1 className="text-2xl font-bold mb-6">Manage Coupons</h1>

            <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/10 mb-8 max-w-2xl">
                <h2 className="text-lg font-semibold mb-4">Create New Coupon</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {formError && (
                        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                            {formError}
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Coupon Code</label>
                            <input
                                type="text"
                                required
                                value={form.code}
                                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
                                placeholder="SUMMER2025"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Discount Type</label>
                            <select
                                value={form.type}
                                onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
                            >
                                <option value="percent">Percentage (%)</option>
                                <option value="fixed">Fixed Amount ($)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Value</label>
                            <input
                                type="number"
                                required
                                min="1"
                                value={form.value}
                                onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Expires At (Optional)</label>
                            <input
                                type="date"
                                value={form.expiresAt}
                                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Max Uses (Optional)</label>
                            <input
                                type="number"
                                min="1"
                                value={form.maxUses}
                                onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={createMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                    >
                        {createMutation.isPending ? 'Creating...' : 'Create Coupon'}
                    </button>
                </form>
            </div>

            <div className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-800/50 border-b border-white/10 text-slate-400">
                            <th className="p-4 font-medium">Code</th>
                            <th className="p-4 font-medium">Discount</th>
                            <th className="p-4 font-medium">Uses</th>
                            <th className="p-4 font-medium">Expires</th>
                            <th className="p-4 font-medium">Status</th>
                            <th className="p-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {isLoading ? (
                            <tr><td colSpan={6} className="p-4 text-center text-slate-500">Loading...</td></tr>
                        ) : coupons?.length === 0 ? (
                            <tr><td colSpan={6} className="p-4 text-center text-slate-500">No coupons found.</td></tr>
                        ) : (
                            coupons?.map((coupon) => (
                                <tr key={coupon.id} className="hover:bg-white/5">
                                    <td className="p-4 font-mono font-bold text-white">{coupon.code}</td>
                                    <td className="p-4 text-slate-300">
                                        {coupon.type === 'percent' ? `${coupon.value}%` : `$${coupon.value}`}
                                    </td>
                                    <td className="p-4 text-slate-300">
                                        {coupon.maxUses ? `${coupon.usedCount}/${coupon.maxUses}` : `${coupon.usedCount}/∞`}
                                    </td>
                                    <td className="p-4 text-slate-300">
                                        {coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString() : 'Never'}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${coupon.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                            {coupon.isActive ? 'ACTIVE' : 'INACTIVE'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => deleteMutation.mutate(coupon.id)}
                                            className="text-sm text-rose-400 hover:text-rose-300 hover:underline"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default OwnerCouponsPage;
