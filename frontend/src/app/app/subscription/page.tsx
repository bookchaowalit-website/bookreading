'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { subscriptionNeedsAttention, subscriptionStatusLabel } from '@/lib/subscriptionStatus';
import { Check, Loader2, ExternalLink, CreditCard, AlertTriangle } from 'lucide-react';

interface PricingPlan {
  id: string;
  name: string;
  price_id: string;
  amount: number;
  currency: string;
  interval: string;
  description: string;
  features: string[];
}

const PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price_id: '',
    amount: 0,
    currency: 'thb',
    interval: 'month',
    description: 'For casual readers',
    features: ['5 chapters/month', 'Basic translation', 'Ads supported', 'EPUB export'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price_id: 'pro',
    amount: 99,
    currency: 'thb',
    interval: 'month',
    description: 'For serious readers',
    features: ['Unlimited chapters', 'Agentic 2-step translation', 'No ads', 'EPUB + PDF export', 'Priority support', 'Custom terminology'],
  },
  {
    id: 'team',
    name: 'Team',
    price_id: 'team',
    amount: 299,
    currency: 'thb',
    interval: 'month',
    description: 'For translation teams',
    features: ['Everything in Pro', 'Shared terminology', 'Collaborative translation', 'API access', 'Team management', 'Review queue'],
  },
];

export default function SubscriptionPage() {
  const { success, error: showError } = useToast();
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const res = await fetch('/api/payments/subscription', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentPlan(data.plan || 'free');
        setStatus(data.status || '');
      }
    } catch {
      // User not logged in or API error
    }
  };

  const handleSubscribe = async (planId: string) => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/payments/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ price_id: planId })
      });
      const data = await res.json();
      if (res.ok && data.session_url) {
        window.location.href = data.session_url;
      } else {
        showError(data.error || 'Failed to create checkout session');
      }
    } catch {
      showError('Failed to create checkout session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setIsPortalLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/payments/stripe/billing-portal', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        showError(data.error || 'Failed to open billing portal');
      }
    } catch {
      showError('Failed to open billing portal');
    } finally {
      setIsPortalLoading(false);
    }
  };

  const isCurrentPlan = (planId: string) => currentPlan === planId;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">💳 การสมัครสมาชิก</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          เลือกแผนที่ต้องการ และจัดการการสมัครสมาชิกของคุณ
        </p>
      </div>

      {/* Current Status */}
      {currentPlan !== 'free' && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-blue-900 dark:text-blue-100">
              แผนปัจจุบัน: {currentPlan.toUpperCase()}
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              สถานะ: {subscriptionStatusLabel(status)}
            </p>
            {subscriptionNeedsAttention(status) && (
              <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">
                กดปุ่มจัดการการชำระเงินเพื่ออัปเดตบัตรหรือชำระยอดค้าง
              </p>
            )}
          </div>
          <button
            onClick={handleManageBilling}
            disabled={isPortalLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isPortalLoading ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
            จัดการการสมัคร
          </button>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`
              relative rounded-2xl border-2 p-6 transition-all
              ${isCurrentPlan(plan.id)
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
          >
            {isCurrentPlan(plan.id) && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">
                แผนปัจจุบัน
              </div>
            )}

            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{plan.description}</p>

            <div className="mt-4 mb-6">
              {plan.amount === 0 ? (
                <span className="text-4xl font-bold text-gray-900 dark:text-white">ฟรี</span>
              ) : (
                <div>
                  <span className="text-4xl font-bold text-gray-900 dark:text-white">฿{plan.amount}</span>
                  <span className="text-gray-500 dark:text-gray-400">/{plan.interval}</span>
                </div>
              )}
            </div>

            <ul className="space-y-3 mb-6">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600 dark:text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>

            {plan.id === 'free' ? (
              <button
                disabled
                className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-xl font-medium cursor-not-allowed"
              >
                แผนปัจจุบัน
              </button>
            ) : isCurrentPlan(plan.id) ? (
              <button
                onClick={handleManageBilling}
                disabled={isPortalLoading}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {isPortalLoading ? <Loader2 size={18} className="animate-spin" /> : <ExternalLink size={18} />}
                จัดการการสมัคร
              </button>
            ) : (
              <button
                onClick={() => handleSubscribe(plan.price_id)}
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                สมัครเลย
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Note */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={20} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-yellow-700 dark:text-yellow-300">
          <p className="font-semibold">หมายเหตุ</p>
          <p>การชำระเงินผ่าน Stripe รองรับบัตร kredit, พร้อมเพย์ และวิธีการชำระเงินอื่นๆ การสมัครสมาชิกสามารถยกเลิกได้ตลอดเวลา</p>
        </div>
      </div>
    </div>
  );
}
