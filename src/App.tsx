/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  BarChart3,
  Home,
  Mic,
  Settings,
  Users,
} from 'lucide-react';
import { KhataProvider, useKhata } from './context/KhataContext';
import { CounterScreen } from './components/CounterScreen';
import { CustomersScreen } from './components/CustomersScreen';
import { HomeScreen } from './components/HomeScreen';
import { InsightsScreen } from './components/InsightsScreen';
import { OnboardingFlow } from './components/OnboardingFlow';
import { SettingsScreen } from './components/SettingsScreen';

type NavTab = 'HOME' | 'COUNTER' | 'CUSTOMERS' | 'INSIGHTS' | 'SETTINGS';

const NAV_ITEMS: { id: NavTab; label: string }[] = [
  { id: 'HOME', label: 'Home' },
  { id: 'COUNTER', label: 'Counter' },
  { id: 'CUSTOMERS', label: 'Customers' },
  { id: 'INSIGHTS', label: 'Insights' },
  { id: 'SETTINGS', label: 'Settings' },
];

const KhataWorkspace: React.FC = () => {
  const { loaded, settings } = useKhata();
  const [activeTab, setActiveTab] = useState<NavTab>('HOME');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-[#080D1B] flex items-center justify-center px-6">
        <div className="text-center space-y-2">
          <p className="font-display text-xl font-semibold text-[#F4F7FC]">
            KHATAVERSE
          </p>
          <p className="text-xs text-[#94A3B8]">
            Unlocking encrypted local ledger...
          </p>
        </div>
      </div>
    );
  }

  if (!settings.onboardingComplete) {
    return <OnboardingFlow />;
  }

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setActiveTab('CUSTOMERS');
  };

  const handleTabChange = (tab: NavTab) => {
    if (tab !== 'CUSTOMERS') {
      setSelectedCustomerId(null);
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-[#080D1B] text-[#F4F7FC] flex flex-col">
      {/* Desktop Top Navigation Bar — 3-Zone Contract */}
      <header className="hidden md:flex sticky top-0 z-30 bg-[#080D1B]/90 backdrop-blur-md border-b border-white/[0.08]">
        <div className="max-w-7xl w-full mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => handleTabChange('HOME')}
            className="font-display text-lg font-bold tracking-tight text-[#F4F7FC] whitespace-nowrap shrink-0 cursor-pointer"
          >
            KHATAVERSE
          </button>

          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-6 text-sm font-medium"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabChange(item.id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                    active
                      ? 'text-[#35D6F2] border-[#35D6F2]'
                      : 'text-[#94A3B8] border-transparent hover:text-[#F4F7FC]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => handleTabChange('COUNTER')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#35D6F2] text-[#080D1B] text-xs font-semibold hover:bg-[#5ce0f6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Mic size={14} />
              Open Counter
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Compact Header */}
      <header className="flex md:hidden sticky top-0 z-30 h-12 px-4 items-center justify-between bg-[#080D1B]/90 backdrop-blur-md border-b border-white/[0.08]">
        <span className="font-display text-base font-bold tracking-tight text-[#F4F7FC] whitespace-nowrap">
          KHATAVERSE
        </span>
        {settings.demoMode && (
          <span className="text-[11px] font-medium text-[#FFBD59] whitespace-nowrap">
            Demo Mode
          </span>
        )}
      </header>

      {/* Main Content Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-10">
        {activeTab === 'HOME' && (
          <HomeScreen
            onOpenCounter={() => handleTabChange('COUNTER')}
            onSelectCustomer={handleSelectCustomer}
          />
        )}
        {activeTab === 'COUNTER' && <CounterScreen />}
        {activeTab === 'CUSTOMERS' && (
          <CustomersScreen
            selectedCustomerId={selectedCustomerId}
            onSelectCustomer={setSelectedCustomerId}
          />
        )}
        {activeTab === 'INSIGHTS' && (
          <InsightsScreen onSelectCustomer={handleSelectCustomer} />
        )}
        {activeTab === 'SETTINGS' && <SettingsScreen />}
      </main>

      {/* Mobile-Friendly Bottom Navigation Bar with Prominent Counter Action */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#10182A]/95 backdrop-blur-md border-t border-white/[0.09] px-2"
      >
        <div className="grid grid-cols-5 items-center h-full max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => handleTabChange('HOME')}
            className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${
              activeTab === 'HOME' ? 'text-[#35D6F2]' : 'text-[#94A3B8]'
            }`}
          >
            <Home size={19} />
            <span className="text-[10px] font-medium mt-1">Home</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('CUSTOMERS')}
            className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${
              activeTab === 'CUSTOMERS' ? 'text-[#35D6F2]' : 'text-[#94A3B8]'
            }`}
          >
            <Users size={19} />
            <span className="text-[10px] font-medium mt-1">Customers</span>
          </button>

          {/* Prominent Center Primary Action: COUNTER */}
          <button
            type="button"
            onClick={() => handleTabChange('COUNTER')}
            aria-label="Counter Mode"
            className="flex flex-col items-center justify-center -mt-4 cursor-pointer"
          >
            <span
              className={`h-12 w-12 rounded-2xl flex items-center justify-center border shadow-lg transition-transform active:scale-95 ${
                activeTab === 'COUNTER'
                  ? 'bg-[#35D6F2] text-[#080D1B] border-[#5ce0f6] shadow-[#35D6F2]/30'
                  : 'bg-[#152038] text-[#35D6F2] border-[#35D6F2]/50 shadow-black/40'
              }`}
            >
              <Mic size={22} />
            </span>
            <span
              className={`text-[10px] font-semibold mt-1 ${
                activeTab === 'COUNTER' ? 'text-[#35D6F2]' : 'text-[#F4F7FC]'
              }`}
            >
              Counter
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('INSIGHTS')}
            className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${
              activeTab === 'INSIGHTS' ? 'text-[#35D6F2]' : 'text-[#94A3B8]'
            }`}
          >
            <BarChart3 size={19} />
            <span className="text-[10px] font-medium mt-1">Insights</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('SETTINGS')}
            className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${
              activeTab === 'SETTINGS' ? 'text-[#35D6F2]' : 'text-[#94A3B8]'
            }`}
          >
            <Settings size={19} />
            <span className="text-[10px] font-medium mt-1">Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default function App() {
  return (
    <KhataProvider>
      <KhataWorkspace />
    </KhataProvider>
  );
}
