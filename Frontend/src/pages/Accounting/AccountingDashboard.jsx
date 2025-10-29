import React from 'react';

export default function AccountingDashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Accounting Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-blue-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-blue-500 rounded-lg">
              <span className="text-white text-xl">📊</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-blue-600">Total Accounts</p>
              <p className="text-2xl font-bold text-blue-900">--</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-green-500 rounded-lg">
              <span className="text-white text-xl">💰</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-green-600">Outstanding Payables</p>
              <p className="text-2xl font-bold text-green-900">--</p>
            </div>
          </div>
        </div>
        <div className="bg-yellow-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-500 rounded-lg">
              <span className="text-white text-xl">💳</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-yellow-600">Outstanding Receivables</p>
              <p className="text-2xl font-bold text-yellow-900">--</p>
            </div>
          </div>
        </div>
        <div className="bg-purple-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-purple-500 rounded-lg">
              <span className="text-white text-xl">📈</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-purple-600">Net Income</p>
              <p className="text-2xl font-bold text-purple-900">--</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
