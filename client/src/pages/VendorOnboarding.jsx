import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import Footer from '../components/Footer';

export default function VendorOnboarding() {
  const [formData, setFormData] = useState({
    legalName: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    capabilities: '',
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/vendors', {
        legal_name: formData.legalName,
        contact_person: formData.contactPerson,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        website: formData.website,
        capabilities: formData.capabilities,
        notes: formData.notes,
      });
      showToast('Thank you for your submission! We will be in touch shortly.', 'success');
      navigate('/');
    } catch (error) {
      showToast(error.response?.data?.error || 'An error occurred. Please try again.', 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Vendor Onboarding</h1>
          <p className="text-gray-600 mb-8">Partner with ITnVend to deliver exceptional value. Please fill out the form below to begin the registration process.</p>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Vendor Information */}
            <div>
              <h2 className="text-xl font-semibold text-gray-800 border-b pb-2 mb-4">Vendor Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-group">
                  <label htmlFor="legalName" className="block text-sm font-medium text-gray-700">Vendor Legal Name</label>
                  <input type="text" name="legalName" id="legalName" required value={formData.legalName} onChange={handleChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                </div>
                <div className="form-group">
                  <label htmlFor="website" className="block text-sm font-medium text-gray-700">Website (Optional)</label>
                  <input type="url" name="website" id="website" value={formData.website} onChange={handleChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                </div>
              </div>
            </div>

            {/* Contact Person */}
            <div>
              <h2 className="text-xl font-semibold text-gray-800 border-b pb-2 mb-4">Primary Contact</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-group">
                  <label htmlFor="contactPerson" className="block text-sm font-medium text-gray-700">Contact Person</label>
                  <input type="text" name="contactPerson" id="contactPerson" value={formData.contactPerson} onChange={handleChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                </div>
                <div className="form-group">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
                  <input type="email" name="email" id="email" required value={formData.email} onChange={handleChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                </div>
                <div className="form-group">
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone Number</label>
                  <input type="tel" name="phone" id="phone" value={formData.phone} onChange={handleChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                </div>
                <div className="form-group">
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700">Physical Address</label>
                  <input type="text" name="address" id="address" value={formData.address} onChange={handleChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                </div>
              </div>
            </div>

            {/* Capabilities */}
            <div>
              <h2 className="text-xl font-semibold text-gray-800 border-b pb-2 mb-4">Capabilities & Notes</h2>
              <div className="form-group">
                <label htmlFor="capabilities" className="block text-sm font-medium text-gray-700">
                  Core Capabilities & Services Offered
                  <span className="text-gray-500"> (e.g., Hardware Supplier, Certified Installer, Software Developer)</span>
                </label>
                <textarea name="capabilities" id="capabilities" rows="4" value={formData.capabilities} onChange={handleChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"></textarea>
              </div>
              <div className="form-group mt-4">
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Additional Notes (Optional)</label>
                <textarea name="notes" id="notes" rows="3" value={formData.notes} onChange={handleChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"></textarea>
              </div>
            </div>

            {/* Submission */}
            <div className="pt-4 text-right">
              <button type="submit" disabled={isSubmitting} className="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400">
                {isSubmitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}
