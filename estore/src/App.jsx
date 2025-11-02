import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import PublicProducts from "./pages/PublicProducts";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import VendorOnboarding from "./pages/VendorOnboarding";
import Privacy from "./pages/Privacy";
import PrivacyGlobal from "./pages/PrivacyGlobal";
import PrivacyMV from "./pages/PrivacyMV";
import UsePolicy from "./pages/UsePolicy";
import UseGlobal from "./pages/UseGlobal";
import UseMV from "./pages/UseMV";
import Contact from "./pages/Contact";
import Footer from "./components/Footer";
import PublicNavbar from "./components/PublicNavbar";

function PublicLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-rose-50 via-white to-sky-50 text-slate-800">
      <a
        href="#main-content"
        className="absolute left-4 top-4 z-50 -translate-y-20 rounded-full bg-white px-4 py-2 text-sm font-semibold text-rose-500 shadow transition focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
      >
        Skip to content
      </a>
      <PublicNavbar />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
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
        <Route path="/contact" element={<PublicLayout><Contact /></PublicLayout>} />
        <Route path="/privacy" element={<PublicLayout><Privacy /></PublicLayout>} />
        <Route path="/privacy/global" element={<PublicLayout><PrivacyGlobal /></PublicLayout>} />
        <Route path="/privacy/mv" element={<PublicLayout><PrivacyMV /></PublicLayout>} />
        <Route path="/use" element={<PublicLayout><UsePolicy /></PublicLayout>} />
        <Route path="/use/global" element={<PublicLayout><UseGlobal /></PublicLayout>} />
        <Route path="/use/mv" element={<PublicLayout><UseMV /></PublicLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
