import React, { useState } from 'react';
import { useSettings } from '../../components/SettingsContext';

const FinancialReports = ({ data, onExport, lastUpdated }) => {
  const { formatCurrency } = useSettings();
  const [activeReport, setActiveReport] = useState('trial-balance');

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Financial Reports</h2>
        <div className="flex space-x-2">
          {lastUpdated && (
            <div className="text-xs text-gray-500 mr-2" aria-live="polite">Last updated: {new Date(lastUpdated).toLocaleString()}</div>
          )}
          <select
            value={activeReport}
            onChange={(e) => setActiveReport(e.target.value)}
            className="border border-gray-300 rounded-md shadow-sm p-2"
          >
            <option value="trial-balance">Trial Balance</option>
            <option value="balance-sheet">Balance Sheet</option>
            <option value="profit-loss">Profit & Loss</option>
          </select>
          <button
            onClick={() => onExport(
              activeReport === 'trial-balance' ? data.trialBalance || [] :
              activeReport === 'balance-sheet' ? [data.balanceSheet?.totals || {}] :
              [data.profitLoss?.totals || {}],
              `${activeReport}-report.csv`
            )}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Export CSV
          </button>
        </div>
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
                {data.trialBalance?.map((account) => (
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
                {data.balanceSheet?.assets?.map((asset) => (
                  <div key={asset.account_number} className="flex justify-between">
                    <span>{asset.name}</span>
                    <span>{formatCurrency(asset.balance)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                  <div className="flex justify-between">
                    <span>Total Assets</span>
                    <span>{formatCurrency(data.balanceSheet?.totals?.assets)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-lg font-medium mb-4">Liabilities & Equity</h4>
              <div className="space-y-2">
                {data.balanceSheet?.liabilities?.map((liability) => (
                  <div key={liability.account_number} className="flex justify-between">
                    <span>{liability.name}</span>
                    <span>{formatCurrency(liability.balance)}</span>
                  </div>
                ))}
                {data.balanceSheet?.equity?.map((equity) => (
                  <div key={equity.account_number} className="flex justify-between">
                    <span>{equity.name}</span>
                    <span>{formatCurrency(equity.balance)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                  <div className="flex justify-between">
                    <span>Total Liabilities & Equity</span>
                    <span>{formatCurrency(data.balanceSheet?.totals?.liabilitiesAndEquity)}</span>
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
                {data.profitLoss?.revenue?.map((rev) => (
                  <div key={rev.account_number} className="flex justify-between">
                    <span>{rev.name}</span>
                    <span>{formatCurrency(rev.amount)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                  <div className="flex justify-between">
                    <span>Total Revenue</span>
                    <span>{formatCurrency(data.profitLoss?.totals?.revenue)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-lg font-medium mb-4">Expenses</h4>
              <div className="space-y-2">
                {data.profitLoss?.expenses?.map((exp) => (
                  <div key={exp.account_number} className="flex justify-between">
                    <span>{exp.name}</span>
                    <span>{formatCurrency(exp.amount)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                  <div className="flex justify-between">
                    <span>Total Expenses</span>
                    <span>{formatCurrency(data.profitLoss?.totals?.expenses)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between text-xl font-bold">
                <span>Net Income</span>
                <span>{formatCurrency(data.profitLoss?.totals?.netIncome)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialReports;
