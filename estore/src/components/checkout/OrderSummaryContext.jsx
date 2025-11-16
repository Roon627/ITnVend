/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useMemo, useState } from 'react';

const OrderSummaryContext = createContext({
  override: null,
  setOverride: () => {},
});

export function OrderSummaryProvider({ children }) {
  const [override, setOverride] = useState(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);
  return (
    <OrderSummaryContext.Provider value={value}>
      {children}
    </OrderSummaryContext.Provider>
  );
}

export function useOrderSummaryControls() {
  return useContext(OrderSummaryContext);
}
