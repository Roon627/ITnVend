import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Footer from "./components/Footer";
import PublicNavbar from "./components/PublicNavbar";
import PublicFallback from "./components/PublicFallback";
import { OrderSummaryProvider } from "./components/checkout/OrderSummaryContext";
const Home = lazy(() => import("./pages/Home"));
const PublicProducts = lazy(() => import("./pages/PublicProducts"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const AccountDetails = lazy(() => import("./pages/AccountDetails"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation"));
const VendorOnboarding = lazy(() => import("./pages/VendorOnboarding"));
const SellWithUs = lazy(() => import("./pages/SellWithUs"));
const Privacy = lazy(() => import("./pages/Privacy"));
const UsePolicy = lazy(() => import("./pages/UsePolicy"));
const UseGlobal = lazy(() => import("./pages/UseGlobal"));
const UseMV = lazy(() => import("./pages/UseMV"));
const Contact = lazy(() => import("./pages/Contact"));
const ShopAndShip = lazy(() => import("./pages/ShopAndShip"));
const Socials = lazy(() => import("./pages/Socials"));
const VendorProfile = lazy(() => import("./pages/VendorProfile"));
const VendorDirectory = lazy(() => import("./pages/VendorDirectory"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const VendorResetPassword = lazy(() => import("./pages/VendorResetPassword"));
const VendorLogin = lazy(() => import("./pages/VendorLogin"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PublicLayout({ children }) {
  return (
    <OrderSummaryProvider>
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-[#fdf6f0] via-[#f6e5f5] to-[#f0dcff] text-slate-800">
        <a
          href="#main-content"
          className="absolute left-4 top-4 z-50 -translate-y-20 rounded-full bg-white px-4 py-2 text-sm font-semibold text-rose-500 shadow transition focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          Skip to content
        </a>
        <PublicNavbar />
        <main id="main-content" className="flex-1">
          <Suspense fallback={<PublicFallback />}>{children}</Suspense>
        </main>
        <Footer />
      </div>
    </OrderSummaryProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
        <Route path="/home" element={<PublicLayout><Home /></PublicLayout>} />
        <Route path="/market" element={<PublicLayout><PublicProducts /></PublicLayout>} />
        <Route path="/store" element={<Navigate to="/market" replace />} />
        <Route path="/product/:id" element={<PublicLayout><ProductDetail /></PublicLayout>} />
        <Route path="/cart" element={<PublicLayout><Cart /></PublicLayout>} />
        <Route path="/checkout" element={<PublicLayout><Checkout /></PublicLayout>} />
        <Route path="/confirmation" element={<PublicLayout><OrderConfirmation /></PublicLayout>} />
        <Route path="/vendor-onboarding" element={<PublicLayout><VendorOnboarding /></PublicLayout>} />
        <Route path="/sell" element={<PublicLayout><SellWithUs /></PublicLayout>} />
        <Route path="/vendors" element={<PublicLayout><VendorDirectory /></PublicLayout>} />
        <Route path="/vendors/:slug" element={<PublicLayout><VendorProfile /></PublicLayout>} />
        <Route path="/contact" element={<PublicLayout><Contact /></PublicLayout>} />
    <Route path="/shop-and-ship" element={<PublicLayout><ShopAndShip /></PublicLayout>} />
  <Route path="/socials" element={<PublicLayout><Socials /></PublicLayout>} />
        <Route path="/privacy" element={<PublicLayout><Privacy /></PublicLayout>} />
        <Route path="/use" element={<PublicLayout><UsePolicy /></PublicLayout>} />
        <Route path="/use/global" element={<PublicLayout><UseGlobal /></PublicLayout>} />
        <Route path="/use/mv" element={<PublicLayout><UseMV /></PublicLayout>} />
        <Route path="/settings/account-details" element={<PublicLayout><AccountDetails /></PublicLayout>} />
        <Route path="/reset-password" element={<PublicLayout><ResetPassword /></PublicLayout>} />
        <Route path="/vendor/login" element={<PublicLayout><VendorLogin /></PublicLayout>} />
        <Route path="/vendor/reset-password" element={<PublicLayout><VendorResetPassword /></PublicLayout>} />
        <Route path="*" element={<PublicLayout><NotFound /></PublicLayout>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
