import React, { useState } from 'react';
import { FaCalendarDay, FaCalendarAlt, FaUndo, FaLock, FaCalculator } from 'react-icons/fa';
import DayEnd from './DayEnd';
import MonthlyOperations from './MonthlyOperations';
import ReversePurchases from './ReversePurchases';
import DayClose from './DayClose';

const Operations = () => {
  const [activeTab, setActiveTab] = useState('shift-close');

  const tabs = [
    { id: 'shift-close', label: 'Day Close & Reconciliation', icon: FaLock, component: DayClose },
    { id: 'day-end', label: 'Day End', icon: FaCalendarDay, component: DayEnd },
    { id: 'monthly', label: 'Monthly Operations', icon: FaCalendarAlt, component: MonthlyOperations },
    { id: 'reverse-purchases', label: 'Reverse Purchases', icon: FaUndo, component: ReversePurchases },
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900">Operations</h1>
            <p className="mt-2 text-sm text-gray-600">
              End-of-day operations, monthly processing, purchase reversals, and shift management
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="mb-8">
          <nav className="flex space-x-8" aria-label="Operations Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="bg-white shadow rounded-lg">
          <div className="p-6">
            {ActiveComponent && <ActiveComponent />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Operations;