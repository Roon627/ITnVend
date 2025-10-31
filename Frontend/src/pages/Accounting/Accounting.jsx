// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { useSettings } from '../../components/SettingsContext';
import ADashboard from './AccountingDashboard';
import ChartOfAccountsModule from './ChartOfAccounts';
import JournalEntriesModule from './JournalEntries';
import AccountsPayableModule from './AccountsPayable';
import AccountsReceivableModule from './AccountsReceivable';
import FinancialReportsModule from './FinancialReports';

const Accounting = () => {
  const { formatCurrency } = useSettings();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [accountsPayable, setAccountsPayable] = useState([]);
  const [accountsReceivable, setAccountsReceivable] = useState([]);
  const [trialBalance, setTrialBalance] = useState([]);
  const [balanceSheet, setBalanceSheet] = useState({});
  const [profitLoss, setProfitLoss] = useState({});
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'chart-of-accounts': {
          const res = await api.get('/api/accounts');
          setChartOfAccounts(res);
          break;
        }
        case 'journal-entries': {
          const res = await api.get('/api/journal');
          setJournalEntries(res);
          break;
        }
        case 'accounts-payable': {
          const res = await api.get('/api/accounts/payable');
          setAccountsPayable(res);
          break;
        }
        case 'accounts-receivable': {
          const res = await api.get('/api/accounts/receivable');
          setAccountsReceivable(res);
          break;
        }
        case 'reports': {
          const tb = await api.get('/api/accounts/reports/trial-balance');
          const bs = await api.get('/api/accounts/reports/balance-sheet');
          const pl = await api.get('/api/accounts/reports/profit-loss');
          setTrialBalance(tb);
          setBalanceSheet(bs);
          setProfitLoss(pl);
          break;
        }
        default:
          break;
      }
    } catch (error) {
      console.error('Failed to load accounting data:', error);
    } finally {
      setLoading(false);
    }
     
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const renderActiveTab = () => {
    if (loading) return <div className="p-6">Loading...</div>;

    switch (activeTab) {
      case 'dashboard':
        return <ADashboard />;
      case 'chart-of-accounts':
        return <ChartOfAccountsModule data={chartOfAccounts} onRefresh={loadData} />;
      case 'journal-entries':
        return <JournalEntriesModule entries={journalEntries} formatCurrency={formatCurrency} />;
      case 'accounts-payable':
        return <AccountsPayableModule invoices={accountsPayable} onRefresh={loadData} />;
      case 'accounts-receivable':
        return <AccountsReceivableModule receivables={accountsReceivable} onRefresh={loadData} />;
      case 'reports':
        return (
          <FinancialReportsModule
            trialBalance={trialBalance}
            balanceSheet={balanceSheet}
            profitLoss={profitLoss}
          />
        );
      default:
        return <div className="p-6">Unknown module</div>;
    }
  };

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Accounting</h1>

        <nav className="flex flex-wrap gap-2 border-b mb-6">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: '📊' },
            { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: '📋' },
            { id: 'journal-entries', label: 'Journal Entries', icon: '📝' },
            { id: 'accounts-receivable', label: 'Accounts Receivable', icon: '💰' },
            { id: 'accounts-payable', label: 'Accounts Payable', icon: '💳' },
            { id: 'reports', label: 'Reports', icon: '📈' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="mt-4">{renderActiveTab()}</div>
      </div>
    </div>
  );
};

export default Accounting;
