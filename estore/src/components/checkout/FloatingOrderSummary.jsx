import { useEffect, useMemo, useState } from 'react';
import { useCart } from '../../components/CartContext';
import { useSettings } from '../../components/SettingsContext';
import OrderSummaryDrawer from './OrderSummaryDrawer';
import { useOrderSummaryControls } from './OrderSummaryContext';

const DELIVERY_FALLBACK = { label: 'Delivery', fee: 0 };

export default function FloatingOrderSummary() {
  const { cart } = useCart();
  const { formatCurrency } = useSettings();
  const { override } = useOrderSummaryControls() || {};
  const [open, setOpen] = useState(false);

  const summaryItems = useMemo(
    () => (override?.items && Array.isArray(override.items) ? override.items : cart),
    [override?.items, cart]
  );
  const deliveryFee = override?.deliveryFee ?? DELIVERY_FALLBACK.fee;
  const deliveryLabel = override?.deliveryLabel || DELIVERY_FALLBACK.label;
  const discount = override?.discount ?? 0;
  const triggerLabel = override?.triggerLabel || 'View cart';
  const hideDrawer = override?.hide === true;

  useEffect(() => {
    if (!summaryItems.length) {
      setOpen(false);
    }
  }, [summaryItems.length]);

  if (hideDrawer || typeof formatCurrency !== 'function') {
    return null;
  }

  return (
    <OrderSummaryDrawer
      open={open}
      onClose={(next) => setOpen(Boolean(next))}
      items={summaryItems}
      formatCurrency={formatCurrency}
      deliveryFee={deliveryFee}
      discount={discount}
      deliveryLabel={deliveryLabel}
      triggerLabel={triggerLabel}
    />
  );
}
