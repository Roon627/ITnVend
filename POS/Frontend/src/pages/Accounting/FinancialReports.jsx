import React, { useState } from 'react';
import { useSettings } from '../../components/SettingsContext';

export default function FinancialReports({ trialBalance = [], balanceSheet = {}, profitLoss = {} }) {
  const { formatCurrency } = useSettings();
  const [activeReport, setActiveReport] = useState('trial-balance');

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Financial Reports</h2>

      <div className="mb-6">
        <nav className="flex space-x-8" aria-label="Report Tabs">
          {[
            { id: 'trial-balance', label: 'Trial Balance' },
            { id: 'balance-sheet', label: 'Balance Sheet' },
            { id: 'profit-loss', label: 'Profit & Loss' }
          ].map((report) => (
            <button
              key={report.id}
              onClick={() => setActiveReport(report.id)}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                activeReport === report.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {report.label}
            </button>
          ))}
        </nav>
      </div>

      {activeReport === 'trial-balance' && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Trial Balance</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Debit
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Credit
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {trialBalance.map((account) => (
                  <tr key={account.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {account.account_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {account.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                      {account.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      {formatCurrency(account.debit_total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      {formatCurrency(account.credit_total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      {formatCurrency(account.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === 'balance-sheet' && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Balance Sheet</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-lg font-medium mb-4">Assets</h4>
              <div className="space-y-2">
                {balanceSheet.assets?.map((asset) => (
                    <div key={asset.account_number} className="flex justify-between">
                    <span>{asset.name}</span>
                    <span>{formatCurrency(asset.balance)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                    <div className="flex justify-between">
                    <span>Total Assets</span>
                    <span>{formatCurrency(balanceSheet.totals?.assets)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-lg font-medium mb-4">Liabilities & Equity</h4>
              <div className="space-y-2">
                {balanceSheet.liabilities?.map((liability) => (
                    <div key={liability.account_number} className="flex justify-between">
                    <span>{liability.name}</span>
                    <span>{formatCurrency(liability.balance)}</span>
                  </div>
                ))}
                {balanceSheet.equity?.map((equity) => (
                  <div key={equity.account_number} className="flex justify-between">
                    <span>{equity.name}</span>
                    <span>{formatCurrency(equity.balance)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                    <div className="flex justify-between">
                    <span>Total Liabilities & Equity</span>
                    <span>{formatCurrency(balanceSheet.totals?.liabilitiesAndEquity)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeReport === 'profit-loss' && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Profit & Loss Statement</h3>
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-medium mb-4">Revenue</h4>
              <div className="space-y-2">
                {profitLoss.revenue?.map((rev) => (
                  <div key={rev.account_number} className="flex justify-between">
                    <span>{rev.name}</span>
                    <span>{formatCurrency(rev.amount)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                    <div className="flex justify-between">
                    <span>Total Revenue</span>
                    <span>{formatCurrency(profitLoss.totals?.revenue)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-lg font-medium mb-4">Expenses</h4>
              <div className="space-y-2">
                {profitLoss.expenses?.map((exp) => (
                  <div key={exp.account_number} className="flex justify-between">
                    <span>{exp.name}</span>
                    <span>{formatCurrency(exp.amount)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                    <div className="flex justify-between">
                    <span>Total Expenses</span>
                    <span>{formatCurrency(profitLoss.totals?.expenses)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between text-xl font-bold">
                <span>Net Income</span>
                <span>{formatCurrency(profitLoss.totals?.netIncome)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
