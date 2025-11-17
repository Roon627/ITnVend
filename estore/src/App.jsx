import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import PublicProducts from "./pages/PublicProducts";
import ProductDetail from "./pages/ProductDetail";
import AccountDetails from "./pages/AccountDetails";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import VendorOnboarding from "./pages/VendorOnboarding";
import SellWithUs from "./pages/SellWithUs";
import Privacy from "./pages/Privacy";
import UsePolicy from "./pages/UsePolicy";
import UseGlobal from "./pages/UseGlobal";
import UseMV from "./pages/UseMV";
import Contact from "./pages/Contact";
import ShopAndShip from "./pages/ShopAndShip";
import Socials from "./pages/Socials";
import Footer from "./components/Footer";
import PublicNavbar from "./components/PublicNavbar";
import { OrderSummaryProvider } from "./components/checkout/OrderSummaryContext";
import VendorProfile from "./pages/VendorProfile";
import VendorDirectory from "./pages/VendorDirectory";
import ResetPassword from "./pages/ResetPassword";
import VendorResetPassword from "./pages/VendorResetPassword";
import VendorLogin from "./pages/VendorLogin";
import NotFound from "./pages/NotFound";

function PublicLayout({ children }) {
  return (
    <OrderSummaryProvider>
      <div className="flex min-h-screen flex-col bg-[#f7f7f7] text-[#111827]">
        <a
          href="#main-content"
          className="absolute left-4 top-4 z-50 -translate-y-20 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#111827] shadow transition focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
        >
          Skip to content
        </a>
        <PublicNavbar />
        <main id="main-content" className="flex-1">
          {children}
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
