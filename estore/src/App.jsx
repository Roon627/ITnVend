import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
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
import Footer from "./components/Footer";

function PublicLayout({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-sky-50 text-slate-800 flex flex-col">
      <header className="border-b border-rose-100 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <Link to="/" className="text-lg font-semibold text-rose-500 transition hover:text-rose-400">
            ITnVend Market Hub
          </Link>
          <nav className="flex items-center gap-4 text-sm text-rose-400">
            <Link to="/market" className="font-semibold hover:text-rose-500">
              Market Hub
            </Link>
            <Link to="/cart" className="font-semibold hover:text-rose-500">
              Cart
            </Link>
            <Link to="/checkout" className="font-semibold hover:text-rose-500">
              Request Proposal
            </Link>
            <Link to="/vendor-onboarding" className="font-semibold hover:text-rose-500">
              Onboarding
            </Link>
          </nav>
        </div>
      </header>
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
